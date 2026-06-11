import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { OAuthState, ReviewerSettings, ReviewerToken } from './types.js';
import { PrismaTokenStorage } from './storage.js';

const unusedReviewerSettingsDelegate = {
	async findUnique() {
		throw new Error('not used');
	},
	async upsert() {
		throw new Error('not used');
	},
};

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
		reviewerSettings: unusedReviewerSettingsDelegate,
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
		reviewerSettings: unusedReviewerSettingsDelegate,
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

test('PrismaTokenStorage saves and gets reviewer settings', async () => {
	const reviewerSettings = new Map<string, ReviewerSettings>();
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
		reviewerSettings: {
			async findUnique({ where }: { where: { chatUserId: string } }) {
				return reviewerSettings.get(where.chatUserId) ?? null;
			},
			async upsert({
				where,
				create,
				update,
			}: {
				where: { chatUserId: string };
				create: ReviewerSettings;
				update: ReviewerSettings;
			}) {
				const value = reviewerSettings.has(where.chatUserId) ? update : create;
				reviewerSettings.set(where.chatUserId, value);
				return value;
			},
		},
	});

	const settings: ReviewerSettings = {
		chatUserId: 'users/123',
		rootFolderId: 'folder-id',
		taskCollectDaysBefore: 14,
		taskCheckDaysBefore: 7,
		taskPrepareDaysBefore: 3,
		taskReminderTime: '12:00',
		reviewIntervalMonths: 6,
		updatedAt: '2026-06-10T00:00:00.000Z',
	};

	await storage.saveReviewerSettings(settings);

	assert.deepEqual(await storage.getReviewerSettings('users/123'), settings);
	assert.equal(await storage.getReviewerSettings('users/456'), null);
});
