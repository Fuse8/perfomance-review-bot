import { Firestore } from "@google-cloud/firestore";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AppConfig } from "./config.js";
import type { OAuthState, PendingReviewRequest, ReviewerToken } from "./types.js";

const TOKENS_COLLECTION = "reviewer_tokens";
const OAUTH_STATES_COLLECTION = "oauth_states";
const PENDING_REVIEWS_COLLECTION = "pending_reviews";

type StorageData = {
  tokens: Record<string, ReviewerToken>;
  oauthStates: Record<string, OAuthState>;
  pendingReviews: Record<string, PendingReviewRequest>;
};

export interface TokenStorage {
  get(chatUserId: string): Promise<ReviewerToken | null>;
  save(token: ReviewerToken): Promise<void>;
  saveOAuthState(state: OAuthState): Promise<void>;
  consumeOAuthState(state: string): Promise<OAuthState | null>;
  savePendingReview(request: PendingReviewRequest): Promise<void>;
  consumePendingReview(chatUserId: string): Promise<PendingReviewRequest | null>;
}

export function createTokenStorage(config: AppConfig): TokenStorage {
  if (config.storageDriver === "local") {
    return new LocalTokenStorage(config.localStoragePath);
  }

  return new FirestoreTokenStorage();
}

class FirestoreTokenStorage implements TokenStorage {
  private readonly firestore = new Firestore();

  async get(chatUserId: string): Promise<ReviewerToken | null> {
    const snap = await this.firestore.collection(TOKENS_COLLECTION).doc(chatUserId).get();
    if (!snap.exists) {
      return null;
    }
    return snap.data() as ReviewerToken;
  }

  async save(token: ReviewerToken): Promise<void> {
    await this.firestore.collection(TOKENS_COLLECTION).doc(token.chatUserId).set(token, {
      merge: true
    });
  }

  async saveOAuthState(state: OAuthState): Promise<void> {
    await this.firestore.collection(OAUTH_STATES_COLLECTION).doc(state.state).set(state);
  }

  async consumeOAuthState(state: string): Promise<OAuthState | null> {
    const ref = this.firestore.collection(OAUTH_STATES_COLLECTION).doc(state);
    const snap = await ref.get();

    if (!snap.exists) {
      return null;
    }

    await ref.delete();
    return snap.data() as OAuthState;
  }

  async savePendingReview(request: PendingReviewRequest): Promise<void> {
    await this.firestore
      .collection(PENDING_REVIEWS_COLLECTION)
      .doc(request.chatUserId)
      .set(request);
  }

  async consumePendingReview(chatUserId: string): Promise<PendingReviewRequest | null> {
    const ref = this.firestore.collection(PENDING_REVIEWS_COLLECTION).doc(chatUserId);
    const snap = await ref.get();

    if (!snap.exists) {
      return null;
    }

    await ref.delete();
    return snap.data() as PendingReviewRequest;
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
