import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { AppConfig } from './config.js';
import type { OAuthState, ReviewerSettings, ReviewerToken } from './types.js';

let prismaClient: PrismaClient | null = null;

export interface TokenStorage {
	get(chatUserId: string): Promise<ReviewerToken | null>;
	save(token: ReviewerToken): Promise<void>;
	delete(chatUserId: string): Promise<void>;
	saveOAuthState(state: OAuthState): Promise<void>;
	consumeOAuthState(state: string): Promise<OAuthState | null>;
}

export interface ReviewerSettingsStorage {
	getReviewerSettings(chatUserId: string): Promise<ReviewerSettings | null>;
	saveReviewerSettings(settings: ReviewerSettings): Promise<void>;
}

export type AppStorage = TokenStorage & ReviewerSettingsStorage;

export function createTokenStorage(config: AppConfig): AppStorage {
	return createPrismaTokenStorage(config);
}

type PrismaReviewerTokenDelegate = {
	findUnique(args: {
		where: { chatUserId: string };
	}): Promise<ReviewerToken | null>;
	upsert(args: {
		where: { chatUserId: string };
		create: ReviewerToken;
		update: ReviewerToken;
	}): Promise<ReviewerToken>;
	delete(args: { where: { chatUserId: string } }): Promise<unknown>;
};

type PrismaOAuthStateDelegate = {
	create(args: { data: OAuthState }): Promise<OAuthState>;
	findUnique(args: { where: { state: string } }): Promise<OAuthState | null>;
	delete(args: { where: { state: string } }): Promise<unknown>;
};

type PrismaReviewerSettingsDelegate = {
	findUnique(args: {
		where: { chatUserId: string };
	}): Promise<ReviewerSettings | null>;
	upsert(args: {
		where: { chatUserId: string };
		create: ReviewerSettings;
		update: ReviewerSettings;
	}): Promise<ReviewerSettings>;
};

type PrismaStorageClient = {
	reviewerToken: PrismaReviewerTokenDelegate;
	oauthState: PrismaOAuthStateDelegate;
	reviewerSettings: PrismaReviewerSettingsDelegate;
};

export class PrismaTokenStorage implements AppStorage {
	constructor(private readonly prisma: PrismaStorageClient) {}

	async get(chatUserId: string): Promise<ReviewerToken | null> {
		return this.prisma.reviewerToken.findUnique({
			where: { chatUserId },
		});
	}

	async save(token: ReviewerToken): Promise<void> {
		await this.prisma.reviewerToken.upsert({
			where: { chatUserId: token.chatUserId },
			create: token,
			update: token,
		});
	}

	async delete(chatUserId: string): Promise<void> {
		try {
			await this.prisma.reviewerToken.delete({
				where: { chatUserId },
			});
		} catch {
			// Delete should behave like local storage and be idempotent.
		}
	}

	async saveOAuthState(state: OAuthState): Promise<void> {
		await this.prisma.oauthState.create({
			data: state,
		});
	}

	async consumeOAuthState(state: string): Promise<OAuthState | null> {
		const stateData = await this.prisma.oauthState.findUnique({
			where: { state },
		});

		if (!stateData) {
			return null;
		}

		await this.prisma.oauthState.delete({
			where: { state },
		});
		return stateData;
	}

	async getReviewerSettings(
		chatUserId: string,
	): Promise<ReviewerSettings | null> {
		return this.prisma.reviewerSettings.findUnique({
			where: { chatUserId },
		});
	}

	async saveReviewerSettings(settings: ReviewerSettings): Promise<void> {
		await this.prisma.reviewerSettings.upsert({
			where: { chatUserId: settings.chatUserId },
			create: settings,
			update: settings,
		});
	}
}

function createPrismaTokenStorage(config: AppConfig): AppStorage {
	if (!prismaClient) {
		const adapter = new PrismaPg({ connectionString: config.databaseUrl });
		prismaClient = new PrismaClient({
			adapter,
		});
	}

	return new PrismaTokenStorage({
		reviewerToken: {
			async findUnique({ where }) {
				const record = await prismaClient!.reviewerToken.findUnique({ where });
				if (!record) {
					return null;
				}
				return {
					chatUserId: record.chatUserId,
					googleUserEmail: record.googleUserEmail,
					refreshToken: record.refreshToken,
					createdAt: record.createdAt.toISOString(),
				};
			},
			async upsert({ where, create, update }) {
				const record = await prismaClient!.reviewerToken.upsert({
					where,
					create: mapReviewerTokenForDb(create),
					update: mapReviewerTokenForDb(update),
				});
				return {
					chatUserId: record.chatUserId,
					googleUserEmail: record.googleUserEmail,
					refreshToken: record.refreshToken,
					createdAt: record.createdAt.toISOString(),
				};
			},
			async delete({ where }) {
				await prismaClient!.reviewerToken.delete({ where });
			},
		},
		oauthState: {
			async create({ data }) {
				const record = await prismaClient!.oAuthState.create({
					data: mapOAuthStateForDb(data),
				});
				return {
					state: record.state,
					chatUserId: record.chatUserId,
					expiresAt: record.expiresAt.toISOString(),
					createdAt: record.createdAt.toISOString(),
				};
			},
			async findUnique({ where }) {
				const record = await prismaClient!.oAuthState.findUnique({ where });
				if (!record) {
					return null;
				}
				return {
					state: record.state,
					chatUserId: record.chatUserId,
					expiresAt: record.expiresAt.toISOString(),
					createdAt: record.createdAt.toISOString(),
				};
			},
			async delete({ where }) {
				await prismaClient!.oAuthState.delete({ where });
			},
		},
		reviewerSettings: {
			async findUnique({ where }) {
				const record = await prismaClient!.reviewerSettings.findUnique({
					where,
				});
				if (!record) {
					return null;
				}
				return mapReviewerSettingsFromDb(record);
			},
			async upsert({ where, create, update }) {
				const record = await prismaClient!.reviewerSettings.upsert({
					where,
					create: mapReviewerSettingsForDb(create),
					update: mapReviewerSettingsForDb(update),
				});
				return mapReviewerSettingsFromDb(record);
			},
		},
	});
}

function mapReviewerTokenForDb(token: ReviewerToken) {
	return {
		chatUserId: token.chatUserId,
		googleUserEmail: token.googleUserEmail,
		refreshToken: token.refreshToken,
		createdAt: new Date(token.createdAt),
	};
}

function mapOAuthStateForDb(state: OAuthState) {
	return {
		state: state.state,
		chatUserId: state.chatUserId,
		expiresAt: new Date(state.expiresAt),
		createdAt: new Date(state.createdAt),
	};
}

function mapReviewerSettingsForDb(settings: ReviewerSettings) {
	return {
		chatUserId: settings.chatUserId,
		rootFolderId: settings.rootFolderId,
		taskCollectDaysBefore: settings.taskCollectDaysBefore,
		taskCheckDaysBefore: settings.taskCheckDaysBefore,
		taskPrepareDaysBefore: settings.taskPrepareDaysBefore,
		taskReminderTime: settings.taskReminderTime,
		updatedAt: new Date(settings.updatedAt),
	};
}

function mapReviewerSettingsFromDb(settings: {
	chatUserId: string;
	rootFolderId: string;
	taskCollectDaysBefore: number;
	taskCheckDaysBefore: number;
	taskPrepareDaysBefore: number;
	taskReminderTime: string;
	updatedAt: Date;
}): ReviewerSettings {
	return {
		chatUserId: settings.chatUserId,
		rootFolderId: settings.rootFolderId,
		taskCollectDaysBefore: settings.taskCollectDaysBefore,
		taskCheckDaysBefore: settings.taskCheckDaysBefore,
		taskPrepareDaysBefore: settings.taskPrepareDaysBefore,
		taskReminderTime: settings.taskReminderTime,
		updatedAt: settings.updatedAt.toISOString(),
	};
}
