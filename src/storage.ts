import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import type { AppConfig } from "./config.js";
import type { OAuthState, PendingReviewRequest, ReviewerToken } from "./types.js";

const TOKENS_COLLECTION = "reviewer_tokens";
const OAUTH_STATES_COLLECTION = "oauth_states";
const PENDING_REVIEWS_COLLECTION = "pending_reviews";
let prismaClient: PrismaClient | null = null;

type StorageData = {
  tokens: Record<string, ReviewerToken>;
  oauthStates: Record<string, OAuthState>;
  pendingReviews: Record<string, PendingReviewRequest>;
};

export interface TokenStorage {
  get(chatUserId: string): Promise<ReviewerToken | null>;
  save(token: ReviewerToken): Promise<void>;
  delete(chatUserId: string): Promise<void>;
  saveOAuthState(state: OAuthState): Promise<void>;
  consumeOAuthState(state: string): Promise<OAuthState | null>;
  savePendingReview(request: PendingReviewRequest): Promise<void>;
  consumePendingReview(chatUserId: string): Promise<PendingReviewRequest | null>;
}

export function createTokenStorage(config: AppConfig): TokenStorage {
  if (config.storageDriver === "local") {
    return new LocalTokenStorage(config.localStoragePath);
  }

  return createPrismaTokenStorage(config);
}

type PrismaReviewerTokenDelegate = {
  findUnique(args: { where: { chatUserId: string } }): Promise<ReviewerToken | null>;
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

type PrismaPendingReviewDelegate = {
  upsert(args: {
    where: { chatUserId: string };
    create: PendingReviewRequest;
    update: PendingReviewRequest;
  }): Promise<PendingReviewRequest>;
  findUnique(args: { where: { chatUserId: string } }): Promise<PendingReviewRequest | null>;
  delete(args: { where: { chatUserId: string } }): Promise<unknown>;
};

type PrismaStorageClient = {
  reviewerToken: PrismaReviewerTokenDelegate;
  oauthState: PrismaOAuthStateDelegate;
  pendingReview: PrismaPendingReviewDelegate;
};

export class PrismaTokenStorage implements TokenStorage {
  constructor(private readonly prisma: PrismaStorageClient) {}

  async get(chatUserId: string): Promise<ReviewerToken | null> {
    return this.prisma.reviewerToken.findUnique({
      where: { chatUserId }
    });
  }

  async save(token: ReviewerToken): Promise<void> {
    await this.prisma.reviewerToken.upsert({
      where: { chatUserId: token.chatUserId },
      create: token,
      update: token
    });
  }

  async delete(chatUserId: string): Promise<void> {
    try {
      await this.prisma.reviewerToken.delete({
        where: { chatUserId }
      });
    } catch {
      // Delete should behave like local storage and be idempotent.
    }
  }

  async saveOAuthState(state: OAuthState): Promise<void> {
    await this.prisma.oauthState.create({
      data: state
    });
  }

  async consumeOAuthState(state: string): Promise<OAuthState | null> {
    const stateData = await this.prisma.oauthState.findUnique({
      where: { state }
    });

    if (!stateData) {
      return null;
    }

    await this.prisma.oauthState.delete({
      where: { state }
    });
    return stateData;
  }

  async savePendingReview(request: PendingReviewRequest): Promise<void> {
    await this.prisma.pendingReview.upsert({
      where: { chatUserId: request.chatUserId },
      create: request,
      update: request
    });
  }

  async consumePendingReview(chatUserId: string): Promise<PendingReviewRequest | null> {
    const pendingReview = await this.prisma.pendingReview.findUnique({
      where: { chatUserId }
    });

    if (!pendingReview) {
      return null;
    }

    await this.prisma.pendingReview.delete({
      where: { chatUserId }
    });
    return pendingReview;
  }
}

class LocalTokenStorage implements TokenStorage {
  constructor(private readonly path: string) {}

  async get(chatUserId: string): Promise<ReviewerToken | null> {
    const data = await this.read();
    return data.tokens[chatUserId] ?? null;
  }

  async save(token: ReviewerToken): Promise<void> {
    const data = await this.read();
    data.tokens[token.chatUserId] = token;
    await this.write(data);
  }

  async delete(chatUserId: string): Promise<void> {
    const data = await this.read();
    delete data.tokens[chatUserId];
    await this.write(data);
  }

  async saveOAuthState(state: OAuthState): Promise<void> {
    const data = await this.read();
    data.oauthStates[state.state] = state;
    await this.write(data);
  }

  async consumeOAuthState(state: string): Promise<OAuthState | null> {
    const data = await this.read();
    const stateData = data.oauthStates[state] ?? null;

    if (!stateData) {
      return null;
    }

    delete data.oauthStates[state];
    await this.write(data);
    return stateData;
  }

  async savePendingReview(request: PendingReviewRequest): Promise<void> {
    const data = await this.read();
    data.pendingReviews[request.chatUserId] = request;
    await this.write(data);
  }

  async consumePendingReview(chatUserId: string): Promise<PendingReviewRequest | null> {
    const data = await this.read();
    const pending = data.pendingReviews[chatUserId] ?? null;

    if (!pending) {
      return null;
    }

    delete data.pendingReviews[chatUserId];
    await this.write(data);
    return pending;
  }

  private async read(): Promise<StorageData> {
    try {
      const raw = await readFile(this.path, "utf8");
      const parsed = JSON.parse(raw) as Partial<StorageData>;
      return {
        tokens: parsed.tokens ?? {},
        oauthStates: parsed.oauthStates ?? {},
        pendingReviews: parsed.pendingReviews ?? {}
      };
    } catch (error) {
      if (isMissingFile(error)) {
        return { tokens: {}, oauthStates: {}, pendingReviews: {} };
      }
      throw error;
    }
  }

  private async write(data: StorageData): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const tmpPath = `${this.path}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await rename(tmpPath, this.path);
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function createPrismaTokenStorage(config: AppConfig): TokenStorage {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required when STORAGE_DRIVER=prisma");
  }

  if (!prismaClient) {
    const adapter = new PrismaPg({ connectionString: config.databaseUrl });
    prismaClient = new PrismaClient({
      adapter
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
          createdAt: record.createdAt.toISOString()
        };
      },
      async upsert({ where, create, update }) {
        const record = await prismaClient!.reviewerToken.upsert({
          where,
          create: mapReviewerTokenForDb(create),
          update: mapReviewerTokenForDb(update)
        });
        return {
          chatUserId: record.chatUserId,
          googleUserEmail: record.googleUserEmail,
          refreshToken: record.refreshToken,
          createdAt: record.createdAt.toISOString()
        };
      },
      async delete({ where }) {
        await prismaClient!.reviewerToken.delete({ where });
      }
    },
    oauthState: {
      async create({ data }) {
        const record = await prismaClient!.oAuthState.create({
          data: mapOAuthStateForDb(data)
        });
        return {
          state: record.state,
          chatUserId: record.chatUserId,
          expiresAt: record.expiresAt.toISOString(),
          createdAt: record.createdAt.toISOString()
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
          createdAt: record.createdAt.toISOString()
        };
      },
      async delete({ where }) {
        await prismaClient!.oAuthState.delete({ where });
      }
    },
    pendingReview: {
      async upsert({ where, create, update }) {
        const record = await prismaClient!.pendingReview.upsert({
          where,
          create: mapPendingReviewForDb(create),
          update: mapPendingReviewForDb(update)
        });
        return mapPendingReviewFromDb(record);
      },
      async findUnique({ where }) {
        const record = await prismaClient!.pendingReview.findUnique({ where });
        if (!record) {
          return null;
        }
        return mapPendingReviewFromDb(record);
      },
      async delete({ where }) {
        await prismaClient!.pendingReview.delete({ where });
      }
    }
  });
}

function mapReviewerTokenForDb(token: ReviewerToken) {
  return {
    chatUserId: token.chatUserId,
    googleUserEmail: token.googleUserEmail,
    refreshToken: token.refreshToken,
    createdAt: new Date(token.createdAt)
  };
}

function mapOAuthStateForDb(state: OAuthState) {
  return {
    state: state.state,
    chatUserId: state.chatUserId,
    expiresAt: new Date(state.expiresAt),
    createdAt: new Date(state.createdAt)
  };
}

function mapPendingReviewForDb(review: PendingReviewRequest) {
  return {
    chatUserId: review.chatUserId,
    reviewMonth: review.reviewMonth,
    createdAt: new Date(review.createdAt),
    fullName: review.fullName,
    employeeEmail: review.employeeEmail,
    reviewDate: review.reviewDate,
    meetingTime: review.meetingTime,
    needsClientForm: review.needsClientForm
  };
}

function mapPendingReviewFromDb(review: {
  chatUserId: string;
  reviewMonth: string;
  createdAt: Date;
  fullName: string;
  employeeEmail: string;
  reviewDate: string;
  meetingTime: string;
  needsClientForm: boolean;
}): PendingReviewRequest {
  return {
    chatUserId: review.chatUserId,
    reviewMonth: review.reviewMonth,
    createdAt: review.createdAt.toISOString(),
    fullName: review.fullName,
    employeeEmail: review.employeeEmail,
    reviewDate: review.reviewDate,
    meetingTime: review.meetingTime,
    needsClientForm: review.needsClientForm
  };
}
