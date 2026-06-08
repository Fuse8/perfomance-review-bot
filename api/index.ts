import type { Express } from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';

let app: Express | null = null;
let bootstrapError: Error | null = null;

async function getApp(): Promise<Express> {
	if (app) {
		return app;
	}
	if (bootstrapError) {
		throw bootstrapError;
	}

	try {
		const { createApp } = await import('../src/app.js');
		const { loadConfig } = await import('../src/config.js');
		const { createTokenStorage } = await import('../src/storage.js');
		const config = loadConfig();
		const storage = createTokenStorage(config);
		app = createApp(config, storage);
		return app;
	} catch (error) {
		bootstrapError = error instanceof Error ? error : new Error(String(error));
		throw bootstrapError;
	}
}

function isHealthzRequest(url: string | undefined): boolean {
	const path = (url ?? '/').split('?')[0] ?? '/';
	return path === '/healthz';
}

export default async function handler(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	if (isHealthzRequest(req.url)) {
		try {
			await getApp();
			res.statusCode = 200;
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({ ok: true }));
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			console.error('[api] healthz bootstrap failed', { message });
			res.statusCode = 503;
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({ ok: false, error: message }));
		}
		return;
	}

	const expressApp = await getApp();
	await new Promise<void>((resolve, reject) => {
		expressApp(req as never, res as never, (err: unknown) => {
			if (err) {
				reject(err);
				return;
			}
			resolve();
		});
	});
}
