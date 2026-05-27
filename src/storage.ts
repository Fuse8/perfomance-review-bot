import { Firestore } from "@google-cloud/firestore";
import type { OAuthState, ReviewerToken } from "./types.js";

const TOKENS_COLLECTION = "reviewer_tokens";
const OAUTH_STATES_COLLECTION = "oauth_states";

export class TokenStorage {
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
