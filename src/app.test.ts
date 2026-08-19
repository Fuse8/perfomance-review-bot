import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'vitest';
import type { AppConfig } from './config.js';
import { createApp } from './app.js';
import { OAuthEmailMismatchError, OAuthStateError } from './oauth.js';
import type { AppStorage } from './storage.js';

const config: AppConfig = {
	appBaseUrl: 'https://example.test',
	googleClientId: 'client-id',
	googleClientSecret: 'client-secret',
	googleRedirectUri: 'https://example.test/auth/google/callback',
	oauthStateSecret: 'test-oauth-state-secret-at-least-32-characters',
	chatServiceAccountKeyFile: undefined,
	chatServiceAccountCredentials: undefined,
	reviewReportTemplateId: 'report-template-id',
	internalReviewFormTemplateId: 'internal-form-template-id',
	clientReviewFormTemplateId: 'client-form-template-id',
	employeeEmailDomains: ['fuse8.online'],
	taskCollectDaysBefore: 14,
	taskCheckDaysBefore: 7,
	taskPrepareDaysBefore: 3,
	taskReminderTime: '12:00',
	databaseUrl: 'postgresql://user:pass@localhost:5432/db',
	port: 8080,
};

const storage: AppStorage = {
	async get() {
		return null;
	},
	async save() {},
	async delete() {},
	async getReviewerSettings() {
		return null;
	},
	async saveReviewerSettings() {},
};

test('createApp serves healthz for Vercel/runtime checks', async () => {
	const app = createApp(config, storage);

	const response = await invokeApp(app, 'GET', '/healthz');

	assert.equal(response.statusCode, 200);
	assert.deepEqual(JSON.parse(response.body), { ok: true });
});

test('createApp does not expose a public auth start route', async () => {
	const response = await invokeApp(
		createApp(config, storage),
		'GET',
		'/auth/google/start?chatUserId=users/123',
	);

	assert.equal(response.statusCode, 404);
});

test('OAuth callback returns a helpful HTML 400 for invalid state', async () => {
	const app = createApp(config, storage, {
		async completeOAuth() {
			throw new OAuthStateError();
		},
	});

	const response = await invokeApp(
		app,
		'GET',
		'/auth/google/callback?code=test-code&state=invalid',
	);

	assert.equal(response.statusCode, 400);
	assert.match(response.headers['content-type'] ?? '', /html/);
	assert.match(response.body, /запросите новую ссылку в Google Chat/i);
});

test('OAuth callback returns escaped expected and actual emails on mismatch', async () => {
	const app = createApp(config, storage, {
		async completeOAuth() {
			throw new OAuthEmailMismatchError(
				'expected+<tag>@example.com',
				'actual+<tag>@example.com',
			);
		},
	});

	const response = await invokeApp(
		app,
		'GET',
		'/auth/google/callback?code=test-code&state=valid',
	);

	assert.equal(response.statusCode, 400);
	assert.match(response.body, /expected\+&lt;tag&gt;@example\.com/);
	assert.match(response.body, /actual\+&lt;tag&gt;@example\.com/);
	assert.doesNotMatch(response.body, /<tag>/);
});

test('OAuth callback confirms the connected account', async () => {
	const app = createApp(config, storage, {
		async completeOAuth() {
			return 'reviewer@example.com';
		},
	});

	const response = await invokeApp(
		app,
		'GET',
		'/auth/google/callback?code=test-code&state=valid',
	);

	assert.equal(response.statusCode, 200);
	assert.match(response.headers['content-type'] ?? '', /html/);
	assert.match(response.body, /reviewer@example\.com/);
});

test('OAuth callback rejects missing code or state', async () => {
	for (const url of [
		'/auth/google/callback?state=test-state',
		'/auth/google/callback?code=test-code',
	]) {
		const response = await invokeApp(createApp(config, storage), 'GET', url);
		assert.equal(response.statusCode, 400);
		assert.match(response.body, /Missing code or state/);
	}
});

async function invokeApp(
	app: ReturnType<typeof createApp>,
	method: string,
	url: string,
): Promise<{
	statusCode: number;
	headers: Record<string, string>;
	body: string;
}> {
	const req = new EventEmitter() as EventEmitter & {
		method: string;
		url: string;
		headers: Record<string, string>;
	};
	req.method = method;
	req.url = url;
	req.headers = {};

	const chunks: Buffer[] = [];
	const headers: Record<string, string> = {};

	const res = new EventEmitter() as EventEmitter & {
		statusCode: number;
		setHeader(name: string, value: string): void;
		getHeader(name: string): string | undefined;
		status(code: number): typeof res;
		json(payload: unknown): void;
		send(payload: string): void;
		type(value: string): typeof res;
		redirect(location: string): void;
		end(chunk?: string): void;
		write(chunk: string): void;
	};
	res.statusCode = 200;
	res.setHeader = (name: string, value: string) => {
		headers[name.toLowerCase()] = value;
	};
	res.getHeader = (name: string) => headers[name.toLowerCase()];
	res.status = (code: number) => {
		res.statusCode = code;
		return res;
	};
	res.json = (payload: unknown) => {
		headers['content-type'] = 'application/json; charset=utf-8';
		res.end(JSON.stringify(payload));
	};
	res.send = (payload: string) => {
		res.end(payload);
	};
	res.type = (value: string) => {
		headers['content-type'] = value;
		return res;
	};
	res.redirect = (location: string) => {
		res.statusCode = 302;
		headers.location = location;
		res.end('');
	};
	res.write = (chunk: string) => {
		chunks.push(Buffer.from(chunk));
	};
	res.end = (chunk?: string) => {
		if (chunk) {
			chunks.push(Buffer.from(chunk));
		}
		res.emit('finish');
	};

	const finished = new Promise<void>((resolve, reject) => {
		res.once('finish', resolve);
		res.once('error', reject);
	});

	(app as unknown as { handle(req: unknown, res: unknown): void }).handle(
		req as never,
		res as never,
	);
	req.emit('data', Buffer.from(''));
	req.emit('end');

	await finished;

	return {
		statusCode: res.statusCode,
		headers,
		body: Buffer.concat(chunks).toString('utf8'),
	};
}
