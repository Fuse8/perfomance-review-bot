import { Firestore } from "@google-cloud/firestore";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AppConfig } from "./config.js";
import type { OAuthState, ReviewerToken } from "./types.js";

const TOKENS_COLLECTION = "reviewer_tokens";
const OAUTH_STATES_COLLECTION = "oauth_states";

type StorageData = {
  tokens: Record<string, ReviewerToken>;
  oauthStates: Record<string, OAuthState>;
};

export interface TokenStorage {
  get(chatUserId: string): Promise<ReviewerToken | null>;
  save(token: ReviewerToken): Promise<void>;
  saveOAuthState(state: OAuthState): Promise<void>;
  consumeOAuthState(state: string): Promise<OAuthState | null>;
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

  private async read(): Promise<StorageData> {
    try {
      const raw = await readFile(this.path, "utf8");
      return JSON.parse(raw) as StorageData;
    } catch (error) {
      if (isMissingFile(error)) {
        return { tokens: {}, oauthStates: {} };
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
