import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test, vi } from 'vitest';
import type { AppConfig } from './config.js';
import type { ReviewerToken } from './types.js';
import {
	createOAuthState,
	completeOAuth,
	OAuthEmailMismatchError,
	OAuthStateError,
	OAUTH_SCOPES,
	verifyOAuthState,
} from './oauth.js';

const config = {
	oauthStateSecret: 'test-oauth-state-secret-at-least-32-characters',
} as AppConfig;

const now = new Date('2026-08-19T10:00:00.000Z');

test('OAuth scopes include Google Calendar events access', () => {
	assert.ok(
		OAUTH_SCOPES.includes('https://www.googleapis.com/auth/calendar.events'),
	);
});

test('OAuth scopes include Google Workspace directory read access', () => {
	assert.ok(
		OAUTH_SCOPES.includes('https://www.googleapis.com/auth/directory.readonly'),
	);
});

test('OAuth scopes include Google Forms body access', () => {
	assert.ok(
		OAUTH_SCOPES.includes('https://www.googleapis.com/auth/forms.body'),
	);
});

test('OAuth scopes do not include Google Chat message delivery access', () => {
	assert.ok(
		!OAUTH_SCOPES.includes(
			'https://www.googleapis.com/auth/chat.messages.create',
		),
	);
});

test('OAuth state round-trips the normalized Chat identity', () => {
	const state = createOAuthState(
		config,
		{ chatUserId: 'users/123', email: ' Reviewer@Example.COM ' },
		now,
	);

	assert.deepEqual(verifyOAuthState(config, state, now), {
		v: 1,
		chatUserId: 'users/123',
		email: 'reviewer@example.com',
		expiresAt: '2026-08-19T10:10:00.000Z',
	});
});

test('OAuth state rejects a changed payload', () => {
	const state = createOAuthState(
		config,
		{ chatUserId: 'users/123', email: 'reviewer@example.com' },
		now,
	);
	const [payload, signature] = state.split('.');
	const changedPayload = Buffer.from(
		JSON.stringify({
			v: 1,
			chatUserId: 'users/456',
			email: 'reviewer@example.com',
			expiresAt: '2026-08-19T10:10:00.000Z',
		}),
	).toString('base64url');

	assert.notEqual(payload, changedPayload);
	assert.throws(
		() => verifyOAuthState(config, `${changedPayload}.${signature}`, now),
		OAuthStateError,
	);
});

test('OAuth state rejects a wrong signature', () => {
	const state = createOAuthState(
		config,
		{ chatUserId: 'users/123', email: 'reviewer@example.com' },
		now,
	);
	const [payload] = state.split('.');
	const wrongSignature = Buffer.alloc(32, 1).toString('base64url');

	assert.throws(
		() => verifyOAuthState(config, `${payload}.${wrongSignature}`, now),
		OAuthStateError,
	);
});

test('OAuth state rejects an expired link', () => {
	const state = createOAuthState(
		config,
		{ chatUserId: 'users/123', email: 'reviewer@example.com' },
		now,
	);

	assert.throws(
		() => verifyOAuthState(config, state, new Date('2026-08-19T10:10:00.000Z')),
		OAuthStateError,
	);
});

test('OAuth state rejects an unknown payload version', () => {
	const payload = Buffer.from(
		JSON.stringify({
			v: 2,
			chatUserId: 'users/123',
			email: 'reviewer@example.com',
			expiresAt: '2026-08-19T10:10:00.000Z',
		}),
	).toString('base64url');
	const signature = createHmac('sha256', config.oauthStateSecret)
		.update(payload)
		.digest('base64url');

	assert.throws(
		() => verifyOAuthState(config, `${payload}.${signature}`, now),
		OAuthStateError,
	);
});

test('OAuth state rejects malformed input', () => {
	for (const state of ['', 'one-part', 'a.b.c', '%%%.%%%']) {
		assert.throws(() => verifyOAuthState(config, state, now), OAuthStateError);
	}
});

test('OAuth completion saves a refresh token when Google email matches Chat email', async () => {
	const savedTokens: ReviewerToken[] = [];
	const storage = {
		async get() {
			return null;
		},
		async save(token: ReviewerToken) {
			savedTokens.push(token);
		},
		async delete() {},
	};
	const state = createOAuthState(config, {
		chatUserId: 'users/123',
		email: ' Reviewer@Example.COM ',
	});

	const email = await completeOAuth(
		config,
		storage,
		'code',
		state,
		async () => ({
			refreshToken: 'refresh-token',
			email: ' reviewer@example.com ',
		}),
	);

	assert.equal(email, 'reviewer@example.com');
	assert.equal(savedTokens.length, 1);
	assert.deepEqual(
		{
			chatUserId: savedTokens[0]?.chatUserId,
			googleUserEmail: savedTokens[0]?.googleUserEmail,
			refreshToken: savedTokens[0]?.refreshToken,
		},
		{
			chatUserId: 'users/123',
			googleUserEmail: 'reviewer@example.com',
			refreshToken: 'refresh-token',
		},
	);
	assert.match(savedTokens[0]?.createdAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
});

test('OAuth completion does not save a token when Google email differs', async () => {
	let saveCalled = false;
	const storage = {
		async get() {
			return null;
		},
		async save() {
			saveCalled = true;
		},
		async delete() {},
	};
	const state = createOAuthState(config, {
		chatUserId: 'users/123',
		email: 'expected@example.com',
	});

	await assert.rejects(
		() =>
			completeOAuth(config, storage, 'code', state, async () => ({
				refreshToken: 'refresh-token',
				email: 'actual@example.com',
			})),
		(error: unknown) => {
			assert.ok(error instanceof OAuthEmailMismatchError);
			assert.equal(error.expectedEmail, 'expected@example.com');
			assert.equal(error.actualEmail, 'actual@example.com');
			return true;
		},
	);
	assert.equal(saveCalled, false);
});

test('OAuth completion validates state before exchanging the code', async () => {
	let loadGrantCalled = false;
	const storage = {
		async get() {
			return null;
		},
		async save() {},
		async delete() {},
	};

	await assert.rejects(
		() =>
			completeOAuth(config, storage, 'code', 'invalid-state', async () => {
				loadGrantCalled = true;
				return {
					refreshToken: 'refresh-token',
					email: 'reviewer@example.com',
				};
			}),
		OAuthStateError,
	);
	assert.equal(loadGrantCalled, false);
});

test('OAuth completion replaces the stored token on repeated authorization', async () => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-08-19T10:00:00.000Z'));
	const tokens = new Map<string, ReviewerToken>();
	const storage = {
		async get(chatUserId: string) {
			return tokens.get(chatUserId) ?? null;
		},
		async save(token: ReviewerToken) {
			tokens.set(token.chatUserId, token);
		},
		async delete() {},
	};
	const state = createOAuthState(config, {
		chatUserId: 'users/123',
		email: 'reviewer@example.com',
	});

	try {
		await completeOAuth(config, storage, 'first-code', state, async () => ({
			refreshToken: 'first-refresh-token',
			email: 'reviewer@example.com',
		}));
		vi.setSystemTime(new Date('2026-08-19T10:01:00.000Z'));
		await completeOAuth(config, storage, 'second-code', state, async () => ({
			refreshToken: 'second-refresh-token',
			email: ' REVIEWER@example.com ',
		}));

		assert.deepEqual(await storage.get('users/123'), {
			chatUserId: 'users/123',
			googleUserEmail: 'reviewer@example.com',
			refreshToken: 'second-refresh-token',
			createdAt: '2026-08-19T10:01:00.000Z',
		});
	} finally {
		vi.useRealTimers();
	}
});
