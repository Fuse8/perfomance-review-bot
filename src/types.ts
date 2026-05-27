export type ReviewerToken = {
  chatUserId: string;
  googleUserEmail: string;
  refreshToken: string;
  createdAt: string;
};

export type OAuthState = {
  state: string;
  chatUserId: string;
  expiresAt: string;
  createdAt: string;
};

export type ReviewRequest = {
  fullName: string;
  reviewDate: string;
  needsClientForm: boolean;
};

export type ChatEvent = {
  type?: string;
  user?: {
    name?: string;
    displayName?: string;
    email?: string;
  };
  message?: {
    slashCommand?: {
      commandId?: string;
    };
    text?: string;
  };
  common?: {
    invokedFunction?: string;
    formInputs?: Record<string, ChatFormInput>;
  };
};

export type ChatFormInput = {
  stringInputs?: {
    value?: string[];
  };
  dateInput?: {
    msSinceEpoch?: string;
  };
};
