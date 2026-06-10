import type { chat_v1 } from 'googleapis';

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

export type ReviewerSettings = {
	chatUserId: string;
	rootFolderId: string;
	taskCollectDaysBefore: number;
	taskCheckDaysBefore: number;
	taskPrepareDaysBefore: number;
	taskReminderTime: string;
	updatedAt: string;
};

export type ReviewRequest = {
	fullName: string;
	employeeEmail: string;
	reviewDate: string;
	meetingTime: string;
	needsClientForm: boolean;
	previousReviewId: string;
	previousReviewUrl: string;
};

export type ChatFormInput = chat_v1.Schema$Inputs;
export type ChatFormInputs = NonNullable<
	chat_v1.Schema$CommonEventObject['formInputs']
>;
export type ChatParameters = NonNullable<
	chat_v1.Schema$CommonEventObject['parameters']
>;
export type ChatResponse = chat_v1.Schema$Message & Record<string, unknown>;
export type ChatCard = chat_v1.Schema$GoogleAppsCardV1Card &
	Record<string, unknown>;
export type ChatSelectionItem = chat_v1.Schema$GoogleAppsCardV1SelectionItem;

export type ChatEvent = Omit<
	chat_v1.Schema$DeprecatedEvent,
	'common' | 'user'
> & {
	common?: {
		formInputs?: ChatFormInputs;
		invokedFunction?: string | null;
		parameters?: ChatParameters;
	};
	user?: chat_v1.Schema$User & {
		email?: string;
	};
};
