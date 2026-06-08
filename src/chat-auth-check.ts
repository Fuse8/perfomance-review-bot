import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AppConfig } from './config.js';
import { createChatBotAuth } from './google-chat.js';
import type { TokenStorage } from './storage.js';

type ServiceAccountMetadata = {
	clientEmail?: string;
	projectId?: string;
	type?: string;
};

export async function buildAuthCheckReport(
	config: AppConfig,
	storage: TokenStorage,
	chatUserId: string | undefined,
): Promise<string> {
	const lines: string[] = ['Auth check (/check-auth)', ''];

	lines.push('Chat bot (service account)');
	lines.push(...(await formatChatBotAuthCheck(config)));
	lines.push('');

	lines.push('Reviewer OAuth');
	lines.push(...(await formatReviewerAuthCheck(storage, chatUserId)));

	return lines.join('\n');
}

async function formatChatBotAuthCheck(config: AppConfig): Promise<string[]> {
	const lines: string[] = [];
	const configuredPath = config.chatServiceAccountKeyFile;
	const adcEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;

	if (!configuredPath) {
		lines.push('- Config: GOOGLE_SERVICE_ACCOUNT_KEY_FILE is not set');
		lines.push('- Auth mode: Application Default Credentials (ADC)');
	} else {
		lines.push(`- Config key file: ${configuredPath}`);
		lines.push(`- Resolved path: ${resolveKeyFilePath(configuredPath)}`);
		lines.push('- Auth mode: service account key file (from config)');
	}

	if (adcEnv) {
		lines.push(`- GOOGLE_APPLICATION_CREDENTIALS: ${adcEnv}`);
		lines.push(
			'- Note: when config key file is set, Chat auth uses that file; ADC env can still affect other tools',
		);
	} else {
		lines.push('- GOOGLE_APPLICATION_CREDENTIALS: (not set)');
	}

	const keyPath = configuredPath
		? resolveKeyFilePath(configuredPath)
		: undefined;
	if (!keyPath) {
		lines.push(...(await probeChatBotAccessToken(config)));
		return lines;
	}

	if (!existsSync(keyPath)) {
		lines.push('- Key file: MISSING on disk');
		lines.push(...(await probeChatBotAccessToken(config)));
		return lines;
	}

	lines.push('- Key file: found');

	const metadata = await readServiceAccountMetadata(keyPath);
	if (metadata.type && metadata.type !== 'service_account') {
		lines.push(`- JSON type: ${metadata.type} (expected service_account)`);
	}
	if (metadata.clientEmail) {
		lines.push(`- Service account: ${metadata.clientEmail}`);
	} else {
		lines.push('- Service account: could not read client_email from JSON');
	}
	if (metadata.projectId) {
		lines.push(`- Project ID: ${metadata.projectId}`);
	}

	lines.push(...(await probeChatBotAccessToken(config)));
	return lines;
}

async function probeChatBotAccessToken(config: AppConfig): Promise<string[]> {
	try {
		const auth = createChatBotAuth(config);
		const client = await auth.getClient();
		const clientEmail =
			'email' in client && typeof client.email === 'string'
				? client.email
				: '(unknown)';

		const tokenResponse = await auth.getAccessToken();
		const accessToken = normalizeAccessToken(tokenResponse);

		if (!accessToken) {
			return [
				'- Chat token probe: FAILED (empty access token)',
				`- Auth client email: ${clientEmail}`,
			];
		}

		return [
			'- Chat token probe: OK',
			`- Auth client email: ${clientEmail}`,
			`- Token length: ${accessToken.length} chars`,
		];
	} catch (error) {
		return [
			'- Chat token probe: FAILED',
			`- Error: ${formatProbeError(error)}`,
		];
	}
}

async function formatReviewerAuthCheck(
	storage: TokenStorage,
	chatUserId: string | undefined,
): Promise<string[]> {
	if (!chatUserId) {
		return ['- Chat user: not found in event', '- Reviewer token: skipped'];
	}

	const lines = [`- Chat user: ${chatUserId}`];
	const token = await storage.get(chatUserId);

	if (!token) {
		lines.push('- Reviewer token: not saved');
		lines.push('- Action: run OAuth via /review or auth link');
		return lines;
	}

	lines.push(`- Google account: ${token.googleUserEmail}`);
	lines.push(`- Token saved at: ${token.createdAt}`);
	lines.push(`- Refresh token: present (${token.refreshToken.length} chars)`);
	return lines;
}

function resolveKeyFilePath(configuredPath: string): string {
	return path.isAbsolute(configuredPath)
		? configuredPath
		: path.resolve(process.cwd(), configuredPath);
}

async function readServiceAccountMetadata(
	keyPath: string,
): Promise<ServiceAccountMetadata> {
	try {
		const raw = await readFile(keyPath, 'utf8');
		const parsed = JSON.parse(raw) as {
			client_email?: string;
			project_id?: string;
			type?: string;
		};
		return {
			clientEmail: parsed.client_email,
			projectId: parsed.project_id,
			type: parsed.type,
		};
	} catch {
		return {};
	}
}

function normalizeAccessToken(
	tokenResponse: string | null | undefined | { token?: string | null },
): string | undefined {
	if (!tokenResponse) {
		return undefined;
	}
	if (typeof tokenResponse === 'string') {
		return tokenResponse;
	}
	return tokenResponse.token ?? undefined;
}

function formatProbeError(error: unknown): string {
	if (!(error instanceof Error)) {
		return 'Unknown error';
	}

	const payload = extractGoogleErrorPayload(error.message);
	if (payload) {
		return payload;
	}

	return error.message;
}

function extractGoogleErrorPayload(message: string): string | null {
	const jsonStart = message.indexOf('{');
	if (jsonStart === -1) {
		return null;
	}

	try {
		const parsed = JSON.parse(message.slice(jsonStart)) as {
			error?: string;
			error_description?: string;
			error_subtype?: string;
		};
		const parts = [
			parsed.error,
			parsed.error_description,
			parsed.error_subtype ? `subtype=${parsed.error_subtype}` : undefined,
		].filter(Boolean);
		return parts.length > 0 ? parts.join(' | ') : null;
	} catch {
		return null;
	}
}
