import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { OAuthState, ReviewerToken } from './types.js';
import { PrismaTokenStorage } from './storage.js';

test('PrismaTokenStorage saves, gets and deletes reviewer tokens', async () => {
	const tokens = new Map<string, ReviewerToken>();
	const storage = new PrismaTokenStorage({
		reviewerToken: {
			async findUnique({ where }: { where: { chatUserId: string } }) {
				return tokens.get(where.chatUserId) ?? null;
			},
			async upsert({
				where,
				create,
				update,
			}: {
				where: { chatUserId: string };
				create: ReviewerToken;
				update: ReviewerToken;
			}) {
				const value = tokens.has(where.chatUserId) ? update : create;
				tokens.set(where.chatUserId, value);
				return value;
			},
			async delete({ where }: { where: { chatUserId: string } }) {
				tokens.delete(where.chatUserId);
			},
		},
		oauthState: {
			async create() {
				throw new Error('not used');
			},
			async findUnique() {
				throw new Error('not used');
			},
			async delete() {
				throw new Error('not used');
			},
		},
	});

	const token: ReviewerToken = {
		chatUserId: 'users/123',
		googleUserEmail: 'reviewer@example.test',
		refreshToken: 'refresh-token',
		createdAt: '2026-05-27T00:00:00.000Z',
	};

	await storage.save(token);
	assert.deepEqual(await storage.get('users/123'), token);

	await storage.delete('users/123');
	assert.equal(await storage.get('users/123'), null);
});

test('PrismaTokenStorage consumes oauth state and deletes it', async () => {
	const oauthStates = new Map<string, OAuthState>();
	const storage = new PrismaTokenStorage({
		reviewerToken: {
			async findUnique() {
				throw new Error('not used');
			},
			async upsert() {
				throw new Error('not used');
			},
			async delete() {
				throw new Error('not used');
			},
		},
		oauthState: {
			async create({ data }: { data: OAuthState }) {
				oauthStates.set(data.state, data);
				return data;
			},
			async findUnique({ where }: { where: { state: string } }) {
				return oauthStates.get(where.state) ?? null;
			},
			async delete({ where }: { where: { state: string } }) {
				oauthStates.delete(where.state);
			},
		},
	});

	const state: OAuthState = {
		state: 'oauth-state',
		chatUserId: 'users/123',
		expiresAt: '2026-05-27T00:10:00.000Z',
		createdAt: '2026-05-27T00:00:00.000Z',
	};

	await storage.saveOAuthState(state);
	assert.deepEqual(await storage.consumeOAuthState('oauth-state'), state);
	assert.equal(await storage.consumeOAuthState('oauth-state'), null);
});
