import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AppConfig } from './config.js';
import type { TokenStorage } from './storage.js';

const OAUTH_STATE_VERSION = 1;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export type OAuthStatePayload = {
	v: 1;
	chatUserId: string;
	email: string;
	expiresAt: string;
};

export class OAuthStateError extends Error {
	constructor() {
		super('OAuth state is invalid or expired');
		this.name = 'OAuthStateError';
	}
}

export class OAuthEmailMismatchError extends Error {
	constructor(
		readonly expectedEmail: string,
		readonly actualEmail: string,
	) {
		super('Google account email does not match Google Chat email');
		this.name = 'OAuthEmailMismatchError';
	}
}

type OAuthGrant = {
	refreshToken: string | null | undefined;
	email: string | null | undefined;
};

type LoadOAuthGrant = (code: string) => Promise<OAuthGrant>;

export const OAUTH_SCOPES = [
	'openid',
	'email',
	'profile',
	'https://www.googleapis.com/auth/drive',
	'https://www.googleapis.com/auth/documents',
	'https://www.googleapis.com/auth/calendar.events',
	'https://www.googleapis.com/auth/directory.readonly',
	'https://www.googleapis.com/auth/forms.body',
];

export function createOAuthClient(config: AppConfig): OAuth2Client {
	return new google.auth.OAuth2(
		config.googleClientId,
		config.googleClientSecret,
		config.googleRedirectUri,
	);
}

export async function buildAuthUrl(
	config: AppConfig,
	chatUserId: string,
	email: string,
): Promise<string> {
	const state = createOAuthState(config, { chatUserId, email });

	return createOAuthClient(config).generateAuthUrl({
		access_type: 'offline',
		prompt: 'consent',
		scope: OAUTH_SCOPES,
		state,
	});
}

export function createOAuthState(
	config: AppConfig,
	identity: { chatUserId: string; email: string },
	now = new Date(),
): string {
	const payload: OAuthStatePayload = {
		v: OAUTH_STATE_VERSION,
		chatUserId: identity.chatUserId,
		email: normalizeEmail(identity.email),
		expiresAt: new Date(now.getTime() + OAUTH_STATE_TTL_MS).toISOString(),
	};
	const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
		'base64url',
	);
	const signature = signOAuthState(config.oauthStateSecret, encodedPayload);
	return `${encodedPayload}.${signature.toString('base64url')}`;
}

export function verifyOAuthState(
	config: AppConfig,
	state: string,
	now = new Date(),
): OAuthStatePayload {
	try {
		const parts = state.split('.');
		if (parts.length !== 2) {
			throw new OAuthStateError();
		}

		const [encodedPayload, encodedSignature] = parts;
		if (
			!encodedPayload ||
			!encodedSignature ||
			!/^[A-Za-z0-9_-]+$/.test(encodedPayload) ||
			!/^[A-Za-z0-9_-]+$/.test(encodedSignature)
		) {
			throw new OAuthStateError();
		}

		const actualSignature = Buffer.from(encodedSignature, 'base64url');
		const expectedSignature = signOAuthState(
			config.oauthStateSecret,
			encodedPayload,
		);
		if (
			actualSignature.length !== expectedSignature.length ||
			!timingSafeEqual(actualSignature, expectedSignature)
		) {
			throw new OAuthStateError();
		}

		const payload: unknown = JSON.parse(
			Buffer.from(encodedPayload, 'base64url').toString('utf8'),
		);
		if (!isOAuthStatePayload(payload)) {
			throw new OAuthStateError();
		}

		const expiresAt = new Date(payload.expiresAt);
		if (
			Number.isNaN(expiresAt.getTime()) ||
			expiresAt.toISOString() !== payload.expiresAt ||
			expiresAt.getTime() <= now.getTime()
		) {
			throw new OAuthStateError();
		}

		return payload;
	} catch (error) {
		if (error instanceof OAuthStateError) {
			throw error;
		}
		throw new OAuthStateError();
	}
}

export async function completeOAuth(
	config: AppConfig,
	storage: TokenStorage,
	code: string,
	state: string,
	loadGrant: LoadOAuthGrant = (oauthCode) =>
		loadGoogleOAuthGrant(config, oauthCode),
): Promise<string> {
	const stateData = verifyOAuthState(config, state);
	const grant = await loadGrant(code);

	if (!grant.refreshToken) {
		throw new Error(
			'Google did not return a refresh token. Revoke access and try again.',
		);
	}
	if (!grant.email?.trim()) {
		throw new Error('Google profile email is missing');
	}
	const actualEmail = normalizeEmail(grant.email);
	if (actualEmail !== stateData.email) {
		throw new OAuthEmailMismatchError(stateData.email, actualEmail);
	}

	await storage.save({
		chatUserId: stateData.chatUserId,
		googleUserEmail: actualEmail,
		refreshToken: grant.refreshToken,
		createdAt: new Date().toISOString(),
	});

	return actualEmail;
}

async function loadGoogleOAuthGrant(
	config: AppConfig,
	code: string,
): Promise<OAuthGrant> {
	const client = createOAuthClient(config);
	const { tokens } = await client.getToken(code);
	if (!tokens.refresh_token) {
		return { refreshToken: tokens.refresh_token, email: undefined };
	}
	client.setCredentials(tokens);
	const oauth2 = google.oauth2({ version: 'v2', auth: client });
	const { data } = await oauth2.userinfo.get();
	return {
		refreshToken: tokens.refresh_token,
		email: data.email,
	};
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function signOAuthState(secret: string, encodedPayload: string): Buffer {
	return createHmac('sha256', secret).update(encodedPayload).digest();
}

function isOAuthStatePayload(value: unknown): value is OAuthStatePayload {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const payload = value as Record<string, unknown>;
	return (
		Object.keys(payload).length === 4 &&
		payload.v === OAUTH_STATE_VERSION &&
		typeof payload.chatUserId === 'string' &&
		payload.chatUserId.trim() === payload.chatUserId &&
		payload.chatUserId.length > 0 &&
		typeof payload.email === 'string' &&
		payload.email.length > 0 &&
		normalizeEmail(payload.email) === payload.email &&
		typeof payload.expiresAt === 'string'
	);
}

export async function getReviewerName(
	config: AppConfig,
	refreshToken: string,
): Promise<string | null> {
	const client = createOAuthClient(config);
	client.setCredentials({ refresh_token: refreshToken });

	try {
		const oauth2 = google.oauth2({ version: 'v2', auth: client });
		const { data } = await oauth2.userinfo.get();
		return data.name?.trim() || null;
	} catch {
		return null;
	}
}
