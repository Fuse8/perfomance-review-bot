import { Firestore } from "@google-cloud/firestore";
import type { OAuthState, PendingReviewRequest, ReviewerToken } from "./types.js";
import type { TokenStorage } from "./storage.js";

const TOKENS_COLLECTION = "reviewer_tokens";
const OAUTH_STATES_COLLECTION = "oauth_states";
const PENDING_REVIEWS_COLLECTION = "pending_reviews";

export class FirestoreTokenStorage implements TokenStorage {
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

  async delete(chatUserId: string): Promise<void> {
    await this.firestore.collection(TOKENS_COLLECTION).doc(chatUserId).delete();
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
