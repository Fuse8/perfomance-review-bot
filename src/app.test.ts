import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'vitest';
import type { AppConfig } from './config.js';
import { createApp } from './app.js';
import type { AppStorage } from './storage.js';

const config: AppConfig = {
	appBaseUrl: 'https://example.test',
	googleClientId: 'client-id',
	googleClientSecret: 'client-secret',
	googleRedirectUri: 'https://example.test/auth/google/callback',
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
	async saveOAuthState() {},
	async consumeOAuthState() {
		return null;
	},
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

test('createApp redirects auth start requests', async () => {
	const app = createApp(config, storage, {
		async buildAuthUrl() {
			return 'https://accounts.google.com/o/oauth2/v2/auth?state=test';
		},
	});

	const response = await invokeApp(
		app,
		'GET',
		'/auth/google/start?chatUserId=users/123',
	);

	assert.equal(response.statusCode, 302);
	assert.equal(
		response.headers.location,
		'https://accounts.google.com/o/oauth2/v2/auth?state=test',
	);
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
