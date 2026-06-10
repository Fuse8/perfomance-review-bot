import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { AppConfig } from './config.js';
import { createChatEventHandler, getDirectorySearchQuery } from './chat.js';
import type { AppStorage } from './storage.js';
import type { ChatEvent, ReviewerSettings } from './types.js';

const config: AppConfig = {
	appBaseUrl: 'https://example.test',
	googleClientId: 'client-id',
	googleClientSecret: 'client-secret',
	googleRedirectUri: 'https://example.test/auth/google/callback',
	chatServiceAccountKeyFile: undefined,
	reviewReportTemplateId: 'report-template-id',
	internalReviewFormTemplateId: 'internal-form-template-id',
	clientReviewFormTemplateId: 'client-form-template-id',
	employeeEmailDomains: ['fuse8.online', 'byteminds.co.uk'],
	taskCollectDaysBefore: 14,
	taskCheckDaysBefore: 7,
	taskPrepareDaysBefore: 3,
	taskReminderTime: '12:00',
	databaseUrl: 'postgresql://user:pass@localhost:5432/db',
	port: 8080,
};

const REVIEW_WORKFLOW_ACK_MESSAGE =
	'Запустил подготовку PR. Результат пришлю сюда.';

async function flushBackgroundTasks(): Promise<void> {
	await new Promise<void>((resolve) => setImmediate(resolve));
	await new Promise<void>((resolve) => setImmediate(resolve));
}

const storage = {
	async get() {
		return {
			chatUserId: 'users/123',
			googleUserEmail: 'reviewer@example.test',
			refreshToken: 'refresh-token',
			createdAt: '2026-05-27T00:00:00.000Z',
		};
	},
	async save() {},
	async delete() {},
	async saveOAuthState() {},
	async consumeOAuthState() {
		return null;
	},
	async getReviewerSettings() {
		return {
			chatUserId: 'users/123',
			rootFolderId: 'root-folder-id',
			taskCollectDaysBefore: 14,
			taskCheckDaysBefore: 7,
			taskPrepareDaysBefore: 3,
			taskReminderTime: '12:00',
			updatedAt: '2026-06-10T00:00:00.000Z',
		};
	},
	async saveReviewerSettings() {},
};

function createHandler(overrides: Partial<ChatEventHandlerDeps> = {}) {
	return createChatEventHandler({
		async findPreviousReviewReport() {
			return {
				id: 'previous-report-id',
				name: 'Ivan Petrov // Отчёт Performance Review // 2026-05',
				webViewLink: 'https://docs.google.com/document/previous-report-id',
			};
		},
		async createCalendarEvent() {
			return {
				id: 'calendar-event-id',
				summary: 'Performance Review: Ivan Petrov',
				htmlLink: 'https://calendar.google.com/event?eid=calendar-event-id',
				startDateTime: '2026-06-15T14:30:00+05:00',
			};
		},
		async createReviewerReminderEvents() {
			return [
				{
					id: 'collect-reminder-id',
					summary: 'Запустить сбор отзывов для PR Ivan Petrov',
					htmlLink: 'https://calendar.google.com/event?eid=collect-reminder-id',
					startDateTime: '2026-05-26T12:00:00+05:00',
				},
				{
					id: 'check-reminder-id',
					summary: 'Проверить отзывы для PR Ivan Petrov',
					htmlLink: 'https://calendar.google.com/event?eid=check-reminder-id',
					startDateTime: '2026-06-04T12:00:00+05:00',
				},
				{
					id: 'prepare-reminder-id',
					summary: 'Подготовиться к проведению PR Ivan Petrov',
					htmlLink: 'https://calendar.google.com/event?eid=prepare-reminder-id',
					startDateTime: '2026-06-10T12:00:00+05:00',
				},
			];
		},
		async getReviewerName() {
			return 'reviewer@example.test';
		},
		async validateReviewerRootFolder() {},
		...overrides,
	});
}

type ChatEventHandlerDeps = {
	createReviewFolder: typeof import('./drive.js').createReviewFolder;
	createCalendarEvent: typeof import('./calendar.js').createCalendarEvent;
	createReviewerReminderEvents: typeof import('./calendar.js').createReviewerReminderEvents;
	findPreviousReviewReport: typeof import('./drive.js').findPreviousReviewReport;
	findEmployeeFolder: typeof import('./drive.js').findEmployeeFolder;
	searchDirectoryEmployees: typeof import('./people.js').searchDirectoryEmployees;
	getReviewerName: typeof import('./oauth.js').getReviewerName;
	buildAuthUrl: typeof import('./oauth.js').buildAuthUrl;
	sendChatMessage: typeof import('./google-chat.js').sendChatMessage;
	validateReviewerRootFolder: (
		config: AppConfig,
		refreshToken: string,
		rootFolderId: string,
	) => Promise<void>;
};

test('/info returns bot version and review command help', async () => {
	const handleChatEvent = createChatEventHandler();

	const response = await handleChatEvent(config, storage, {
		appCommandMetadata: {
			appCommandId: 2,
		},
	});

	const text = getResponseText(response);
	assert.match(
		text,
		/^🚀 Performance Review Assistant\n\nВерсия: v\d+\.\d+\.\d+\n\n────────────────────────────────────\n\n📋 Доступные команды\n\n• \/review {4}Запустить Performance Review\n• \/settings {2}Настроить папку и задачи ревьюера\n• \/info {9}Показать информацию о боте\n\n🕒 Важно\n\nПеред \/review настройте корневую папку через \/settings\.\nБез нее запуск Performance Review недоступен\.\n\nВсе даты и время ревью, встреч и задач указываются\nпо челябинскому времени \(UTC\+5\)\.$/,
	);
	assert.doesNotMatch(text, /\/check-auth/);
});

test('/info works for standalone slash command payload', async () => {
	const handleChatEvent = createChatEventHandler();

	const response = await handleChatEvent(config, storage, {
		type: 'MESSAGE',
		user: {
			name: 'users/123',
		},
		message: {
			text: '/info',
			slashCommand: {
				commandId: '2',
			},
		},
		appCommandMetadata: {
			appCommandId: 2,
			appCommandType: 'SLASH_COMMAND',
		},
		space: {
			name: 'spaces/STANDALONE',
		},
	} as never);

	const text = getResponseText(response);
	assert.match(text, /^🚀 Performance Review Assistant/m);
	assert.match(text, /Версия: v\d+\.\d+\.\d+/);
	assert.match(text, /📋 Доступные команды/);
	assert.match(text, /\/review/);
	assert.match(text, /\/settings/);
	assert.match(text, /\/info/);
	assert.match(text, /челябинскому времени \(UTC\+5\)/i);
	assert.doesNotMatch(text, /\/check-auth/);
});

test('/settings without token returns auth card', async () => {
	const emptyStorage = {
		...storage,
		async get() {
			return null;
		},
	};
	const handleChatEvent = createChatEventHandler({
		async buildAuthUrl() {
			return 'https://example.test/oauth';
		},
	});

	const response = await handleChatEvent(
		config,
		emptyStorage,
		settingsCommandEvent(),
	);

	assert.equal(getFirstCard(response).header?.title, 'Нужно подключить Google');
});

test('/settings opens dialog with default values', async () => {
	const settingsStorage = {
		...storage,
		async getReviewerSettings() {
			return null;
		},
	};
	const handleChatEvent = createHandler();

	const response = await handleChatEvent(
		config,
		settingsStorage,
		settingsCommandEvent(),
	);
	const card = getUpdatedCard(response);

	assert.equal(card.header?.title, 'Настройки ревьюера');
	assert.deepEqual(findTextInputValues(card), {
		rootFolderId: '',
		taskCollectDaysBefore: '14',
		taskCheckDaysBefore: '7',
		taskPrepareDaysBefore: '3',
		taskReminderTime: '12:00',
	});
});

test('/settings saves validated reviewer settings', async () => {
	let savedSettings: ReviewerSettings | null = null;
	const settingsStorage = {
		...storage,
		async saveReviewerSettings(settings: ReviewerSettings) {
			savedSettings = settings;
		},
	};
	const validatedFolderIds: string[] = [];
	const handleChatEvent = createHandler({
		async validateReviewerRootFolder(_config, refreshToken, rootFolderId) {
			assert.equal(refreshToken, 'refresh-token');
			validatedFolderIds.push(rootFolderId);
		},
	});

	const response = await handleChatEvent(
		config,
		settingsStorage,
		settingsSubmitEvent({
			rootFolderId: 'reviewer-root-folder-id',
			taskCollectDaysBefore: '10',
			taskCheckDaysBefore: '5',
			taskPrepareDaysBefore: '1',
			taskReminderTime: '09:30',
		}),
	);

	assert.equal(getResponseText(response), 'Настройки сохранены.');
	assert.deepEqual(validatedFolderIds, ['reviewer-root-folder-id']);
	const settings = savedSettings as ReviewerSettings | null;
	assert.ok(settings);
	assert.deepEqual(settings, {
		chatUserId: 'users/123',
		rootFolderId: 'reviewer-root-folder-id',
		taskCollectDaysBefore: 10,
		taskCheckDaysBefore: 5,
		taskPrepareDaysBefore: 1,
		taskReminderTime: '09:30',
		updatedAt: settings.updatedAt,
	});
	assert.match(settings.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('/settings rejects invalid values before saving', async () => {
	let saveCalled = false;
	let validateCalled = false;
	const settingsStorage = {
		...storage,
		async saveReviewerSettings() {
			saveCalled = true;
		},
	};
	const handleChatEvent = createHandler({
		async validateReviewerRootFolder() {
			validateCalled = true;
		},
	});

	const response = await handleChatEvent(
		config,
		settingsStorage,
		settingsSubmitEvent({
			rootFolderId: '',
			taskCollectDaysBefore: '-1',
			taskCheckDaysBefore: 'abc',
			taskPrepareDaysBefore: '3',
			taskReminderTime: '25:00',
		}),
	);

	const text = getResponseText(response);
	assert.match(text, /Укажите root folder ID/);
	assert.equal(saveCalled, false);
	assert.equal(validateCalled, false);
});

test('/settings keeps dialog open when root folder is not valid', async () => {
	let saveCalled = false;
	const settingsStorage = {
		...storage,
		async saveReviewerSettings() {
			saveCalled = true;
		},
	};
	const handleChatEvent = createHandler({
		async validateReviewerRootFolder() {
			throw new Error('not a folder');
		},
	});

	const response = await handleChatEvent(
		config,
		settingsStorage,
		settingsSubmitEvent({
			rootFolderId: 'bad-folder-id',
			taskCollectDaysBefore: '10',
			taskCheckDaysBefore: '5',
			taskPrepareDaysBefore: '1',
			taskReminderTime: '09:30',
		}),
	);
	const card = getUpdatedCard(response);

	assert.equal(card.header?.title, 'Настройки ревьюера');
	assert.match(getCardText(card), /Root folder ID должен быть доступной/);
	assert.equal(findTextInputValues(card).rootFolderId, 'bad-folder-id');
	assert.equal(saveCalled, false);
});

test('install event returns info and sends auth link as a second message', async () => {
	let authChatUserId = '';
	let sentSpaceName = '';
	let sentText = '';
	let sendFinished = false;
	let releaseSend: () => void = () => {};
	const sendBlocker = new Promise<void>((resolve) => {
		releaseSend = resolve;
	});
	const handleChatEvent = createChatEventHandler({
		async buildAuthUrl(_config, _storage, chatUserId) {
			authChatUserId = chatUserId;
			return 'https://example.test/auth/start';
		},
		async sendChatMessage(_config, spaceName, text) {
			sentSpaceName = spaceName;
			sentText = text;
			await sendBlocker;
			sendFinished = true;
		},
	});

	const response = await handleChatEvent(config, storage, {
		type: 'ADDED_TO_SPACE',
		user: {
			name: 'users/123',
		},
		space: {
			name: 'spaces/AAA',
		},
	});

	assert.equal(authChatUserId, 'users/123');
	assert.match(getResponseText(response), /^🚀 Performance Review Assistant/m);
	assert.match(getResponseText(response), /\/review/);
	assert.equal(sentSpaceName, 'spaces/AAA');
	assert.match(sentText, /Подключите Google-аккаунт ревьюера/);
	assert.match(sentText, /https:\/\/example\.test\/auth\/start/);
	assert.equal(sendFinished, false);

	releaseSend();
	await Promise.resolve();
});

test('install event without user returns clear error and does not build auth url', async () => {
	let buildAuthUrlCalled = false;
	const handleChatEvent = createChatEventHandler({
		async buildAuthUrl() {
			buildAuthUrlCalled = true;
			return 'https://example.test/auth/start';
		},
	});

	const response = await handleChatEvent(config, storage, {
		type: 'ADDED_TO_SPACE',
		space: {
			name: 'spaces/AAA',
		},
	});

	assert.equal(buildAuthUrlCalled, false);
	assert.match(
		getResponseText(response),
		/Не удалось определить пользователя Google Chat/,
	);
});

test('/review opens employee lookup card', async () => {
	const handleChatEvent = createChatEventHandler();

	const response = await handleChatEvent(config, storage, {
		user: {
			name: 'users/123',
		},
		appCommandMetadata: {
			appCommandId: 1,
		},
	});

	const card = getFirstCard(response);
	const widgets = card.sections?.[0]?.widgets ?? [];

	assert.equal(card.header?.title, 'Выбор сотрудника');
	assert.deepEqual(widgets[0], {
		selectionInput: {
			name: 'employeeFolder',
			type: 'MULTI_SELECT',
			label: 'Имя, фамилия или email',
			multiSelectMaxSelectedItems: 1,
			multiSelectMinQueryLength: 1,
			onChangeAction: {
				function: 'https://example.test/google-chat/events',
				parameters: [
					{
						key: 'actionName',
						value: 'selectEmployee',
					},
				],
			},
			externalDataSource: {
				function: 'https://example.test/google-chat/events',
			},
		},
	});
	assert.equal(widgets.length, 1);
});

test('/review returns auth card when reviewer token is missing', async () => {
	const emptyStorage: AppStorage = {
		...storage,
		async get() {
			return null;
		},
	};
	const handleChatEvent = createChatEventHandler({
		async buildAuthUrl() {
			return 'https://example.test/auth/start';
		},
		async sendChatMessage(_config, spaceName, text) {
			throw new Error(
				`should not send auth text message to ${spaceName}: ${text}`,
			);
		},
	});

	const response = await handleChatEvent(
		config,
		emptyStorage,
		reviewCommandEvent(),
	);

	const card = getFirstCard(response);
	assert.equal(card.header?.title, 'Нужно подключить Google');
	assert.match(getCardText(card), /подключите Google-аккаунт ревьюера/i);
	assert.match(getCardButtonText(card), /Подключить Google/i);
});

test('/review without token returns auth card for standalone command event', async () => {
	const emptyStorage: AppStorage = {
		...storage,
		async get() {
			return null;
		},
	};
	const handleChatEvent = createChatEventHandler({
		async buildAuthUrl() {
			return 'https://example.test/oauth';
		},
		async sendChatMessage(_config, spaceName) {
			throw new Error(`should not send auth text message to ${spaceName}`);
		},
	});

	const response = await handleChatEvent(config, emptyStorage, {
		user: { name: 'users/123' },
		space: {
			name: 'spaces/from-command',
		},
		appCommandMetadata: { appCommandId: 1 },
	});

	const card = getFirstCard(response);
	assert.equal(card.header?.title, 'Нужно подключить Google');
	assert.match(getCardButtonText(card), /Подключить Google/i);
});

test('/review without token returns auth card for standalone slash command payload', async () => {
	const emptyStorage: AppStorage = {
		...storage,
		async get() {
			return null;
		},
	};
	const handleChatEvent = createChatEventHandler({
		async buildAuthUrl() {
			return 'https://example.test/oauth';
		},
		async sendChatMessage(_config, spaceName) {
			throw new Error(`should not send auth text message to ${spaceName}`);
		},
	});

	const response = await handleChatEvent(config, emptyStorage, {
		type: 'MESSAGE',
		user: { name: 'users/123' },
		space: { name: 'spaces/STANDALONE' },
		message: {
			text: '/review',
			slashCommand: {
				commandId: '1',
			},
		},
		appCommandMetadata: {
			appCommandId: 1,
			appCommandType: 'SLASH_COMMAND',
		},
	} as never);

	const card = getFirstCard(response);
	assert.equal(card.header?.title, 'Нужно подключить Google');
	assert.match(getCardButtonText(card), /Подключить Google/i);
});

test('/review employee suggestions close dialog and send auth message when token is missing', async () => {
	const emptyStorage: AppStorage = {
		...storage,
		async get() {
			return null;
		},
	};
	const sentMessages: string[] = [];
	const handleChatEvent = createHandler({
		async buildAuthUrl() {
			return 'https://example.test/oauth';
		},
		async sendChatMessage(_config, _spaceName, text) {
			sentMessages.push(text);
		},
	});

	const response = await handleChatEvent(
		config,
		emptyStorage,
		employeeSuggestionsEvent('ivan', { spaceName: 'spaces/AAA' }),
	);

	assert.deepEqual(response, {});
	assert.match(sentMessages[0] ?? '', /https:\/\/example\.test\/oauth/);
});

test('/review employee suggestions close dialog and send auth message on invalid_grant', async () => {
	let deleted = false;
	const trackingStorage: AppStorage = {
		...storage,
		async delete(chatUserId) {
			deleted = true;
			assert.equal(chatUserId, 'users/123');
		},
	};
	const sentMessages: string[] = [];
	const handleChatEvent = createHandler({
		async searchDirectoryEmployees() {
			throw new Error(
				'{"error":"invalid_grant","error_description":"Token has been expired or revoked."}',
			);
		},
		async buildAuthUrl() {
			return 'https://example.test/oauth';
		},
		async sendChatMessage(_config, _spaceName, text) {
			sentMessages.push(text);
		},
	});

	const response = await handleChatEvent(
		config,
		trackingStorage,
		employeeSuggestionsEvent('ivan', { spaceName: 'spaces/AAA' }),
	);

	assert.equal(deleted, true);
	assert.deepEqual(response, {});
	assert.match(sentMessages[0] ?? '', /https:\/\/example\.test\/oauth/);
});

test('/review submit sends auth link to chat when workflow fails with invalid_grant', async () => {
	let deleted = false;
	const trackingStorage: AppStorage = {
		...storage,
		async delete() {
			deleted = true;
		},
	};
	const sentMessages: string[] = [];
	const handleChatEvent = createHandler({
		async createReviewFolder() {
			throw new Error('invalid_grant');
		},
		async buildAuthUrl() {
			return 'https://example.test/oauth';
		},
		async sendChatMessage(_config, _spaceName, text) {
			sentMessages.push(text);
		},
	});

	await handleChatEvent(config, trackingStorage, reviewSubmitEvent());
	await flushBackgroundTasks();

	assert.equal(deleted, true);
	assert.equal(sentMessages.length, 2);
	assert.match(sentMessages[1] ?? '', /https:\/\/example\.test\/oauth/);
	assert.match(sentMessages[1] ?? '', /подключить Google-аккаунт ревьюера/i);
});

test('/review employee check returns auth message when previous review lookup fails with invalid_grant', async () => {
	let deleted = false;
	const trackingStorage: AppStorage = {
		...storage,
		async delete() {
			deleted = true;
		},
	};
	const handleChatEvent = createHandler({
		async findEmployeeFolder() {
			return { id: 'employee-folder-id', name: 'Ivan Petrov' };
		},
		async findPreviousReviewReport() {
			throw new Error('invalid_grant');
		},
		async buildAuthUrl() {
			return 'https://example.test/oauth';
		},
	});

	const response = await handleChatEvent(
		config,
		trackingStorage,
		employeeCheckEvent({ manualFullName: 'Ivan Petrov' }),
	);

	assert.equal(deleted, true);
	assert.match(getResponseText(response), /https:\/\/example\.test\/oauth/);
});

test('/review employee suggestions return matching directory employees', async () => {
	const handleChatEvent = createHandler({
		async searchDirectoryEmployees(_config, refreshToken, query) {
			assert.equal(refreshToken, 'refresh-token');
			assert.equal(query, 'ivan');
			return [
				{
					fullName: 'Ivan Petrov',
					email: 'ivan.petrov@fuse8.online',
					resourceName: 'people/c123',
				},
			];
		},
	});

	const response = await handleChatEvent(
		config,
		storage,
		employeeSuggestionsEvent('ivan'),
	);

	assert.deepEqual(response, {
		actionResponse: {
			type: 'UPDATE_WIDGET',
			updatedWidget: {
				widget: 'employeeFolder',
				suggestions: {
					items: [
						{
							text: 'Ivan Petrov (ivan.petrov@fuse8.online)',
							value: 'ivan.petrov@fuse8.online|Ivan Petrov',
						},
					],
				},
			},
		},
	});
});

test('/review without reviewer settings asks to run settings first', async () => {
	const settingsStorage = {
		...storage,
		async getReviewerSettings() {
			return null;
		},
	};
	const handleChatEvent = createHandler({
		async findEmployeeFolder() {
			throw new Error('should not check employee folders without settings');
		},
	});

	const response = await handleChatEvent(
		config,
		settingsStorage,
		reviewCommandEvent(),
	);

	assert.match(getResponseText(response), /Сначала настройте \/settings/);
});

test('/review uses reviewer settings for root folder and reminders', async () => {
	const sentMessages: Array<{ spaceName: string; text: string }> = [];
	const settingsStorage = {
		...storage,
		async getReviewerSettings() {
			return {
				chatUserId: 'users/123',
				rootFolderId: 'reviewer-root-folder-id',
				taskCollectDaysBefore: 10,
				taskCheckDaysBefore: 5,
				taskPrepareDaysBefore: 1,
				taskReminderTime: '09:30',
				updatedAt: '2026-06-10T00:00:00.000Z',
			};
		},
	};
	const handleChatEvent = createHandler({
		async findPreviousReviewReport() {
			throw new Error('should not look up previous review on submit');
		},
		async createReviewFolder(effectiveConfig) {
			assert.equal(
				effectiveConfig.reviewsRootFolderId,
				'reviewer-root-folder-id',
			);
			return {
				id: 'folder-id',
				name: '2026.06',
				webViewLink: 'https://drive.google.com/folder',
			};
		},
		async createCalendarEvent() {
			return {
				id: 'calendar-event-id',
				summary: 'Performance Review: Ivan Petrov',
				htmlLink: 'https://calendar.google.com/event?eid=calendar-event-id',
				startDateTime: '2026-06-15T14:30:00+05:00',
			};
		},
		async createReviewerReminderEvents(effectiveConfig) {
			assert.equal(effectiveConfig.taskCollectDaysBefore, 10);
			assert.equal(effectiveConfig.taskCheckDaysBefore, 5);
			assert.equal(effectiveConfig.taskPrepareDaysBefore, 1);
			assert.equal(effectiveConfig.taskReminderTime, '09:30');
			return [];
		},
		async sendChatMessage(_config, spaceName, text) {
			sentMessages.push({ spaceName, text });
		},
	});

	await handleChatEvent(config, settingsStorage, reviewSubmitEvent());
	await flushBackgroundTasks();

	assert.equal(sentMessages.length, 2);
});

test('/review employee suggestions show empty-state message when nothing matches', async () => {
	const handleChatEvent = createHandler({
		async searchDirectoryEmployees() {
			return [];
		},
	});

	const response = await handleChatEvent(
		config,
		storage,
		employeeSuggestionsEvent('unknown'),
	);

	assert.deepEqual(response, {
		actionResponse: {
			type: 'UPDATE_WIDGET',
			updatedWidget: {
				widget: 'employeeFolder',
				suggestions: {
					items: [
						{
							text: 'Сотрудник не найден',
							bottomText:
								'Попробуйте поиск по другому параметру или на английском языке',
							value: '__no_results__',
						},
					],
				},
			},
		},
	});
});

test('/review employee suggestions ignore empty autocomplete query', async () => {
	let searchCalled = false;
	const handleChatEvent = createHandler({
		async searchDirectoryEmployees() {
			searchCalled = true;
			return [];
		},
	});

	const response = await handleChatEvent(
		config,
		storage,
		employeeSuggestionsEvent(''),
	);

	assert.equal(searchCalled, false);
	assert.deepEqual(response, {
		actionResponse: {
			type: 'UPDATE_WIDGET',
			updatedWidget: {
				widget: 'employeeFolder',
				suggestions: {
					items: [],
				},
			},
		},
	});
});

test('getDirectorySearchQuery keeps latin queries unchanged', () => {
	assert.equal(getDirectorySearchQuery('ivan'), 'ivan');
	assert.equal(getDirectorySearchQuery('Andrey Stepanov'), 'Andrey Stepanov');
});

test('getDirectorySearchQuery transliterates cyrillic queries to latin for directory search', () => {
	assert.equal(getDirectorySearchQuery('иван'), 'ivan');
	assert.equal(getDirectorySearchQuery('Андрей'), 'andrey');
	assert.equal(getDirectorySearchQuery('Андрей Степанов'), 'andrey stepanov');
});

test('/review employee suggestions transliterate cyrillic query before directory search', async () => {
	const handleChatEvent = createHandler({
		async searchDirectoryEmployees(_config, refreshToken, query) {
			assert.equal(refreshToken, 'refresh-token');
			assert.equal(query, 'andrey');
			return [
				{
					fullName: 'Andrey Stepanov',
					email: 'andrey.stepanov@fuse8.online',
					resourceName: 'people/c456',
				},
			];
		},
	});

	const response = await handleChatEvent(
		config,
		storage,
		employeeSuggestionsEvent('Андрей'),
	);

	assert.deepEqual(response, {
		actionResponse: {
			type: 'UPDATE_WIDGET',
			updatedWidget: {
				widget: 'employeeFolder',
				suggestions: {
					items: [
						{
							text: 'Andrey Stepanov (andrey.stepanov@fuse8.online)',
							value: 'andrey.stepanov@fuse8.online|Andrey Stepanov',
						},
					],
				},
			},
		},
	});
});

test('/review employee selection updates card with full name and email inputs', async () => {
	const handleChatEvent = createHandler();

	const response = await handleChatEvent(
		config,
		storage,
		employeeSelectEvent('ivan.petrov@fuse8.online|Ivan Petrov'),
	);

	const card = getUpdatedCard(response);
	const widgets = card.sections?.[0]?.widgets ?? [];

	assert.deepEqual(widgets[1], {
		textInput: {
			name: 'manualFullName',
			label: 'Имя и фамилия (название папки)',
			type: 'SINGLE_LINE',
			value: 'Иван Петров',
		},
	});
	assert.deepEqual(widgets[2], {
		textInput: {
			name: 'employeeEmail',
			label: 'Email',
			type: 'SINGLE_LINE',
			value: 'ivan.petrov@fuse8.online',
		},
	});
	assert.deepEqual(widgets[3], {
		buttonList: {
			buttons: [
				{
					text: 'Проверить папку',
					onClick: {
						action: {
							function: 'https://example.test/google-chat/events',
							requiredWidgets: ['manualFullName', 'employeeEmail'],
							parameters: [
								{
									key: 'actionName',
									value: 'checkEmployeeFolder',
								},
							],
						},
					},
				},
			],
		},
	});
});

test('/review employee selection uses the latest selected employee value', async () => {
	const handleChatEvent = createHandler();

	const response = await handleChatEvent(
		config,
		storage,
		employeeSelectEvent([
			'andrey.stepanov@fuse8.online|Andrey Stepanov',
			'anton.permyakov@byteminds.co.uk|Anton Permyakov',
		]),
	);

	const card = getUpdatedCard(response);
	const widgets = card.sections?.[0]?.widgets ?? [];

	assert.deepEqual(widgets[1], {
		textInput: {
			name: 'manualFullName',
			label: 'Имя и фамилия (название папки)',
			type: 'SINGLE_LINE',
			value: 'Антон Пермяков',
		},
	});
	assert.deepEqual(widgets[2], {
		textInput: {
			name: 'employeeEmail',
			label: 'Email',
			type: 'SINGLE_LINE',
			value: 'anton.permyakov@byteminds.co.uk',
		},
	});
});

test('/review employee selection ignores stale persisted name and email fields', async () => {
	const handleChatEvent = createHandler();

	const response = await handleChatEvent(
		config,
		storage,
		employeeSelectEvent('andrey.stepanov@fuse8.online|Andrey Stepanov', {
			manualFullName: 'Anton Permyakov',
			employeeEmail: 'anton.permyakov@byteminds.co.uk',
		}),
	);

	const card = getUpdatedCard(response);
	const widgets = card.sections?.[0]?.widgets ?? [];

	assert.deepEqual(widgets[1], {
		textInput: {
			name: 'manualFullName',
			label: 'Имя и фамилия (название папки)',
			type: 'SINGLE_LINE',
			value: 'Андрей Степанов',
		},
	});
	assert.deepEqual(widgets[2], {
		textInput: {
			name: 'employeeEmail',
			label: 'Email',
			type: 'SINGLE_LINE',
			value: 'andrey.stepanov@fuse8.online',
		},
	});
});

test('/review employee selection transliterates directory English name in full name input', async () => {
	const handleChatEvent = createHandler();

	const response = await handleChatEvent(
		config,
		storage,
		employeeSelectEvent('andrey.stepanov@fuse8.online|Andrey Stepanov'),
	);
	const card = getUpdatedCard(response);
	const widgets = card.sections?.[0]?.widgets ?? [];

	assert.deepEqual(widgets[1], {
		textInput: {
			name: 'manualFullName',
			label: 'Имя и фамилия (название папки)',
			type: 'SINGLE_LINE',
			value: 'Андрей Степанов',
		},
	});
});

test('/review employee selection keeps original directory name in selected chip', async () => {
	const handleChatEvent = createHandler();

	const response = await handleChatEvent(
		config,
		storage,
		employeeSelectEvent('test.ivanov@fuse8.online|Test Ivanov'),
	);
	const card = getUpdatedCard(response);
	const widgets = card.sections?.[0]?.widgets ?? [];

	const selectedEmployeeWidget = widgets[0] as {
		selectionInput: { items?: unknown[] };
	};
	assert.deepEqual(selectedEmployeeWidget.selectionInput.items?.[0], {
		text: 'Test Ivanov (test.ivanov@fuse8.online)',
		value: 'test.ivanov@fuse8.online|Test Ivanov',
		selected: true,
	});
	assert.deepEqual(widgets[1], {
		textInput: {
			name: 'manualFullName',
			label: 'Имя и фамилия (название папки)',
			type: 'SINGLE_LINE',
			value: 'Тест Иванов',
		},
	});
});

test('/review employee selection transliterates common English employee names', async () => {
	const handleChatEvent = createHandler();

	const testIvanovResponse = await handleChatEvent(
		config,
		storage,
		employeeSelectEvent('test.ivanov@fuse8.online|Test Ivanov'),
	);
	const dmitryBerdnikovResponse = await handleChatEvent(
		config,
		storage,
		employeeSelectEvent('dmitry.berdnikov@fuse8.online|Dmitry Berdnikov'),
	);

	assert.deepEqual(
		getUpdatedCard(testIvanovResponse).sections?.[0]?.widgets?.[1],
		{
			textInput: {
				name: 'manualFullName',
				label: 'Имя и фамилия (название папки)',
				type: 'SINGLE_LINE',
				value: 'Тест Иванов',
			},
		},
	);
	assert.deepEqual(
		getUpdatedCard(dmitryBerdnikovResponse).sections?.[0]?.widgets?.[1],
		{
			textInput: {
				name: 'manualFullName',
				label: 'Имя и фамилия (название папки)',
				type: 'SINGLE_LINE',
				value: 'Дмитрий Бердников',
			},
		},
	);
});

test('/review employee check opens review form when Drive folder exists', async () => {
	const handleChatEvent = createHandler({
		async findEmployeeFolder(_config, refreshToken, fullName) {
			assert.equal(refreshToken, 'refresh-token');
			assert.equal(fullName, 'Ivan Petrov');
			return { id: 'employee-folder-id', name: 'Ivan Petrov' };
		},
		async findPreviousReviewReport(
			_config,
			refreshToken,
			fullName,
			reviewMonth,
		) {
			assert.equal(refreshToken, 'refresh-token');
			assert.equal(fullName, 'Ivan Petrov');
			assert.match(reviewMonth, /^\d{4}\.\d{2}$/);
			return {
				id: 'previous-report-id',
				name: 'Ivan Petrov // Отчёт Performance Review // 2026-05',
				webViewLink: 'https://docs.google.com/document/previous-report-id',
			};
		},
	});

	const response = await handleChatEvent(
		config,
		storage,
		employeeCheckEvent({ manualFullName: 'Ivan Petrov' }),
	);

	const card = getUpdatedCard(response);
	const widgets = card.sections?.[0]?.widgets ?? [];

	assert.equal(card.header?.title, 'Запуск Performance Review');
	assert.deepEqual(widgets.at(-1), {
		buttonList: {
			buttons: [
				{
					text: 'Создать папку',
					onClick: {
						action: {
							function: 'https://example.test/google-chat/events',
							requiredWidgets: [
								'fullName',
								'employeeEmail',
								'reviewDate',
								'meetingTime',
							],
							parameters: [
								{
									key: 'actionName',
									value: 'submitReview',
								},
								{
									key: 'previousReviewUrl',
									value: 'https://docs.google.com/document/previous-report-id',
								},
								{
									key: 'previousReviewId',
									value: 'previous-report-id',
								},
							],
						},
					},
				},
			],
		},
	});
	assert.deepEqual(widgets[0], {
		textInput: {
			name: 'fullName',
			label: 'Имя и фамилия',
			value: 'Ivan Petrov',
		},
	});
	assert.deepEqual(widgets[1], {
		textInput: {
			name: 'employeeEmail',
			label: 'Email сотрудника',
			value: 'iaroslav.zaiarnyi@byteminds.co.uk',
		},
	});
	assert.deepEqual(widgets[2], {
		textParagraph: {
			text: 'Прошлое ревью найдено: 2026-05',
		},
	});
	assert.deepEqual(widgets[4], {
		textInput: {
			name: 'meetingTime',
			label: 'Время ревью (HH:mm, Челябинск)',
			validation: {
				characterLimit: 5,
			},
		},
	});
});

test('/review employee check shows missing previous review status when Drive folder exists', async () => {
	const handleChatEvent = createHandler({
		async findEmployeeFolder() {
			return { id: 'employee-folder-id', name: 'Ivan Petrov' };
		},
		async findPreviousReviewReport() {
			return null;
		},
	});

	const response = await handleChatEvent(
		config,
		storage,
		employeeCheckEvent({ manualFullName: 'Ivan Petrov' }),
	);

	const card = getUpdatedCard(response);
	const widgets = card.sections?.[0]?.widgets ?? [];

	assert.equal(card.header?.title, 'Запуск Performance Review');
	assert.deepEqual(widgets[2], {
		textParagraph: {
			text: 'Прошлое ревью не найдено',
		},
	});
	assert.deepEqual(widgets.at(-1), {
		buttonList: {
			buttons: [
				{
					text: 'Создать папку',
					onClick: {
						action: {
							function: 'https://example.test/google-chat/events',
							requiredWidgets: [
								'fullName',
								'employeeEmail',
								'reviewDate',
								'meetingTime',
							],
							parameters: [
								{
									key: 'actionName',
									value: 'submitReview',
								},
								{
									key: 'previousReviewUrl',
									value: '',
								},
								{
									key: 'previousReviewId',
									value: '',
								},
							],
						},
					},
				},
			],
		},
	});
});

test('/review employee check keeps dialog open when selected directory employee has no Drive folder', async () => {
	const handleChatEvent = createHandler({
		async findEmployeeFolder() {
			return null;
		},
	});

	const response = await handleChatEvent(
		config,
		storage,
		employeeCheckEvent({
			manualFullName: 'Ivan Petrov',
			employeeEmail: 'ivan.petrov@fuse8.online',
			selectedEmployee: 'ivan.petrov@fuse8.online|Ivan Petrov',
		}),
	);

	const card = getUpdatedCard(response);
	const widgets = card.sections?.[0]?.widgets ?? [];

	assert.equal(card.header?.title, 'Выбор сотрудника');
	assert.deepEqual(widgets[1], {
		textInput: {
			name: 'manualFullName',
			label: 'Имя и фамилия (название папки)',
			type: 'SINGLE_LINE',
			value: 'Ivan Petrov',
		},
	});
	assert.deepEqual(widgets[2], {
		textInput: {
			name: 'employeeEmail',
			label: 'Email',
			type: 'SINGLE_LINE',
			value: 'ivan.petrov@fuse8.online',
		},
	});
	assert.deepEqual(widgets[3], {
		textParagraph: {
			text: 'Папка сотрудника не найдена. Создайте папку вручную и нажмите «Проверить папку» еще раз.',
		},
	});
	assert.deepEqual(widgets[4], {
		buttonList: {
			buttons: [
				{
					text: 'Проверить папку',
					onClick: {
						action: {
							function: 'https://example.test/google-chat/events',
							requiredWidgets: ['manualFullName', 'employeeEmail'],
							parameters: [
								{
									key: 'actionName',
									value: 'checkEmployeeFolder',
								},
							],
						},
					},
				},
			],
		},
	});
});

test('/review employee check validates manual full name against Drive folder', async () => {
	const handleChatEvent = createHandler({
		async findEmployeeFolder(_config, refreshToken, fullName) {
			assert.equal(refreshToken, 'refresh-token');
			assert.equal(fullName, 'Ivan Petrov');
			return { id: 'employee-folder-id', name: 'Ivan Petrov' };
		},
	});

	const response = await handleChatEvent(
		config,
		storage,
		employeeCheckEvent({ manualFullName: 'Ivan Petrov' }),
	);

	const card = getUpdatedCard(response);

	assert.equal(card.header?.title, 'Запуск Performance Review');
});

test('/review submit creates a test folder and returns its link', async () => {
	const sentMessages: Array<{ spaceName: string; text: string }> = [];
	const handleChatEvent = createHandler({
		async findPreviousReviewReport() {
			throw new Error('should not look up previous review on submit');
		},
		async getReviewerName(_config, refreshToken) {
			assert.equal(refreshToken, 'refresh-token');
			return 'Reviewer Name';
		},
		async createReviewFolder(_config, refreshToken, request) {
			assert.equal(refreshToken, 'refresh-token');
			assert.deepEqual(request, {
				fullName: 'Ivan Petrov',
				employeeEmail: 'iaroslav.zaiarnyi@byteminds.co.uk',
				reviewerEmail: 'reviewer@example.test',
				reviewerName: 'Reviewer Name',
				reviewDate: '2026-06-15',
				meetingTime: '14:30',
				reviewMonth: '2026.06',
				needsClientForm: true,
				previousReviewId: 'previous-report-id',
				previousReviewUrl:
					'https://docs.google.com/document/previous-report-id',
			});
			return {
				id: 'folder-id',
				name: '2026.06',
				webViewLink: 'https://drive.google.com/folder',
				report: {
					id: 'report-id',
					name: 'Ivan Petrov // Отчёт Performance Review // 2026-06',
					webViewLink: 'https://docs.google.com/document/report-id',
				},
				internalForm: {
					id: 'internal-form-id',
					name: 'Ivan Petrov // Internal Feedback Form // 2026-06',
					webViewLink: 'https://docs.google.com/forms/internal-form-id',
				},
				clientForm: {
					id: 'client-form-id',
					name: 'Ivan Petrov // Client Feedback Form // 2026-06',
					webViewLink: 'https://docs.google.com/forms/client-form-id',
				},
			};
		},
		async createCalendarEvent(_config, refreshToken, request) {
			assert.equal(refreshToken, 'refresh-token');
			assert.deepEqual(request, {
				fullName: 'Ivan Petrov',
				employeeEmail: 'iaroslav.zaiarnyi@byteminds.co.uk',
				reviewerEmail: 'reviewer@example.test',
				reviewDate: '2026-06-15',
				meetingTime: '14:30',
				folderUrl: 'https://drive.google.com/folder',
				reportUrl: 'https://docs.google.com/document/report-id',
				internalFormUrl: 'https://docs.google.com/forms/internal-form-id',
				clientFormUrl: 'https://docs.google.com/forms/client-form-id',
				previousReviewUrl:
					'https://docs.google.com/document/previous-report-id',
			});
			return {
				id: 'calendar-event-id',
				summary: 'Performance Review: Ivan Petrov',
				htmlLink: 'https://calendar.google.com/event?eid=calendar-event-id',
				startDateTime: '2026-06-15T14:30:00+05:00',
			};
		},
		async createReviewerReminderEvents(_config, refreshToken, request) {
			assert.equal(refreshToken, 'refresh-token');
			assert.deepEqual(request, {
				fullName: 'Ivan Petrov',
				employeeEmail: 'iaroslav.zaiarnyi@byteminds.co.uk',
				reviewerEmail: 'reviewer@example.test',
				reviewDate: '2026-06-15',
				meetingTime: '14:30',
				folderUrl: 'https://drive.google.com/folder',
				reportUrl: 'https://docs.google.com/document/report-id',
				internalFormUrl: 'https://docs.google.com/forms/internal-form-id',
				clientFormUrl: 'https://docs.google.com/forms/client-form-id',
				previousReviewUrl:
					'https://docs.google.com/document/previous-report-id',
			});
			return [
				{
					id: 'collect-reminder-id',
					summary: 'Запустить сбор отзывов для PR Ivan Petrov',
					htmlLink: 'https://calendar.google.com/event?eid=collect-reminder-id',
					startDateTime: '2026-05-26T12:00:00+05:00',
				},
				{
					id: 'check-reminder-id',
					summary: 'Проверить отзывы для PR Ivan Petrov',
					htmlLink: 'https://calendar.google.com/event?eid=check-reminder-id',
					startDateTime: '2026-06-04T12:00:00+05:00',
				},
				{
					id: 'prepare-reminder-id',
					summary: 'Подготовиться к проведению PR Ivan Petrov',
					htmlLink: 'https://calendar.google.com/event?eid=prepare-reminder-id',
					startDateTime: '2026-06-10T12:00:00+05:00',
				},
			];
		},
		async sendChatMessage(_config, spaceName, text) {
			sentMessages.push({ spaceName, text });
		},
	});

	const response = await handleChatEvent(config, storage, reviewSubmitEvent());

	await flushBackgroundTasks();

	assert.equal(sentMessages.length, 2);
	assert.equal(sentMessages[0]?.text, REVIEW_WORKFLOW_ACK_MESSAGE);

	const messageText = sentMessages[1]?.text ?? '';

	assert.equal(
		messageText,
		[
			'Performance Review — Ivan Petrov',
			'',
			'Дата ревью: 15.06.2026, 14:30',
			'',
			'План:',
			'26.05 → Сбор отзывов',
			'04.06 → Проверка отзывов',
			'10.06 → Подготовка к встрече',
			'15.06 → Встреча',
			'',
			'📁 Папка ревью',
			'https://drive.google.com/folder',
			'',
			'📅 Встреча',
			'https://calendar.google.com/event?eid=calendar-event-id',
			'',
			'📝 Форма обратной связи (fuse8)',
			'https://docs.google.com/forms/internal-form-id',
			'',
			'📝 Форма обратной связи (клиенту)',
			'https://docs.google.com/forms/client-form-id',
			'',
			'📄 Отчёт',
			'https://docs.google.com/document/report-id',
		].join('\n'),
	);
	assert.deepEqual(response.actionResponse, {
		type: 'DIALOG',
		dialogAction: {
			actionStatus: {
				statusCode: 'OK',
				userFacingMessage: '',
			},
		},
	});
	assert.deepEqual(sentMessages, [
		{
			spaceName: 'spaces/AAA',
			text: REVIEW_WORKFLOW_ACK_MESSAGE,
		},
		{
			spaceName: 'spaces/AAA',
			text: messageText,
		},
	]);
});

test('/review submit falls back to reviewer email when profile name is missing', async () => {
	const reviewerNames: string[] = [];
	const handleChatEvent = createHandler({
		async getReviewerName() {
			return '';
		},
		async createReviewFolder(_config, _refreshToken, request) {
			reviewerNames.push(request.reviewerName);
			return {
				id: 'folder-id',
				name: '2026.06',
				webViewLink: 'https://drive.google.com/folder',
			};
		},
		async sendChatMessage() {},
	});

	await handleChatEvent(config, storage, reviewSubmitEvent());
	await flushBackgroundTasks();

	assert.deepEqual(reviewerNames, ['reviewer@example.test']);
});

test('/review submit accepts valid meeting time', async () => {
	const meetingTimes: string[] = [];
	const handleChatEvent = createHandler({
		async createReviewFolder(_config, _refreshToken, request) {
			meetingTimes.push(request.meetingTime);
			return {
				id: 'folder-id',
				name: '2026.06',
				webViewLink: 'https://drive.google.com/folder',
			};
		},
		async sendChatMessage() {},
	});

	await handleChatEvent(
		config,
		storage,
		reviewSubmitEvent({ meetingTime: '09:05' }),
	);
	await flushBackgroundTasks();

	assert.deepEqual(meetingTimes, ['09:05']);
});

test('/review submit skips result delivery when space name is missing', async () => {
	const sentMessages: Array<{ spaceName: string; text: string }> = [];
	const handleChatEvent = createHandler({
		async createReviewFolder() {
			return {
				id: 'folder-id',
				name: '2026.06',
				webViewLink: 'https://drive.google.com/folder',
			};
		},
		async sendChatMessage(_config, spaceName, text) {
			sentMessages.push({ spaceName, text });
		},
	});

	await handleChatEvent(
		config,
		storage,
		reviewSubmitEvent({ chatSpaceName: null }),
	);

	await flushBackgroundTasks();

	assert.equal(sentMessages.length, 0);
});

test('/review submit returns ack before background workflow runs', async () => {
	let createFolderCalled = false;
	const sentMessages: string[] = [];
	const handleChatEvent = createHandler({
		async createReviewFolder() {
			createFolderCalled = true;
			return {
				id: 'folder-id',
				name: '2026.06',
				webViewLink: 'https://drive.google.com/folder',
			};
		},
		async sendChatMessage(_config, _spaceName, text) {
			sentMessages.push(text);
		},
	});

	await handleChatEvent(config, storage, reviewSubmitEvent());

	assert.equal(createFolderCalled, false);
	assert.equal(sentMessages[0], REVIEW_WORKFLOW_ACK_MESSAGE);

	await flushBackgroundTasks();
	assert.equal(createFolderCalled, true);
	assert.equal(sentMessages.length, 2);
});

test('/review submit validates employee email domain', async () => {
	const handleChatEvent = createHandler({
		async createReviewFolder() {
			throw new Error('should not create folder');
		},
	});

	const response = await handleChatEvent(
		config,
		storage,
		reviewSubmitEvent({ employeeEmail: 'ivan.petrov@other.test' }),
	);
	const text = getResponseText(response);

	assert.match(
		text,
		/Email сотрудника должен быть в одном из доменов: fuse8\.online, byteminds\.co\.uk/,
	);
});

test('/review submit accepts employee email from any configured domain', async () => {
	const acceptedEmails: string[] = [];
	const handleChatEvent = createHandler({
		async createReviewFolder(_config, _refreshToken, request) {
			acceptedEmails.push(request.employeeEmail);
			return {
				id: 'folder-id',
				name: '2026.06',
				webViewLink: 'https://drive.google.com/folder',
			};
		},
		async sendChatMessage() {},
	});

	await handleChatEvent(
		config,
		storage,
		reviewSubmitEvent({ employeeEmail: 'bair.ochirov@fuse8.online' }),
	);
	await flushBackgroundTasks();
	await handleChatEvent(
		config,
		storage,
		reviewSubmitEvent({ employeeEmail: 'iaroslav.zaiarnyi@byteminds.co.uk' }),
	);
	await flushBackgroundTasks();

	assert.deepEqual(acceptedEmails, [
		'bair.ochirov@fuse8.online',
		'iaroslav.zaiarnyi@byteminds.co.uk',
	]);
});

test('/review submit asks to configure employee email domain when it is missing', async () => {
	const handleChatEvent = createHandler({
		async createReviewFolder() {
			throw new Error('should not create folder');
		},
	});

	const response = await handleChatEvent(
		{ ...config, employeeEmailDomains: [] },
		storage,
		reviewSubmitEvent(),
	);
	const text = getResponseText(response);

	assert.match(text, /Настройте EMPLOYEE_EMAIL_DOMAINS/);
});

test('/review submit validates meeting time', async () => {
	const handleChatEvent = createHandler({
		async createReviewFolder() {
			throw new Error('should not create folder');
		},
	});

	const response = await handleChatEvent(
		config,
		storage,
		reviewSubmitEvent({ meetingTime: '' }),
	);
	const text = getResponseText(response);

	assert.match(text, /Укажите время ревью/);
});

test('/review submit rejects malformed meeting time values', async () => {
	let createFolderCalled = false;
	const handleChatEvent = createHandler({
		async createReviewFolder() {
			createFolderCalled = true;
			throw new Error('should not create folder');
		},
	});

	const response = await handleChatEvent(
		config,
		storage,
		reviewSubmitEvent({ meetingTime: 'abcde' }),
	);
	const text = getResponseText(response);

	assert.match(text, /Время ревью/);
	assert.match(text, /HH:mm/);
	assert.match(text, /00:00-23:59/);
	assert.match(text, /14:30/);
	assert.equal(createFolderCalled, false);
});

test('/review submit rejects impossible meeting time values', async () => {
	const handleChatEvent = createHandler({
		async createReviewFolder() {
			throw new Error('should not create folder');
		},
	});

	const response = await handleChatEvent(
		config,
		storage,
		reviewSubmitEvent({ meetingTime: '24:00' }),
	);
	const text = getResponseText(response);

	assert.match(text, /00:00-23:59/);
});

test('/review submit includes only internal form link when client form is not needed', async () => {
	const sentMessages: string[] = [];
	const handleChatEvent = createHandler({
		async createReviewFolder(_config, _refreshToken, request) {
			assert.equal(request.needsClientForm, false);
			return {
				id: 'folder-id',
				name: '2026.06',
				webViewLink: 'https://drive.google.com/folder',
				internalForm: {
					id: 'internal-form-id',
					name: 'Ivan Petrov // Internal Feedback Form // 2026-06',
					webViewLink: 'https://docs.google.com/forms/internal-form-id',
				},
			};
		},
		async sendChatMessage(_config, _spaceName, text) {
			sentMessages.push(text);
		},
	});

	await handleChatEvent(
		config,
		storage,
		reviewSubmitEvent({ needsClientForm: false }),
	);
	await flushBackgroundTasks();

	assert.equal(sentMessages[0], REVIEW_WORKFLOW_ACK_MESSAGE);

	const messageText = sentMessages[1] ?? '';

	assert.match(
		messageText,
		/📝 Форма обратной связи \(fuse8\)\nhttps:\/\/docs\.google\.com\/forms\/internal-form-id/,
	);
	assert.doesNotMatch(messageText, /📝 Форма обратной связи \(клиенту\)/);
});

test('/review submit asks to configure report template when it is missing', async () => {
	const handleChatEvent = createHandler({
		async createReviewFolder() {
			throw new Error('should not create folder');
		},
	});

	const response = await handleChatEvent(
		{ ...config, reviewReportTemplateId: '' },
		storage,
		reviewSubmitEvent(),
	);
	const text = getResponseText(response);

	assert.match(text, /Настройте REVIEW_REPORT_TEMPLATE_ID/);
});

test('/review submit creates review without previous review when previousReviewUrl is empty', async () => {
	const sentMessages: string[] = [];
	const handleChatEvent = createHandler({
		async findPreviousReviewReport() {
			throw new Error('should not look up previous review on submit');
		},
		async createReviewFolder(_config, _refreshToken, request) {
			assert.equal(request.previousReviewId, '');
			assert.equal(request.previousReviewUrl, '');
			return {
				id: 'folder-id',
				name: '2026.06',
				webViewLink: 'https://drive.google.com/folder',
				report: {
					id: 'report-id',
					name: 'Ivan Petrov // Отчёт Performance Review // 2026-06',
					webViewLink: 'https://docs.google.com/document/report-id',
				},
			};
		},
		async sendChatMessage(_config, _spaceName, text) {
			sentMessages.push(text);
		},
	});

	const response = await handleChatEvent(
		config,
		storage,
		reviewSubmitEvent({ previousReviewUrl: '' }),
	);
	assert.deepEqual(response.actionResponse, {
		type: 'DIALOG',
		dialogAction: {
			actionStatus: {
				statusCode: 'OK',
				userFacingMessage: '',
			},
		},
	});

	await flushBackgroundTasks();

	assert.equal(sentMessages[0], REVIEW_WORKFLOW_ACK_MESSAGE);

	const messageText = sentMessages[1] ?? '';

	assert.doesNotMatch(messageText, /Папка ревью:/);
	assert.doesNotMatch(messageText, /Previous review:/);
	assert.equal(sentMessages.length, 2);
});

test('/review submit sends Drive error to Chat via bot', async () => {
	const sentMessages: string[] = [];
	const handleChatEvent = createHandler({
		async createReviewFolder() {
			throw new Error('Drive API has not been used in project');
		},
		async sendChatMessage(_config, _spaceName, text) {
			sentMessages.push(text);
		},
	});

	await handleChatEvent(config, storage, reviewSubmitEvent());
	await flushBackgroundTasks();

	assert.equal(sentMessages.length, 2);
	assert.equal(sentMessages[0], REVIEW_WORKFLOW_ACK_MESSAGE);
	assert.match(sentMessages[1] ?? '', /Не удалось создать папку ревью/);
	assert.match(sentMessages[1] ?? '', /Drive API has not been used in project/);
});

test('/review submit returns user-facing text when Drive folder creation fails', async () => {
	const sentMessages: string[] = [];
	const handleChatEvent = createHandler({
		async createReviewFolder() {
			throw new Error('Drive API has not been used in project');
		},
		async sendChatMessage(_config, _spaceName, text) {
			sentMessages.push(text);
		},
	});

	await handleChatEvent(config, storage, reviewSubmitEvent());

	await flushBackgroundTasks();

	assert.equal(sentMessages[0], REVIEW_WORKFLOW_ACK_MESSAGE);
	assert.match(sentMessages[1] ?? '', /Не удалось создать папку ревью/);
	assert.match(sentMessages[1] ?? '', /Drive API has not been used in project/);
});

function reviewCommandEvent(spaceName = 'spaces/AAA'): ChatEvent {
	return {
		user: {
			name: 'users/123',
		},
		appCommandMetadata: {
			appCommandId: 1,
		},
		space: {
			name: spaceName,
		},
	};
}

function settingsCommandEvent(): ChatEvent {
	return {
		user: {
			name: 'users/123',
		},
		appCommandMetadata: {
			appCommandId: 3,
		},
	};
}

function settingsSubmitEvent(overrides: {
	rootFolderId?: string;
	taskCollectDaysBefore?: string;
	taskCheckDaysBefore?: string;
	taskPrepareDaysBefore?: string;
	taskReminderTime?: string;
}): ChatEvent {
	return {
		user: {
			name: 'users/123',
		},
		isDialogEvent: true,
		dialogEventType: 'SUBMIT_DIALOG',
		common: {
			invokedFunction: 'https://example.test/google-chat/events',
			parameters: {
				actionName: 'saveReviewerSettings',
			},
			formInputs: {
				rootFolderId: {
					stringInputs: {
						value: [overrides.rootFolderId ?? 'root-folder-id'],
					},
				},
				taskCollectDaysBefore: {
					stringInputs: {
						value: [overrides.taskCollectDaysBefore ?? '14'],
					},
				},
				taskCheckDaysBefore: {
					stringInputs: {
						value: [overrides.taskCheckDaysBefore ?? '7'],
					},
				},
				taskPrepareDaysBefore: {
					stringInputs: {
						value: [overrides.taskPrepareDaysBefore ?? '3'],
					},
				},
				taskReminderTime: {
					stringInputs: {
						value: [overrides.taskReminderTime ?? '12:00'],
					},
				},
			},
		},
	};
}

function employeeSuggestionsEvent(
	query: string,
	overrides: { spaceName?: string } = {},
): ChatEvent {
	return {
		user: {
			name: 'users/123',
		},
		appCommandMetadata: {
			appCommandId: 1,
			appCommandType: 'SLASH_COMMAND',
		},
		space: overrides.spaceName ? { name: overrides.spaceName } : undefined,
		common: {
			invokedFunction: 'https://example.test/google-chat/events',
			parameters: {
				autocomplete_widget_query: query,
			},
		},
	};
}

function employeeSelectEvent(
	selectedEmployee: string | string[],
	staleInputs: { manualFullName?: string; employeeEmail?: string } = {},
): ChatEvent {
	return {
		user: {
			name: 'users/123',
		},
		isDialogEvent: true,
		common: {
			invokedFunction: 'https://example.test/google-chat/events',
			parameters: {
				actionName: 'selectEmployee',
			},
			formInputs: {
				employeeFolder: {
					stringInputs: {
						value: Array.isArray(selectedEmployee)
							? selectedEmployee
							: [selectedEmployee],
					},
				},
				...(staleInputs.manualFullName
					? {
							manualFullName: {
								stringInputs: {
									value: [staleInputs.manualFullName],
								},
							},
						}
					: {}),
				...(staleInputs.employeeEmail
					? {
							employeeEmail: {
								stringInputs: {
									value: [staleInputs.employeeEmail],
								},
							},
						}
					: {}),
			},
		},
	};
}

function employeeCheckEvent(
	overrides: {
		selectedEmployee?: string;
		manualFullName?: string;
		employeeEmail?: string;
	} = {},
): ChatEvent {
	return {
		user: {
			name: 'users/123',
		},
		isDialogEvent: true,
		dialogEventType: 'SUBMIT_DIALOG',
		common: {
			invokedFunction: 'https://example.test/google-chat/events',
			parameters: {
				actionName: 'checkEmployeeFolder',
			},
			formInputs: {
				employeeFolder: {
					stringInputs: {
						value: overrides.selectedEmployee
							? [overrides.selectedEmployee]
							: [],
					},
				},
				manualFullName: {
					stringInputs: {
						value: overrides.manualFullName ? [overrides.manualFullName] : [],
					},
				},
				employeeEmail: {
					stringInputs: {
						value: [
							overrides.employeeEmail ?? 'iaroslav.zaiarnyi@byteminds.co.uk',
						],
					},
				},
			},
		},
	};
}

function reviewSubmitEvent(
	overrides: {
		employeeEmail?: string;
		meetingTime?: string;
		needsClientForm?: boolean;
		chatSpaceName?: string | null;
		previousReviewId?: string;
		previousReviewUrl?: string;
	} = {},
): ChatEvent {
	const event: ChatEvent = {
		user: {
			name: 'users/123',
		},
		isDialogEvent: true,
		dialogEventType: 'SUBMIT_DIALOG',
		common: {
			invokedFunction: 'https://example.test/google-chat/events',
			parameters: {
				actionName: 'submitReview',
				previousReviewId:
					overrides.previousReviewId ??
					(overrides.previousReviewUrl === '' ? '' : 'previous-report-id'),
				previousReviewUrl:
					overrides.previousReviewUrl ??
					'https://docs.google.com/document/previous-report-id',
			},
			formInputs: {
				fullName: {
					stringInputs: {
						value: ['Ivan Petrov'],
					},
				},
				employeeEmail: {
					stringInputs: {
						value: [
							overrides.employeeEmail ?? 'iaroslav.zaiarnyi@byteminds.co.uk',
						],
					},
				},
				reviewDate: {
					dateInput: {
						msSinceEpoch: String(Date.UTC(2026, 5, 15)),
					},
				},
				meetingTime: {
					stringInputs: {
						value:
							overrides.meetingTime === undefined
								? ['14:30']
								: [overrides.meetingTime],
					},
				},
				needsClientForm: {
					stringInputs: {
						value: overrides.needsClientForm === false ? [] : ['yes'],
					},
				},
			},
		},
	};

	if (overrides.chatSpaceName !== null) {
		event.space = {
			name: overrides.chatSpaceName ?? 'spaces/AAA',
		};
	}

	return event;
}

function getUpdatedCard(response: Record<string, unknown>): {
	header?: { title?: string };
	sections?: Array<{ widgets?: unknown[] }>;
} {
	const actionResponse = response.actionResponse as {
		dialogAction?: {
			dialog?: {
				body?: {
					header?: { title?: string };
					sections?: Array<{ widgets?: unknown[] }>;
				};
			};
		};
	};
	return actionResponse?.dialogAction?.dialog?.body ?? {};
}

function getFirstCard(response: Record<string, unknown>): {
	header?: { title?: string };
	sections?: Array<{ widgets?: unknown[] }>;
} {
	const actionResponse = response.actionResponse as {
		dialogAction?: {
			dialog?: {
				body?: {
					header?: { title?: string };
					sections?: Array<{ widgets?: unknown[] }>;
				};
			};
		};
	};
	return actionResponse?.dialogAction?.dialog?.body ?? {};
}

function getCardText(card: {
	sections?: Array<{ widgets?: unknown[] }>;
}): string {
	return (card.sections ?? [])
		.flatMap((section) => section.widgets ?? [])
		.map((widget) => {
			const textParagraph = (widget as { textParagraph?: { text?: string } })
				.textParagraph;
			return textParagraph?.text ?? '';
		})
		.join('\n');
}

function getCardButtonText(card: {
	sections?: Array<{ widgets?: unknown[] }>;
}): string {
	return (card.sections ?? [])
		.flatMap((section) => section.widgets ?? [])
		.flatMap((widget) => {
			const buttonList = (
				widget as { buttonList?: { buttons?: Array<{ text?: string }> } }
			).buttonList;
			return buttonList?.buttons ?? [];
		})
		.map((button) => button.text ?? '')
		.join('\n');
}

function findTextInputValues(card: {
	sections?: Array<{ widgets?: unknown[] }>;
}): Record<string, string> {
	return Object.fromEntries(
		(card.sections ?? [])
			.flatMap((section) => section.widgets ?? [])
			.map(
				(widget) =>
					(widget as { textInput?: { name?: string; value?: string } })
						.textInput,
			)
			.filter((textInput): textInput is { name: string; value?: string } =>
				Boolean(textInput?.name),
			)
			.map((textInput) => [textInput.name, textInput.value ?? '']),
	);
}

function getResponseText(response: Record<string, unknown>): string {
	if (typeof response.text === 'string') {
		return response.text;
	}

	const action = response.action as {
		notification?: { text?: string };
	};
	if (action?.notification?.text) {
		return action.notification.text;
	}

	const actionResponse = response.actionResponse as {
		dialogAction?: {
			actionStatus?: {
				userFacingMessage?: string;
			};
		};
	};

	if (actionResponse?.dialogAction?.actionStatus?.userFacingMessage) {
		return actionResponse.dialogAction.actionStatus.userFacingMessage;
	}
	return '';
}
