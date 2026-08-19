import type { AppConfig } from './config.js';
import { readFileSync } from 'node:fs';
import {
	createCalendarEvent,
	createReviewerReminderEvents,
	type CreatedReviewerReminderEvent,
	type CreatedCalendarEvent,
} from './calendar.js';
import {
	createReviewFolder,
	ensureEmployeeFolder,
	findPreviousReviewReport,
	formatGoogleDriveFolderUrl,
	listReviewStatuses,
	parseGoogleDriveFolderUrl,
	validateReviewerRootFolder,
	type CreatedFolder,
	type ReviewStatusesResult,
} from './drive.js';
import { sendChatMessage } from './google-chat.js';
import { formatAuthRequiredMessage, isOAuthAuthError } from './oauth-errors.js';
import { buildAuthUrl, getReviewerName } from './oauth.js';
import { searchDirectoryEmployees } from './people.js';
import type { AppStorage } from './storage.js';
import type {
	ChatCard,
	ChatEvent,
	ChatFormInput,
	ChatFormInputs,
	ChatParameters,
	ChatResponse,
	ChatSelectionItem,
	ReviewerSettings,
	ReviewRequest,
} from './types.js';

const SUBMIT_FUNCTION = 'submitReview';
const SELECT_EMPLOYEE_FUNCTION = 'selectEmployee';
const CHECK_EMPLOYEE_FOLDER_FUNCTION = 'checkEmployeeFolder';
const SAVE_REVIEWER_SETTINGS_FUNCTION = 'saveReviewerSettings';
const ADDED_TO_SPACE_EVENT = 'ADDED_TO_SPACE';
const REVIEW_COMMAND_ID = 1;
const INFO_COMMAND_ID = 2;
const SETTINGS_COMMAND_ID = 3;
const STATUS_COMMAND_ID = 4;
const DEFAULT_REVIEW_INTERVAL_MONTHS = 6;
const REVIEW_WORKFLOW_ACK_MESSAGE =
	'Запустил подготовку PR — обычно это занимает около минуты. Результат пришлю сюда.';
const BOT_VERSION = readBotVersion();

type ReviewWorkflowParams = {
	config: ReviewEffectiveConfig;
	storage: AppStorage;
	chatUserId: string;
	event: ChatEvent;
	refreshToken: string;
	reviewerEmail: string;
	request: ReviewRequest;
	reviewMonth: string;
	previousReviewId: string;
	previousReviewUrl: string;
};

type ReviewEffectiveConfig = AppConfig & { reviewsRootFolderId: string };

type ReviewWorkflowResult = {
	textLength: number;
	remindersCount: number;
	hasCalendar: boolean;
};

type ReviewStatusState = 'overdue' | 'soon' | 'actual';

type BackgroundTaskRegister = (task: () => Promise<void>) => void;

export type ScheduleBackgroundTask = (
	label: string,
	task: () => Promise<void>,
) => void;

type ReviewerSettingsCardValues = Pick<
	ReviewerSettings,
	| 'rootFolderId'
	| 'taskCollectDaysBefore'
	| 'taskCheckDaysBefore'
	| 'taskPrepareDaysBefore'
	| 'taskReminderTime'
	| 'reviewIntervalMonths'
>;
const EMPLOYEE_SEARCH_NO_RESULTS_VALUE = '__no_results__';
const EMPLOYEE_SEARCH_NO_RESULTS_TEXT = 'Сотрудник не найден';
const EMPLOYEE_SEARCH_NO_RESULTS_HINT =
	'Попробуйте поиск по другому параметру или на английском языке';
const TRANSLIT_REPLACEMENTS: Array<[string, string]> = [
	['sch', 'щ'],
	['yo', 'ё'],
	['yu', 'ю'],
	['ya', 'я'],
	['ye', 'е'],
	['zh', 'ж'],
	['ch', 'ч'],
	['sh', 'ш'],
	['kh', 'х'],
	['lts', 'льц'],
	['ts', 'ц'],
	['ey', 'ей'],
	['ry', 'рий'],
	['iy', 'ий'],
	['a', 'а'],
	['b', 'б'],
	['v', 'в'],
	['g', 'г'],
	['d', 'д'],
	['e', 'е'],
	['z', 'з'],
	['i', 'и'],
	['y', 'й'],
	['k', 'к'],
	['l', 'л'],
	['m', 'м'],
	['n', 'н'],
	['o', 'о'],
	['p', 'п'],
	['r', 'р'],
	['s', 'с'],
	['t', 'т'],
	['u', 'у'],
	['f', 'ф'],
	['h', 'х'],
	['c', 'к'],
	['j', 'дж'],
	['w', 'в'],
	['x', 'кс'],
	['q', 'к'],
];
const REVERSE_TRANSLIT_REPLACEMENTS = buildReverseTranslReplacements(
	TRANSLIT_REPLACEMENTS,
);

type ChatEventHandlerDeps = {
	createReviewFolder: typeof createReviewFolder;
	createCalendarEvent: typeof createCalendarEvent;
	createReviewerReminderEvents: typeof createReviewerReminderEvents;
	ensureEmployeeFolder: typeof ensureEmployeeFolder;
	findPreviousReviewReport: typeof findPreviousReviewReport;
	listReviewStatuses: typeof listReviewStatuses;
	searchDirectoryEmployees: typeof searchDirectoryEmployees;
	getReviewerName: typeof getReviewerName;
	buildAuthUrl: typeof buildAuthUrl;
	sendChatMessage: typeof sendChatMessage;
	validateReviewerRootFolder: typeof validateReviewerRootFolder;
	scheduleBackgroundTask: ScheduleBackgroundTask;
	getCurrentDate: () => Date;
};

export function createBackgroundTaskScheduler(
	registerTask: BackgroundTaskRegister,
): ScheduleBackgroundTask {
	return (label, task) => {
		logChatEvent('backgroundTask.registered', { label });
		registerTask(async () => {
			try {
				await task();
				logChatEvent('backgroundTask.success', { label });
			} catch (error) {
				const message =
					error instanceof Error ? error.message : 'Unknown error';
				logChatEvent('backgroundTask.failed', { label, message });
			}
		});
	};
}

const defaultScheduleBackgroundTask = createBackgroundTaskScheduler((task) => {
	setImmediate(() => {
		void task();
	});
});

const defaultDeps: ChatEventHandlerDeps = {
	createReviewFolder,
	createCalendarEvent,
	createReviewerReminderEvents,
	ensureEmployeeFolder,
	findPreviousReviewReport,
	listReviewStatuses,
	searchDirectoryEmployees,
	getReviewerName,
	buildAuthUrl,
	sendChatMessage,
	validateReviewerRootFolder,
	scheduleBackgroundTask: defaultScheduleBackgroundTask,
	getCurrentDate: () => new Date(),
};

export function createChatEventHandler(
	deps: Partial<ChatEventHandlerDeps> = {},
) {
	const resolvedDeps = { ...defaultDeps, ...deps };

	return async function handleChatEventWithDeps(
		config: AppConfig,
		storage: AppStorage,
		event: ChatEvent,
	): Promise<ChatResponse> {
		const chatUserId = event.user?.name ?? undefined;
		const appCommandId = resolveAppCommandId(event);
		const invokedFunction = event.common?.invokedFunction ?? undefined;
		const actionName = resolveActionName(event);
		const formInputs = event.common?.formInputs ?? {};

		logChatEvent('received', {
			appCommandId,
			actionName,
			invokedFunction,
			hasChatUserId: Boolean(chatUserId),
			formInputKeys: Object.keys(formInputs),
			dialogEventType: event.dialogEventType,
			isDialogEvent: event.isDialogEvent,
			spaceName: resolveChatSpaceName(event),
		});

		if (event.type === ADDED_TO_SPACE_EVENT) {
			logChatEvent('route.addedToSpace');
			return handleAddedToSpace(
				config,
				storage,
				chatUserId,
				event,
				resolvedDeps,
			);
		}

		if (isEmployeeSuggestionsEvent(config, event, invokedFunction)) {
			logChatEvent('route.employeeSuggestions');
			return handleEmployeeSuggestions(
				config,
				storage,
				chatUserId,
				event,
				resolvedDeps,
			);
		}

		if (appCommandId === INFO_COMMAND_ID) {
			logChatEvent('route.info');
			return textResponse(buildInfoMessage());
		}

		if (!chatUserId) {
			logChatEvent('route.missingUser');
			return textResponse('Не удалось определить пользователя Google Chat.');
		}

		if (actionName === SUBMIT_FUNCTION) {
			logChatEvent('route.submit');
			return handleReviewSubmit(
				config,
				storage,
				chatUserId,
				event,
				resolvedDeps,
			);
		}

		if (actionName === SAVE_REVIEWER_SETTINGS_FUNCTION) {
			logChatEvent('route.saveReviewerSettings');
			return handleReviewerSettingsSubmit(
				config,
				storage,
				chatUserId,
				event,
				resolvedDeps,
			);
		}

		if (actionName === CHECK_EMPLOYEE_FOLDER_FUNCTION) {
			logChatEvent('route.checkEmployeeFolder');
			return handleEmployeeFolderCheck(
				config,
				storage,
				chatUserId,
				event,
				resolvedDeps,
			);
		}

		if (actionName === SELECT_EMPLOYEE_FUNCTION) {
			logChatEvent('route.selectEmployee');
			return handleEmployeeSelect(config, event);
		}

		if (appCommandId === REVIEW_COMMAND_ID) {
			logChatEvent('route.reviewDialog');
			const token = await storage.get(chatUserId);
			if (!token) {
				return respondReviewerAuthRequired(
					config,
					storage,
					chatUserId,
					resolvedDeps,
					event,
					'dialog_card',
				);
			}
			const settings = await storage.getReviewerSettings(chatUserId);
			if (!settings?.rootFolderId) {
				return textResponse(buildMissingReviewerSettingsMessage());
			}
			return dialogResponse(employeeLookupCard(config));
		}

		if (appCommandId === STATUS_COMMAND_ID) {
			logChatEvent('route.status');
			return handleReviewStatusCommand(
				config,
				storage,
				chatUserId,
				event,
				resolvedDeps,
			);
		}

		if (appCommandId === SETTINGS_COMMAND_ID) {
			logChatEvent('route.settingsDialog');
			return handleReviewerSettingsCommand(
				config,
				storage,
				chatUserId,
				event,
				resolvedDeps,
			);
		}

		logChatEvent('route.unknownCommand', { appCommandId, actionName });
		return textResponse('Неизвестная команда Google Chat.');
	};
}

export const handleChatEvent = createChatEventHandler();

async function handleAddedToSpace(
	config: AppConfig,
	storage: AppStorage,
	chatUserId: string | undefined,
	event: ChatEvent,
	deps: ChatEventHandlerDeps,
): Promise<ChatResponse> {
	if (!chatUserId) {
		logChatEvent('addedToSpace.missingUser');
		return textResponse('Не удалось определить пользователя Google Chat.');
	}

	const authUrl = await deps.buildAuthUrl(config, storage, chatUserId);
	await sendInstallAuthLink(config, deps, event, authUrl);
	return textResponse(buildInfoMessage());
}

async function sendInstallAuthLink(
	config: AppConfig,
	deps: ChatEventHandlerDeps,
	event: ChatEvent,
	authUrl: string,
): Promise<void> {
	const spaceName = resolveChatSpaceName(event);
	if (!spaceName) {
		logChatEvent('addedToSpace.sendAuthLink.skipped', {
			reason: 'missing_space',
		});
		return;
	}

	try {
		await deps.sendChatMessage(
			config,
			spaceName,
			buildInstallAuthMessage(authUrl),
		);
		logChatEvent('addedToSpace.sendAuthLink.success', { spaceName });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		logChatEvent('addedToSpace.sendAuthLink.failed', { spaceName, message });
	}
}

function buildInstallAuthMessage(authUrl: string): string {
	return [
		'Подключите Google-аккаунт ревьюера перед запуском /review:',
		authUrl,
	].join('\n');
}

function buildInfoMessage(): string {
	return [
		'🚀 Performance Review Assistant',
		'',
		`Версия: v${BOT_VERSION}`,
		'',
		'────────────────────────────────────',
		'',
		'📋 Доступные команды',
		'',
		'• /review    Создать ревью',
		'• /status    Проверить актуальность ревью',
		'• /settings  Настроить папку, периодичность и напоминания',
		'• /info      Узнать о боте и его командах',
		'',
		'🕒 Важно',
		'',
		'Перед /review настройте корневую папку через /settings.',
		'Без нее запуск Performance Review недоступен.',
		'',
		'Все даты и время ревью, встреч и задач указываются',
		'по челябинскому времени (UTC+5).',
	].join('\n');
}

async function handleReviewerSettingsCommand(
	config: AppConfig,
	storage: AppStorage,
	chatUserId: string,
	event: ChatEvent,
	deps: ChatEventHandlerDeps,
): Promise<ChatResponse> {
	const token = await storage.get(chatUserId);
	if (!token) {
		return respondReviewerAuthRequired(
			config,
			storage,
			chatUserId,
			deps,
			event,
			'dialog_card',
		);
	}

	const settings = await storage.getReviewerSettings(chatUserId);
	return dialogResponse(reviewerSettingsCard(config, settings));
}

async function handleReviewerSettingsSubmit(
	config: AppConfig,
	storage: AppStorage,
	chatUserId: string,
	event: ChatEvent,
	deps: ChatEventHandlerDeps,
): Promise<ChatResponse> {
	const isDialogSubmit = event.dialogEventType === 'SUBMIT_DIALOG';
	const token = await storage.get(chatUserId);
	if (!token) {
		return respondReviewerAuthRequired(
			config,
			storage,
			chatUserId,
			deps,
			event,
			'dialog_card',
		);
	}

	const parsed = parseReviewerSettings(
		chatUserId,
		event.common?.formInputs ?? {},
	);
	if (!parsed.ok) {
		return respondReviewMessage(
			isDialogSubmit,
			parsed.error,
			'INVALID_ARGUMENT',
		);
	}

	try {
		await deps.validateReviewerRootFolder(
			config,
			token.refreshToken,
			parsed.value.rootFolderId,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		logChatEvent('settings.validateRootFolder.failed', { message });
		return dialogResponse(
			reviewerSettingsCard(config, parsed.value, {
				error: 'Папка должна быть доступна через Google Drive.',
			}),
		);
	}

	await storage.saveReviewerSettings({
		...parsed.value,
		updatedAt: new Date().toISOString(),
	});

	return respondReviewMessage(isDialogSubmit, 'Настройки сохранены.', 'OK');
}

async function handleReviewStatusCommand(
	config: AppConfig,
	storage: AppStorage,
	chatUserId: string,
	event: ChatEvent,
	deps: ChatEventHandlerDeps,
): Promise<ChatResponse> {
	const token = await storage.get(chatUserId);
	if (!token) {
		return respondReviewerAuthRequired(
			config,
			storage,
			chatUserId,
			deps,
			event,
			'dialog_card',
		);
	}

	const settings = await storage.getReviewerSettings(chatUserId);
	if (!settings?.rootFolderId) {
		return textResponse(buildMissingReviewerSettingsMessage());
	}

	const startedAt = Date.now();
	const effectiveConfig = buildReviewEffectiveConfig(config, settings);
	logChatEvent('status.start');
	try {
		const statuses = await deps.listReviewStatuses(
			effectiveConfig,
			token.refreshToken,
		);
		const durationMs = Date.now() - startedAt;
		const foundReviews = statuses.employees.filter(
			(status) => status.lastReview,
		).length;
		logChatEvent('status.success', {
			employeesCount: statuses.employees.length,
			foundReviews,
			driveRequestCount: statuses.driveRequestCount,
			durationMs,
		});
		return textResponse(
			formatReviewStatusMessage(
				statuses,
				settings.reviewIntervalMonths ?? DEFAULT_REVIEW_INTERVAL_MONTHS,
				deps.getCurrentDate(),
			),
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		logChatEvent('status.failed', { message });
		return textResponse(`Ошибка Google Drive: ${message}`);
	}
}

function readBotVersion(): string {
	const packageJsonPath = new URL('../package.json', import.meta.url);
	const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
		version?: string;
	};
	return packageJson.version ?? 'unknown';
}

async function handleEmployeeSuggestions(
	config: AppConfig,
	storage: AppStorage,
	chatUserId: string | undefined,
	event: ChatEvent,
	deps: ChatEventHandlerDeps,
): Promise<ChatResponse> {
	if (!chatUserId) {
		return employeeSuggestionsResponse([]);
	}

	const rawQuery = event.common?.parameters?.autocomplete_widget_query ?? '';
	if (!rawQuery.trim()) {
		logChatEvent('employeeSuggestions.emptyQuery');
		return employeeSuggestionsResponse([]);
	}

	const token = await storage.get(chatUserId);
	if (!token) {
		logChatEvent('employeeSuggestions.authRequired', { chatUserId });
		return respondReviewerAuthRequired(
			config,
			storage,
			chatUserId,
			deps,
			event,
			'employee_suggestions',
		);
	}

	const query = getDirectorySearchQuery(rawQuery);
	let employees: Array<{ fullName: string; email: string }>;
	try {
		employees = await deps.searchDirectoryEmployees(
			config,
			token.refreshToken,
			query,
		);
	} catch (error) {
		if (isOAuthAuthError(error)) {
			logChatEvent('employeeSuggestions.authFailed', {
				chatUserId,
				message: error instanceof Error ? error.message : String(error),
			});
			return respondReviewerAuthRequired(
				config,
				storage,
				chatUserId,
				deps,
				event,
				'employee_suggestions',
				{
					clearStaleToken: true,
				},
			);
		}
		throw error;
	}

	logChatEvent('employeeSuggestions.result', {
		query: rawQuery,
		searchQuery: query,
		count: employees.length,
	});

	return employeeSuggestionsResponse(
		buildEmployeeSearchSuggestions(rawQuery, employees),
	);
}

function buildEmployeeSearchSuggestions(
	rawQuery: string,
	employees: Array<{ fullName: string; email: string }>,
): Array<{ text: string; value: string; bottomText?: string }> {
	if (employees.length > 0) {
		return employees.map((employee) => ({
			text: `${employee.fullName} (${employee.email})`,
			value: encodeEmployeeSelection(employee.email, employee.fullName),
		}));
	}

	if (!rawQuery.trim()) {
		return [];
	}

	return [
		{
			text: EMPLOYEE_SEARCH_NO_RESULTS_TEXT,
			bottomText: EMPLOYEE_SEARCH_NO_RESULTS_HINT,
			value: EMPLOYEE_SEARCH_NO_RESULTS_VALUE,
		},
	];
}

async function handleEmployeeFolderCheck(
	config: AppConfig,
	storage: AppStorage,
	chatUserId: string,
	event: ChatEvent,
	deps: ChatEventHandlerDeps,
): Promise<ChatResponse> {
	const isDialogSubmit = event.dialogEventType === 'SUBMIT_DIALOG';
	const inputs = event.common?.formInputs ?? {};
	const manualFullName = getStringInput(inputs.manualFullName).trim();
	const employeeEmail = getStringInput(inputs.employeeEmail)
		.trim()
		.toLowerCase();

	if (!manualFullName) {
		return respondReviewMessage(
			isDialogSubmit,
			'Укажите имя и фамилию в поле «Имя и фамилия».',
			'INVALID_ARGUMENT',
		);
	}

	const token = await storage.get(chatUserId);
	if (!token) {
		logChatEvent('employeeCheck.authRequired', { chatUserId });
		return respondReviewerAuthRequired(
			config,
			storage,
			chatUserId,
			deps,
			event,
			'chat_message',
		);
	}
	const settings = await storage.getReviewerSettings(chatUserId);
	if (!settings?.rootFolderId) {
		return respondReviewMessage(
			isDialogSubmit,
			buildMissingReviewerSettingsMessage(),
			'INVALID_ARGUMENT',
		);
	}
	const effectiveConfig = buildReviewEffectiveConfig(config, settings);

	let ensuredFolder;
	try {
		ensuredFolder = await deps.ensureEmployeeFolder(
			effectiveConfig,
			token.refreshToken,
			manualFullName,
		);
	} catch (error) {
		if (isOAuthAuthError(error)) {
			logChatEvent('employeeCheck.authFailed', {
				chatUserId,
				message: error instanceof Error ? error.message : String(error),
			});
			return respondReviewerAuthRequired(
				config,
				storage,
				chatUserId,
				deps,
				event,
				'chat_message',
				{
					clearStaleToken: true,
				},
			);
		}
		const message = error instanceof Error ? error.message : 'Unknown error';
		logChatEvent('employeeCheck.folder.failed', {
			chatUserId,
			fullName: manualFullName,
			message,
		});
		return respondReviewMessage(
			isDialogSubmit,
			`Ошибка Google Drive: ${message}`,
			'INVALID_ARGUMENT',
		);
	}
	const employeeFolderStatus = ensuredFolder.created
		? '✅ Папка сотрудника создана автоматически.'
		: '✅ Папка сотрудника найдена.';

	const currentMonth = formatReviewMonth(new Date().toISOString());
	let previousReviewStatus = 'В папке ревью пока нет';
	let previousReviewId = '';
	let previousReviewUrl = '';
	if (!ensuredFolder.created) {
		try {
			const previousReview = await deps.findPreviousReviewReport(
				effectiveConfig,
				token.refreshToken,
				manualFullName,
				currentMonth,
			);

			if (previousReview) {
				previousReviewId = previousReview.id;
				previousReviewUrl = previousReview.webViewLink;
				previousReviewStatus = `Предыдущее ревью: ${formatPreviousReviewLabel(previousReview.name)}`;
				logChatEvent('employeeCheck.previousReview.found', {
					reportName: previousReview.name,
					webViewLink: previousReview.webViewLink,
				});
			} else {
				logChatEvent('employeeCheck.previousReview.missing', {
					fullName: manualFullName,
					reviewMonth: currentMonth,
				});
			}
		} catch (error) {
			if (isOAuthAuthError(error)) {
				logChatEvent('employeeCheck.previousReview.authFailed', {
					chatUserId,
					message: error instanceof Error ? error.message : String(error),
				});
				return respondReviewerAuthRequired(
					config,
					storage,
					chatUserId,
					deps,
					event,
					'chat_message',
					{
						clearStaleToken: true,
					},
				);
			}
			throw error;
		}
	}

	return dialogResponse(
		reviewFormCard(config, {
			fullName: manualFullName,
			employeeEmail,
			employeeFolderStatus,
			previousReviewStatus,
			previousReviewId,
			previousReviewUrl,
		}),
	);
}

function handleEmployeeSelect(
	config: AppConfig,
	event: ChatEvent,
): ChatResponse {
	const inputs = event.common?.formInputs ?? {};
	const selectedEmployee = parseEmployeeSelection(
		getLastStringInput(inputs.employeeFolder),
	);

	if (!selectedEmployee) {
		return dialogResponse(employeeLookupCard(config));
	}

	return dialogResponse(
		employeeLookupCard(config, {
			fullName: transliterateEmployeeName(selectedEmployee.name),
			displayName: selectedEmployee.name,
			email: selectedEmployee.id,
			selectedEmployeeValue: encodeEmployeeSelection(
				selectedEmployee.id,
				selectedEmployee.name,
			),
		}),
	);
}

async function handleReviewSubmit(
	config: AppConfig,
	storage: AppStorage,
	chatUserId: string,
	event: ChatEvent,
	deps: ChatEventHandlerDeps,
): Promise<ChatResponse> {
	const isDialogSubmit = event.dialogEventType === 'SUBMIT_DIALOG';
	const inputs = event.common?.formInputs ?? {};
	logChatEvent('submit.inputs', summarizeFormInputs(inputs));

	const parsed = parseReviewRequest(
		config,
		inputs,
		event.common?.parameters ?? {},
	);

	if (!parsed.ok) {
		logChatEvent('submit.validationFailed', { error: parsed.error });
		if (isDialogSubmit) {
			return dialogActionStatusResponse(parsed.error, 'INVALID_ARGUMENT');
		}
		return actionResponseText(parsed.error);
	}

	const configError = validateReviewConfig(config);
	if (configError) {
		logChatEvent('submit.validationFailed', { error: configError });
		return respondReviewMessage(
			isDialogSubmit,
			configError,
			'INVALID_ARGUMENT',
		);
	}

	const token = await storage.get(chatUserId);
	if (!token) {
		logChatEvent('submit.authRequired', { chatUserId });
		return respondReviewerAuthRequired(
			config,
			storage,
			chatUserId,
			deps,
			event,
			'dialog_card',
		);
	}
	const settings = await storage.getReviewerSettings(chatUserId);
	if (!settings?.rootFolderId) {
		return respondReviewMessage(
			isDialogSubmit,
			buildMissingReviewerSettingsMessage(),
			'INVALID_ARGUMENT',
		);
	}
	const effectiveConfig = buildReviewEffectiveConfig(config, settings);

	const month = formatReviewMonth(parsed.value.reviewDate);

	return startReviewWorkflowFromDialog(
		{
			config: effectiveConfig,
			storage,
			chatUserId,
			event,
			refreshToken: token.refreshToken,
			reviewerEmail: token.googleUserEmail,
			request: parsed.value,
			reviewMonth: month,
			previousReviewId: parsed.value.previousReviewId,
			previousReviewUrl: parsed.value.previousReviewUrl,
		},
		deps,
	);
}

async function startReviewWorkflowFromDialog(
	params: ReviewWorkflowParams,
	deps: ChatEventHandlerDeps,
): Promise<ChatResponse> {
	await sendSubmitResultToChat(
		params.config,
		deps,
		params.event,
		REVIEW_WORKFLOW_ACK_MESSAGE,
	);
	scheduleReviewWorkflow(params, deps);
	return respondDialogSubmitAck('OK');
}

function scheduleReviewWorkflow(
	params: ReviewWorkflowParams,
	deps: ChatEventHandlerDeps,
): void {
	logChatEvent('submit.workflow.start', {
		fullName: params.request.fullName,
		reviewMonth: params.reviewMonth,
		spaceName: resolveChatSpaceName(params.event),
	});

	deps.scheduleBackgroundTask('submit.workflow', async () => {
		try {
			const result = await runReviewWorkflow(params, deps);
			logChatEvent('submit.workflow.success', {
				spaceName: resolveChatSpaceName(params.event),
				textLength: result.textLength,
				remindersCount: result.remindersCount,
				hasCalendar: result.hasCalendar,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logChatEvent('submit.workflow.failed', { message });
			throw error;
		}
	});
}

async function runReviewWorkflow(
	params: ReviewWorkflowParams,
	deps: ChatEventHandlerDeps,
): Promise<ReviewWorkflowResult> {
	const {
		config,
		event,
		refreshToken,
		reviewerEmail,
		request,
		reviewMonth,
		previousReviewId,
		previousReviewUrl,
	} = params;
	logChatEvent('submit.createFolder.start', {
		fullName: request.fullName,
		reviewMonth,
		needsClientForm: request.needsClientForm,
		hasPreviousReview: Boolean(previousReviewUrl),
	});
	const reviewerName = await resolveReviewerName(
		config,
		deps,
		refreshToken,
		reviewerEmail,
	);
	let folder;
	try {
		folder = await deps.createReviewFolder(config, refreshToken, {
			fullName: request.fullName,
			employeeEmail: request.employeeEmail,
			reviewerEmail,
			reviewerName,
			reviewDate: request.reviewDate,
			meetingTime: request.meetingTime,
			reviewMonth,
			needsClientForm: request.needsClientForm,
			previousReviewId,
			previousReviewUrl,
		});
	} catch (error) {
		const authDelivered = await deliverWorkflowAuthRequired(
			error,
			params,
			deps,
			'createFolder',
		);
		if (authDelivered) {
			return authDelivered;
		}

		const message = error instanceof Error ? error.message : 'Unknown error';
		logChatEvent('submit.createFolder.failed', { message });
		const errorText = [
			'Не удалось создать папку ревью.',
			`Ошибка Google Drive: ${message}`,
		].join('\n');

		await deliverWorkflowResultToChat(config, deps, event, errorText);
		return {
			textLength: errorText.length,
			remindersCount: 0,
			hasCalendar: false,
		};
	}
	logChatEvent('submit.createFolder.success', {
		folderName: folder.name,
		hasLink: Boolean(folder.webViewLink),
	});

	let calendarEvent: CreatedCalendarEvent;
	const calendarRequest = {
		fullName: request.fullName,
		employeeEmail: request.employeeEmail,
		reviewerEmail,
		reviewDate: request.reviewDate,
		meetingTime: request.meetingTime,
		folderUrl: folder.webViewLink,
		reportUrl: folder.report?.webViewLink,
		internalFormUrl: folder.internalForm?.webViewLink,
		clientFormUrl: folder.clientForm?.webViewLink,
		previousReviewUrl,
	};
	try {
		calendarEvent = await deps.createCalendarEvent(
			config,
			refreshToken,
			calendarRequest,
		);
	} catch (error) {
		const authDelivered = await deliverWorkflowAuthRequired(
			error,
			params,
			deps,
			'createCalendarEvent',
		);
		if (authDelivered) {
			return authDelivered;
		}

		const message = error instanceof Error ? error.message : 'Unknown error';
		logChatEvent('submit.createCalendarEvent.failed', { message });
		const errorText = [
			'Не удалось создать встречу ревью.',
			`Ошибка Google Calendar: ${message}`,
		].join('\n');

		await deliverWorkflowResultToChat(config, deps, event, errorText);
		return {
			textLength: errorText.length,
			remindersCount: 0,
			hasCalendar: false,
		};
	}
	logChatEvent('submit.createCalendarEvent.success', {
		summary: calendarEvent.summary,
		hasLink: Boolean(calendarEvent.htmlLink),
	});

	let reminderEvents: CreatedReviewerReminderEvent[];
	try {
		reminderEvents = await deps.createReviewerReminderEvents(
			config,
			refreshToken,
			calendarRequest,
		);
	} catch (error) {
		const authDelivered = await deliverWorkflowAuthRequired(
			error,
			params,
			deps,
			'createReviewerReminderEvents',
		);
		if (authDelivered) {
			return authDelivered;
		}

		const message = error instanceof Error ? error.message : 'Unknown error';
		logChatEvent('submit.createReviewerReminderEvents.failed', { message });
		const errorText = [
			"Не удалось создать reminder'ы ревьюера.",
			`Ошибка Google Calendar: ${message}`,
		].join('\n');

		await deliverWorkflowResultToChat(config, deps, event, errorText);
		return {
			textLength: errorText.length,
			remindersCount: 0,
			hasCalendar: false,
		};
	}
	logChatEvent('submit.createReviewerReminderEvents.success', {
		count: reminderEvents.length,
	});

	const successText = formatReviewSuccessMessage(
		request.fullName,
		folder,
		request.needsClientForm,
		calendarEvent,
		reminderEvents,
	);

	await deliverWorkflowResultToChat(config, deps, event, successText);
	return {
		textLength: successText.length,
		remindersCount: reminderEvents.length,
		hasCalendar: Boolean(calendarEvent),
	};
}

async function resolveReviewerName(
	config: AppConfig,
	deps: ChatEventHandlerDeps,
	refreshToken: string,
	reviewerEmail: string,
): Promise<string> {
	try {
		return (await deps.getReviewerName(config, refreshToken)) || reviewerEmail;
	} catch {
		return reviewerEmail;
	}
}

function validateReviewConfig(config: AppConfig): string | null {
	if (!config.reviewReportTemplateId) {
		return 'Настройте REVIEW_REPORT_TEMPLATE_ID в .env или .env.';
	}
	return null;
}

function buildReviewEffectiveConfig(
	config: AppConfig,
	settings: ReviewerSettings,
): ReviewEffectiveConfig {
	return {
		...config,
		reviewsRootFolderId: settings.rootFolderId,
		taskCollectDaysBefore: settings.taskCollectDaysBefore,
		taskCheckDaysBefore: settings.taskCheckDaysBefore,
		taskPrepareDaysBefore: settings.taskPrepareDaysBefore,
		taskReminderTime: settings.taskReminderTime,
	};
}

function buildMissingReviewerSettingsMessage(): string {
	return 'Сначала настройте /settings: укажите ссылку на корневую папку ваших Performance Review.';
}

function respondReviewMessage(
	isDialogSubmit: boolean,
	text: string,
	statusCode: 'OK' | 'INVALID_ARGUMENT',
): ChatResponse {
	if (isDialogSubmit) {
		return dialogActionStatusResponse(text, statusCode);
	}
	return actionResponseText(text);
}

function parseReviewRequest(
	config: AppConfig,
	inputs: ChatFormInputs,
	parameters: ChatParameters = {},
): { ok: true; value: ReviewRequest } | { ok: false; error: string } {
	const fullName = getStringInput(inputs.fullName).trim();
	const employeeEmail = getStringInput(inputs.employeeEmail)
		.trim()
		.toLowerCase();
	const reviewDate = getDateInput(inputs.reviewDate);
	const meetingTime = getStringInput(inputs.meetingTime).trim();
	const needsClientForm = getStringInput(inputs.needsClientForm) === 'yes';
	const previousReviewId = parameters.previousReviewId ?? '';
	const previousReviewUrl = parameters.previousReviewUrl ?? '';

	if (!fullName) {
		return { ok: false, error: 'Укажите имя и фамилию.' };
	}

	if (!employeeEmail) {
		return { ok: false, error: 'Укажите email сотрудника.' };
	}

	if (config.employeeEmailDomains.length === 0) {
		return {
			ok: false,
			error: 'Настройте EMPLOYEE_EMAIL_DOMAINS в .env.local или .env.',
		};
	}

	if (!isEmailInDomains(employeeEmail, config.employeeEmailDomains)) {
		return {
			ok: false,
			error: `Email сотрудника должен быть в одном из доменов: ${config.employeeEmailDomains.join(', ')}.`,
		};
	}

	if (!reviewDate) {
		return { ok: false, error: 'Укажите дату ревью.' };
	}

	if (!meetingTime) {
		return { ok: false, error: 'Укажите время ревью.' };
	}

	if (!isValidMeetingTime(meetingTime)) {
		return {
			ok: false,
			error:
				'Время ревью должно быть в формате HH:mm, диапазон 00:00-23:59. Например: 14:30.',
		};
	}

	return {
		ok: true,
		value: {
			fullName,
			employeeEmail,
			reviewDate,
			meetingTime,
			needsClientForm,
			previousReviewId,
			previousReviewUrl,
		},
	};
}

function parseReviewerSettings(
	chatUserId: string,
	inputs: ChatFormInputs,
):
	| { ok: true; value: Omit<ReviewerSettings, 'updatedAt'> }
	| {
			ok: false;
			error: string;
	  } {
	const rootFolderUrl = getStringInput(inputs.rootFolderUrl).trim();
	const taskCollectDaysBefore = parseNonNegativeIntegerInput(
		inputs.taskCollectDaysBefore,
		'Дней до сбора отзывов',
	);
	const taskCheckDaysBefore = parseNonNegativeIntegerInput(
		inputs.taskCheckDaysBefore,
		'Дней до проверки отзывов',
	);
	const taskPrepareDaysBefore = parseNonNegativeIntegerInput(
		inputs.taskPrepareDaysBefore,
		'Дней до подготовки',
	);
	const taskReminderTime = getStringInput(inputs.taskReminderTime).trim();
	const reviewIntervalMonths = parsePositiveIntegerInput(
		inputs.reviewIntervalMonths,
		'Период ревью в месяцах',
	);

	if (!rootFolderUrl) {
		return { ok: false, error: 'Укажите ссылку на корневую папку.' };
	}

	let rootFolderId: string;
	try {
		rootFolderId = parseGoogleDriveFolderUrl(rootFolderUrl);
	} catch {
		return {
			ok: false,
			error: 'Укажите корректную ссылку на папку Google Drive.',
		};
	}

	if (!taskCollectDaysBefore.ok) {
		return taskCollectDaysBefore;
	}

	if (!taskCheckDaysBefore.ok) {
		return taskCheckDaysBefore;
	}

	if (!taskPrepareDaysBefore.ok) {
		return taskPrepareDaysBefore;
	}

	if (!reviewIntervalMonths.ok) {
		return reviewIntervalMonths;
	}

	if (!taskReminderTime) {
		return { ok: false, error: 'Укажите время задач.' };
	}

	if (!isValidMeetingTime(taskReminderTime)) {
		return {
			ok: false,
			error:
				'Время задач должно быть в формате HH:mm, диапазон 00:00-23:59. Например: 12:00.',
		};
	}

	return {
		ok: true,
		value: {
			chatUserId,
			rootFolderId,
			taskCollectDaysBefore: taskCollectDaysBefore.value,
			taskCheckDaysBefore: taskCheckDaysBefore.value,
			taskPrepareDaysBefore: taskPrepareDaysBefore.value,
			taskReminderTime,
			reviewIntervalMonths: reviewIntervalMonths.value,
		},
	};
}

function parseNonNegativeIntegerInput(
	input: ChatFormInput | undefined,
	label: string,
): { ok: true; value: number } | { ok: false; error: string } {
	const rawValue = getStringInput(input).trim();
	if (!/^\d+$/.test(rawValue)) {
		return {
			ok: false,
			error: `${label}: укажите целое число 0 или больше.`,
		};
	}

	return { ok: true, value: Number(rawValue) };
}

function parsePositiveIntegerInput(
	input: ChatFormInput | undefined,
	label: string,
): { ok: true; value: number } | { ok: false; error: string } {
	const rawValue = getStringInput(input).trim();
	if (!/^\d+$/.test(rawValue) || Number(rawValue) < 1) {
		return {
			ok: false,
			error: `${label}: укажите целое число 1 или больше.`,
		};
	}

	return { ok: true, value: Number(rawValue) };
}

function getStringInput(input: ChatFormInput | undefined): string {
	return input?.stringInputs?.value?.[0] ?? '';
}

function getLastStringInput(input: ChatFormInput | undefined): string {
	const values = input?.stringInputs?.value ?? [];
	return values.at(-1) ?? '';
}

function getDateInput(input: ChatFormInput | undefined): string {
	const msSinceEpoch = input?.dateInput?.msSinceEpoch;
	if (!msSinceEpoch) {
		return '';
	}
	return new Date(Number(msSinceEpoch)).toISOString().slice(0, 10);
}

function logChatEvent(message: string, data?: Record<string, unknown>): void {
	if (process.env.NODE_ENV === 'test') {
		return;
	}

	const timestamp = new Date().toISOString();
	if (data) {
		console.log(`[chat] ${timestamp} ${message}`, JSON.stringify(data));
		return;
	}
	console.log(`[chat] ${timestamp} ${message}`);
}

function summarizeFormInputs(inputs: ChatFormInputs): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(inputs).map(([key, value]) => [
			key,
			{
				hasStringInputs: Boolean(value.stringInputs?.value?.length),
				hasDateInput: Boolean(value.dateInput?.msSinceEpoch),
			},
		]),
	);
}

function formatReviewMonth(date: string): string {
	return date.slice(0, 7).replace('-', '.');
}

function formatPreviousReviewLabel(reportName: string): string {
	const match = reportName.match(/(\d{4})[-.](\d{2})/);
	if (!match) {
		return reportName;
	}

	const monthNames = [
		'январь',
		'февраль',
		'март',
		'апрель',
		'май',
		'июнь',
		'июль',
		'август',
		'сентябрь',
		'октябрь',
		'ноябрь',
		'декабрь',
	];
	const monthName = monthNames[Number(match[2]) - 1];

	return monthName ? `${monthName} ${match[1]}` : match[0];
}

function formatReviewStatusMessage(
	statuses: ReviewStatusesResult,
	reviewIntervalMonths: number,
	currentDate: Date,
): string {
	const today = startOfDay(currentDate);
	const soonThreshold = addDays(today, 30);
	const missing = statuses.employees.filter((status) => !status.lastReview);
	const rows = statuses.employees
		.filter((status) => status.lastReview)
		.map((status) => {
			const lastReview = status.lastReview!;
			const nextReviewDate = addMonths(
				parseIsoDate(lastReview.date),
				reviewIntervalMonths,
			);
			const state: ReviewStatusState =
				nextReviewDate <= today
					? 'overdue'
					: nextReviewDate <= soonThreshold
						? 'soon'
						: 'actual';
			return {
				employeeName: status.employee.name,
				lastReviewDate: parseIsoDate(lastReview.date),
				nextReviewDate,
				state,
			};
		})
		.sort((left, right) => {
			const stateOrder = { overdue: 0, soon: 1, actual: 2 };
			const byState = stateOrder[left.state] - stateOrder[right.state];
			if (byState !== 0) {
				return byState;
			}
			return left.nextReviewDate.getTime() - right.nextReviewDate.getTime();
		});

	const summary = [
		`🔥 просрочено: ${rows.filter((row) => row.state === 'overdue').length}`,
		`⚠️ в ближайшие 30 дней: ${rows.filter((row) => row.state === 'soon').length}`,
		`✅ актуально: ${rows.filter((row) => row.state === 'actual').length}`,
	];
	const result = [...summary];

	if (missing.length) {
		result.push(
			'',
			'Последнее ревью не найдено:',
			...missing.map((status) => `- ${status.employee.name}`),
		);
	}

	if (rows.length) {
		const employeeColumnWidth = Math.max(
			...rows.map((row) => row.employeeName.length),
		);
		result.push(
			'',
			'',
			'```',
			...rows.map((row) =>
				formatReviewStatusRow(row, employeeColumnWidth, today),
			),
			'```',
		);
	}

	return result.join('\n');
}

function formatReviewStatusRow(
	row: {
		employeeName: string;
		lastReviewDate: Date;
		nextReviewDate: Date;
		state: ReviewStatusState;
	},
	employeeColumnWidth: number,
	today: Date,
): string {
	const icon =
		row.state === 'overdue' ? '🔥' : row.state === 'soon' ? '⚠️' : '✅';
	const nextReviewText =
		row.nextReviewDate <= today
			? 'сейчас'
			: formatReviewStatusMonth(row.nextReviewDate);
	return `${icon} ${row.employeeName.padEnd(employeeColumnWidth)}  ${formatReviewStatusMonth(row.lastReviewDate)} → ${nextReviewText}`;
}

function addMonths(date: Date, months: number): Date {
	return new Date(
		Date.UTC(
			date.getUTCFullYear(),
			date.getUTCMonth() + months,
			date.getUTCDate(),
		),
	);
}

function addDays(date: Date, days: number): Date {
	return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function startOfDay(date: Date): Date {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
	);
}

function parseIsoDate(date: string): Date {
	return new Date(`${date}T00:00:00.000Z`);
}

function formatReviewStatusMonth(date: Date): string {
	return [
		String(date.getUTCMonth() + 1).padStart(2, '0'),
		date.getUTCFullYear(),
	].join('.');
}

function formatReviewSuccessMessage(
	fullName: string,
	folder: CreatedFolder,
	needsClientForm: boolean,
	calendarEvent?: CreatedCalendarEvent,
	reminderEvents: CreatedReviewerReminderEvent[] = [],
): string {
	const reviewPrepareReminder = reminderEvents.find(
		(event) => event.kind === 'prepare',
	);
	const reviewPrepareDate = reviewPrepareReminder?.startDateTime
		? formatChatPlanDate(reviewPrepareReminder.startDateTime)
		: '';

	return [
		`Performance Review — ${fullName}`,
		...(calendarEvent
			? [
					'',
					`Дата ревью: ${formatChatFullDateTime(calendarEvent.startDateTime)}`,
				]
			: []),
		...(calendarEvent || reminderEvents.length
			? [
					'',
					'План:',
					...reminderEvents.map(
						(event) =>
							`${formatChatPlanDate(event.startDateTime)} → ${formatPlanLabel(event.kind)}`,
					),
					...(calendarEvent
						? [`${formatChatPlanDate(calendarEvent.startDateTime)} → Встреча`]
						: []),
				]
			: []),
		'',
		`📁 ${formatChatLink(folder.webViewLink, 'Папка ревью')}`,
		...(calendarEvent
			? [
					'',
					`📅 ${formatChatLink(calendarEvent.htmlLink, 'Встреча')}`,
					...(reminderEvents.length
						? [
								'Все напоминания и встречи по ревью отображаются в вашем календаре.',
							]
						: ['Встреча по ревью отображается в вашем календаре.']),
				]
			: []),
		...(folder.internalForm?.webViewLink
			? [
					'',
					`📝 ${formatChatLink(
						folder.internalForm.webViewLink,
						'Форма обратной связи (fuse8)',
					)}`,
					'Добавьте в форму коллег, работавших с сотрудником.',
					FEEDBACK_FORM_CONTACT_INSTRUCTION,
				]
			: []),
		...(needsClientForm && folder.clientForm?.webViewLink
			? [
					'',
					`📝 ${formatChatLink(
						folder.clientForm.webViewLink,
						'Форма обратной связи (клиенту)',
					)}`,
					'Добавьте в форму клиентов, с которыми сотрудник взаимодействовал на проекте.',
					FEEDBACK_FORM_CONTACT_INSTRUCTION,
				]
			: []),
		...(folder.report?.webViewLink
			? [
					'',
					`📄 ${formatChatLink(folder.report.webViewLink, 'Отчёт')}`,
					...(reviewPrepareDate
						? [
								`Нужно выслать сотруднику: попросить заполнить свою часть отчёта до ${reviewPrepareDate}.`,
							]
						: []),
				]
			: []),
	].join('\n');
}

function formatChatLink(url: string, label: string): string {
	return `<${url}|${label}>`;
}

const FEEDBACK_FORM_CONTACT_INSTRUCTION =
	'Напишите им лично, продублировав ссылку на форму и с напоминанием дедлайна.';

const REVIEW_PLAN_LABELS: Record<CreatedReviewerReminderEvent['kind'], string> =
	{
		collect: 'Сбор отзывов',
		check: 'Проверка отзывов',
		prepare: 'Подготовка к встрече',
	};

function formatChatFullDateTime(dateTime: string): string {
	const match = dateTime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/);
	if (!match) {
		return dateTime;
	}

	const [, year, month, day, time] = match;
	return `${day}.${month}.${year}, ${time}`;
}

function formatChatPlanDate(dateTime: string): string {
	const match = dateTime.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!match) {
		return dateTime;
	}

	const [, , month, day] = match;
	return `${day}.${month}`;
}

function formatPlanLabel(kind: CreatedReviewerReminderEvent['kind']): string {
	return REVIEW_PLAN_LABELS[kind];
}

function isEmailInDomains(email: string, domains: string[]): boolean {
	return domains.some((domain) => email.endsWith(`@${domain.toLowerCase()}`));
}

function isValidMeetingTime(value: string): boolean {
	return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function resolveChatSpaceName(event: ChatEvent): string | undefined {
	return event.space?.name ?? undefined;
}

function isEmployeeSuggestionsEvent(
	config: AppConfig,
	event: ChatEvent,
	invokedFunction: string | undefined,
): boolean {
	return (
		invokedFunction === `${config.appBaseUrl}/google-chat/events` &&
		event.common?.parameters?.autocomplete_widget_query !== undefined &&
		event.common?.parameters?.actionName === undefined &&
		event.dialogEventType !== 'CANCEL_DIALOG'
	);
}

function resolveActionName(event: ChatEvent): string | undefined {
	return (
		event.common?.parameters?.actionName ??
		event.common?.invokedFunction ??
		undefined
	);
}

function resolveAppCommandId(event: ChatEvent): number | undefined {
	const appCommandId = event.appCommandMetadata?.appCommandId;

	if (appCommandId !== undefined && appCommandId !== null) {
		return appCommandId;
	}

	const slashCommandId = event.message?.slashCommand?.commandId;
	if (!slashCommandId) {
		return undefined;
	}

	const parsed = Number(slashCommandId);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function isDialogContext(event: ChatEvent): boolean {
	return Boolean(event.isDialogEvent || event.dialogEventType);
}

async function deliverWorkflowResultToChat(
	config: AppConfig,
	deps: ChatEventHandlerDeps,
	event: ChatEvent,
	text: string,
): Promise<void> {
	await sendSubmitResultToChat(config, deps, event, text);
}

async function deliverWorkflowAuthRequired(
	error: unknown,
	params: ReviewWorkflowParams,
	deps: ChatEventHandlerDeps,
	step: string,
): Promise<ReviewWorkflowResult | null> {
	if (!isOAuthAuthError(error)) {
		return null;
	}

	const message = error instanceof Error ? error.message : String(error);
	logChatEvent(`submit.${step}.authRequired`, {
		chatUserId: params.chatUserId,
		message,
	});

	await params.storage.delete(params.chatUserId);
	const authUrl = await deps.buildAuthUrl(
		params.config,
		params.storage,
		params.chatUserId,
	);
	const errorText = formatAuthRequiredMessage(authUrl);
	await deliverWorkflowResultToChat(
		params.config,
		deps,
		params.event,
		errorText,
	);

	return {
		textLength: errorText.length,
		remindersCount: 0,
		hasCalendar: false,
	};
}

type AuthRequiredResponseKind =
	| 'chat_message'
	| 'dialog_card'
	| 'employee_suggestions';

async function respondReviewerAuthRequired(
	config: AppConfig,
	storage: AppStorage,
	chatUserId: string,
	deps: ChatEventHandlerDeps,
	event: ChatEvent,
	kind: AuthRequiredResponseKind,
	options?: { clearStaleToken?: boolean },
): Promise<ChatResponse> {
	if (options?.clearStaleToken) {
		await storage.delete(chatUserId);
	}

	const authUrl = await deps.buildAuthUrl(config, storage, chatUserId);
	logChatEvent('auth.required', {
		chatUserId,
		kind,
		clearStaleToken: Boolean(options?.clearStaleToken),
	});

	const message = formatAuthRequiredMessage(authUrl);

	if (kind === 'dialog_card') {
		return dialogResponse(authRequiredCard(authUrl));
	}

	const spaceName = resolveChatSpaceName(event);
	const inDialog = isDialogContext(event);

	if (spaceName) {
		await sendSubmitResultToChat(config, deps, event, message);
		if (inDialog) {
			return dialogActionStatusResponse('', 'OK');
		}
		return {};
	}

	logChatEvent('auth.required.fallback', {
		chatUserId,
		reason: 'missingSpaceName',
	});
	return textResponse(message);
}

function respondDialogSubmitAck(
	statusCode: 'OK' | 'INVALID_ARGUMENT',
): ChatResponse {
	return dialogActionStatusResponse('', statusCode);
}

async function sendSubmitResultToChat(
	config: AppConfig,
	deps: ChatEventHandlerDeps,
	event: ChatEvent,
	text: string,
): Promise<void> {
	const spaceName = resolveChatSpaceName(event);
	if (!spaceName) {
		logChatEvent('submit.sendChatMessage.skipped', {
			reason: 'missingSpaceName',
		});
		return;
	}

	logChatEvent('submit.resultDelivery.start', {
		spaceName,
		textLength: text.length,
		delivery: 'bot',
	});

	try {
		await deps.sendChatMessage(config, spaceName, text);
		logChatEvent('submit.sendChatMessage.success', { spaceName });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		logChatEvent('submit.sendChatMessage.failed', { spaceName, message });
	}
}

function textResponse(text: string): ChatResponse {
	return { text };
}

function dialogActionStatusResponse(
	text: string,
	statusCode: 'OK' | 'INVALID_ARGUMENT',
): ChatResponse {
	return {
		actionResponse: {
			type: 'DIALOG',
			dialogAction: {
				actionStatus: {
					statusCode,
					userFacingMessage: text,
				},
			},
		},
	};
}

function dialogResponse(card: ChatCard): ChatResponse {
	return {
		actionResponse: {
			type: 'DIALOG',
			dialogAction: {
				dialog: {
					body: card,
				},
			},
		},
	};
}

function actionResponseText(text: string): ChatResponse {
	return {
		actionResponse: {
			type: 'NEW_MESSAGE',
		},
		text,
	};
}

function employeeSuggestionsResponse(
	suggestions: ChatSelectionItem[],
): ChatResponse {
	return {
		actionResponse: {
			type: 'UPDATE_WIDGET',
			updatedWidget: {
				widget: 'employeeFolder',
				suggestions: {
					items: suggestions,
				},
			},
		},
	};
}

function encodeEmployeeSelection(id: string, name: string): string {
	return `${id}|${name}`;
}

function parseEmployeeSelection(
	value: string,
): { id: string; name: string } | null {
	const separatorIndex = value.indexOf('|');
	if (separatorIndex < 1) {
		return null;
	}

	const id = value.slice(0, separatorIndex).trim();
	const name = value.slice(separatorIndex + 1).trim();
	if (!id || !name) {
		return null;
	}

	return { id, name };
}

export function getDirectorySearchQuery(query: string): string {
	return query
		.split(/\s+/)
		.filter(Boolean)
		.map((word) =>
			containsCyrillic(word) ? reverseTransliterateWord(word) : word,
		)
		.join(' ');
}

function containsCyrillic(text: string): boolean {
	return /[\u0400-\u04FF]/.test(text);
}

function transliterateEmployeeName(name: string): string {
	if (containsCyrillic(name)) {
		return name;
	}

	return name
		.split(/\s+/)
		.filter(Boolean)
		.map(transliterateLatinWord)
		.join(' ');
}

function transliterateLatinWord(word: string): string {
	let rest = word.toLowerCase();
	let result = '';

	while (rest.length > 0) {
		const replacement = TRANSLIT_REPLACEMENTS.find(([latin]) =>
			rest.startsWith(latin),
		);
		if (!replacement) {
			result += rest[0];
			rest = rest.slice(1);
			continue;
		}

		const [latin, cyrillic] = replacement;
		result += cyrillic;
		rest = rest.slice(latin.length);
	}

	return capitalizeWord(result);
}

function capitalizeWord(word: string): string {
	return word ? `${word[0].toLocaleUpperCase('ru-RU')}${word.slice(1)}` : word;
}

function buildReverseTranslReplacements(
	replacements: Array<[string, string]>,
): Array<[string, string]> {
	const byCyrillic = new Map<string, string>();

	for (const [latin, cyrillic] of replacements) {
		const existing = byCyrillic.get(cyrillic);
		if (!existing || latin.length < existing.length) {
			byCyrillic.set(cyrillic, latin);
		}
	}

	return [...byCyrillic.entries()].sort((a, b) => b[0].length - a[0].length);
}

function reverseTransliterateWord(word: string): string {
	let rest = word.toLowerCase();
	let result = '';

	while (rest.length > 0) {
		const replacement = REVERSE_TRANSLIT_REPLACEMENTS.find(([cyrillic]) =>
			rest.startsWith(cyrillic),
		);
		if (!replacement) {
			result += rest[0];
			rest = rest.slice(1);
			continue;
		}

		const [cyrillic, latin] = replacement;
		result += latin;
		rest = rest.slice(cyrillic.length);
	}

	return result;
}

function employeeLookupCard(
	config: AppConfig,
	selectedEmployee?: {
		fullName: string;
		displayName?: string;
		email: string;
		selectedEmployeeValue: string;
		folderError?: string;
	},
): ChatCard {
	return {
		header: {
			title: 'Выбор сотрудника',
		},
		sections: [
			{
				widgets: [
					{
						selectionInput: {
							name: 'employeeFolder',
							type: 'MULTI_SELECT',
							label: 'Имя, фамилия или email (английский)',
							multiSelectMaxSelectedItems: 1,
							multiSelectMinQueryLength: 1,
							...(selectedEmployee
								? {
										items: [
											{
												text: `${selectedEmployee.displayName ?? selectedEmployee.fullName} (${selectedEmployee.email})`,
												value: selectedEmployee.selectedEmployeeValue,
												selected: true,
											},
										],
									}
								: {}),
							onChangeAction: {
								function: `${config.appBaseUrl}/google-chat/events`,
								parameters: [
									{
										key: 'actionName',
										value: SELECT_EMPLOYEE_FUNCTION,
									},
								],
							},
							externalDataSource: {
								function: `${config.appBaseUrl}/google-chat/events`,
							},
						},
					},
					...(selectedEmployee
						? [
								{
									textInput: {
										name: 'manualFullName',
										label: 'Имя и фамилия (название папки)',
										type: 'SINGLE_LINE',
										value: selectedEmployee.fullName,
									},
								},
								{
									textInput: {
										name: 'employeeEmail',
										label: 'Email',
										type: 'SINGLE_LINE',
										value: selectedEmployee.email,
									},
								},
								...(selectedEmployee.folderError
									? [
											{
												textParagraph: {
													text: selectedEmployee.folderError,
												},
											},
										]
									: []),
								{
									buttonList: {
										buttons: [
											{
												text: 'Проверить папку',
												onClick: {
													action: {
														function: `${config.appBaseUrl}/google-chat/events`,
														requiredWidgets: [
															'manualFullName',
															'employeeEmail',
														],
														parameters: [
															{
																key: 'actionName',
																value: CHECK_EMPLOYEE_FOLDER_FUNCTION,
															},
														],
													},
												},
											},
										],
									},
								},
							]
						: []),
				],
			},
		],
	};
}

function reviewFormCard(
	config: AppConfig,
	initialValues: {
		fullName?: string;
		employeeEmail?: string;
		employeeFolderStatus?: string;
		previousReviewStatus?: string;
		previousReviewId?: string;
		previousReviewUrl?: string;
	} = {},
): ChatCard {
	return {
		header: {
			title: 'Запуск Performance Review',
		},
		sections: [
			...(initialValues.employeeFolderStatus ||
			initialValues.previousReviewStatus
				? [
						{
							widgets: [
								{
									textParagraph: {
										text: [
											initialValues.employeeFolderStatus,
											initialValues.previousReviewStatus,
										]
											.filter(Boolean)
											.join(' '),
									},
								},
							],
						},
					]
				: []),
			{
				widgets: [
					{
						textInput: {
							name: 'fullName',
							label: 'Имя и фамилия',
							...(initialValues.fullName
								? { value: initialValues.fullName }
								: {}),
						},
					},
					{
						textInput: {
							name: 'employeeEmail',
							label: 'Email сотрудника',
							...(initialValues.employeeEmail
								? { value: initialValues.employeeEmail }
								: {}),
						},
					},
					{
						dateTimePicker: {
							name: 'reviewDate',
							label: 'Дата ревью',
							type: 'DATE_ONLY',
						},
					},
					{
						textInput: {
							name: 'meetingTime',
							label: 'Время ревью (HH:mm, Челябинск)',
							validation: {
								characterLimit: 5,
							},
						},
					},
					{
						selectionInput: {
							name: 'needsClientForm',
							type: 'CHECK_BOX',
							items: [
								{
									text: 'Создать форму обратной связи для клиента',
									value: 'yes',
								},
							],
						},
					},
					{
						buttonList: {
							buttons: [
								{
									text: 'Запустить ревью',
									onClick: {
										action: {
											function: `${config.appBaseUrl}/google-chat/events`,
											requiredWidgets: [
												'fullName',
												'employeeEmail',
												'reviewDate',
												'meetingTime',
											],
											parameters: [
												{
													key: 'actionName',
													value: SUBMIT_FUNCTION,
												},
												{
													key: 'previousReviewUrl',
													value: initialValues.previousReviewUrl ?? '',
												},
												{
													key: 'previousReviewId',
													value: initialValues.previousReviewId ?? '',
												},
											],
										},
									},
								},
							],
						},
					},
				],
			},
		],
	};
}

function reviewerSettingsCard(
	config: AppConfig,
	settings: ReviewerSettingsCardValues | null,
	options: { error?: string } = {},
): ChatCard {
	return {
		header: {
			title: 'Настройки ревьюера',
		},
		sections: [
			{
				widgets: [
					...(options.error
						? [
								{
									textParagraph: {
										text: options.error,
									},
								},
							]
						: []),
					{
						textInput: {
							name: 'rootFolderUrl',
							label: 'Ссылка на корневую папку Google Drive',
							value: settings?.rootFolderId
								? formatGoogleDriveFolderUrl(settings.rootFolderId)
								: '',
						},
					},
					{
						textInput: {
							name: 'taskCollectDaysBefore',
							label: 'Дней до сбора отзывов',
							value: String(
								settings?.taskCollectDaysBefore ?? config.taskCollectDaysBefore,
							),
						},
					},
					{
						textInput: {
							name: 'taskCheckDaysBefore',
							label: 'Дней до проверки отзывов',
							value: String(
								settings?.taskCheckDaysBefore ?? config.taskCheckDaysBefore,
							),
						},
					},
					{
						textInput: {
							name: 'taskPrepareDaysBefore',
							label: 'Дней до подготовки',
							value: String(
								settings?.taskPrepareDaysBefore ?? config.taskPrepareDaysBefore,
							),
						},
					},
					{
						textInput: {
							name: 'taskReminderTime',
							label: 'Время задач (HH:mm, Челябинск)',
							value: settings?.taskReminderTime ?? config.taskReminderTime,
							validation: {
								characterLimit: 5,
							},
						},
					},
					{
						textInput: {
							name: 'reviewIntervalMonths',
							label: 'Периодичность ревью (месяцы)',
							value: String(
								settings?.reviewIntervalMonths ??
									DEFAULT_REVIEW_INTERVAL_MONTHS,
							),
						},
					},
					{
						buttonList: {
							buttons: [
								{
									text: 'Сохранить',
									onClick: {
										action: {
											function: `${config.appBaseUrl}/google-chat/events`,
											requiredWidgets: [
												'rootFolderUrl',
												'taskCollectDaysBefore',
												'taskCheckDaysBefore',
												'taskPrepareDaysBefore',
												'taskReminderTime',
												'reviewIntervalMonths',
											],
											parameters: [
												{
													key: 'actionName',
													value: SAVE_REVIEWER_SETTINGS_FUNCTION,
												},
											],
										},
									},
								},
							],
						},
					},
				],
			},
		],
	};
}

function authRequiredCard(authUrl: string): ChatCard {
	return authCard(
		'Нужно подключить Google',
		'Подключите Google-аккаунт ревьюера и повторите запуск.',
		authUrl,
	);
}

function authCard(title: string, text: string, authUrl: string): ChatCard {
	return {
		header: {
			title,
		},
		sections: [
			{
				widgets: [
					{
						textParagraph: {
							text,
						},
					},
					{
						buttonList: {
							buttons: [
								{
									text: 'Подключить Google',
									onClick: {
										openLink: {
											url: authUrl,
										},
									},
								},
							],
						},
					},
				],
			},
		],
	};
}
