import express from 'express';
import type { AppConfig } from './config.js';
import { handleChatEvent } from './chat.js';
import {
	completeOAuth,
	OAuthEmailMismatchError,
	OAuthStateError,
} from './oauth.js';
import type { AppStorage } from './storage.js';

type AppDeps = {
	handleChatEvent: typeof handleChatEvent;
	completeOAuth: typeof completeOAuth;
};

const defaultDeps: AppDeps = {
	handleChatEvent,
	completeOAuth,
};

export function createApp(
	config: AppConfig,
	storage: AppStorage,
	deps: Partial<AppDeps> = {},
): express.Express {
	const resolvedDeps = { ...defaultDeps, ...deps };
	const app = express();

	app.use(express.json());

	app.get('/healthz', (_req, res) => {
		res.status(200).json({ ok: true });
	});

	app.post('/google-chat/events', async (req, res, next) => {
		try {
			const response = await resolvedDeps.handleChatEvent(
				config,
				storage,
				req.body,
			);
			res.json(response);
		} catch (error) {
			next(error);
		}
	});

	app.get('/auth/google/callback', async (req, res, next) => {
		try {
			const code = String(req.query.code ?? '');
			const state = String(req.query.state ?? '');

			if (!code || !state) {
				res.status(400).send('Missing code or state');
				return;
			}

			const email = await resolvedDeps.completeOAuth(
				config,
				storage,
				code,
				state,
			);
			res.type('html').send(`
        <!doctype html>
        <html lang="ru">
          <head><meta charset="utf-8"><title>Google подключен</title></head>
          <body>
            <h1>Google подключен</h1>
            <p>Аккаунт ${escapeHtml(email)} сохранен. Вернитесь в Google Chat и повторите запуск.</p>
          </body>
        </html>
      `);
		} catch (error) {
			if (error instanceof OAuthStateError) {
				res
					.status(400)
					.type('html')
					.send(
						callbackErrorPage(
							'Ссылка авторизации недействительна',
							'Ссылка повреждена или устарела. Запросите новую ссылку в Google Chat.',
						),
					);
				return;
			}
			if (error instanceof OAuthEmailMismatchError) {
				res
					.status(400)
					.type('html')
					.send(
						callbackErrorPage(
							'Выбран другой Google-аккаунт',
							`Ожидался аккаунт ${error.expectedEmail}, но выбран ${error.actualEmail}. Вернитесь в Google Chat и запросите новую ссылку.`,
						),
					);
				return;
			}
			next(error);
		}
	});

	app.use((_req, res) => {
		res.status(404).send('Not Found');
	});

	app.use(
		(
			error: unknown,
			req: express.Request,
			res: express.Response,
			_next: express.NextFunction,
		) => {
			const message = error instanceof Error ? error.message : 'Unknown error';
			console.error('[server] request failed', {
				method: req.method,
				path: req.path,
				message,
				stack: error instanceof Error ? error.stack : undefined,
			});
			res.status(500).json({ error: message });
		},
	);

	return app;
}

function callbackErrorPage(title: string, message: string): string {
	return `
    <!doctype html>
    <html lang="ru">
      <head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(message)}</p>
      </body>
    </html>
  `;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}
