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
  employeeEmail: string;
  reviewDate: string;
  meetingTime: string;
  needsClientForm: boolean;
};

export type PendingReviewRequest = ReviewRequest & {
  chatUserId: string;
  reviewMonth: string;
  createdAt: string;
};

export type ChatEvent = {
  type?: string;
  dialogEventType?: string;
  isDialogEvent?: boolean;
  appCommandMetadata?: {
    appCommandId?: number;
    appCommandType?: string;
  };
  space?: {
    name?: string;
  };
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
    parameters?: Record<string, string>;
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
