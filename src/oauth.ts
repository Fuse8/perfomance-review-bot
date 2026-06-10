import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { nanoid } from 'nanoid';
import type { AppConfig } from './config.js';
import type { TokenStorage } from './storage.js';

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
	storage: TokenStorage,
	chatUserId: string,
): Promise<string> {
	const state = nanoid(32);

	await storage.saveOAuthState({
		state,
		chatUserId,
		expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
		createdAt: new Date().toISOString(),
	});

	return createOAuthClient(config).generateAuthUrl({
		access_type: 'offline',
		prompt: 'consent',
		scope: OAUTH_SCOPES,
		state,
	});
}

export async function completeOAuth(
	config: AppConfig,
	storage: TokenStorage,
	code: string,
	state: string,
): Promise<string> {
	const stateData = await storage.consumeOAuthState(state);

	if (!stateData || new Date(stateData.expiresAt).getTime() < Date.now()) {
		throw new Error('OAuth state is missing or expired');
	}

	const client = createOAuthClient(config);
	const { tokens } = await client.getToken(code);

	if (!tokens.refresh_token) {
		throw new Error(
			'Google did not return a refresh token. Revoke access and try again.',
		);
	}

	client.setCredentials(tokens);
	const oauth2 = google.oauth2({ version: 'v2', auth: client });
	const { data } = await oauth2.userinfo.get();

	if (!data.email) {
		throw new Error('Google profile email is missing');
	}

	await storage.save({
		chatUserId: stateData.chatUserId,
		googleUserEmail: data.email,
		refreshToken: tokens.refresh_token,
		createdAt: new Date().toISOString(),
	});

	return data.email;
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
