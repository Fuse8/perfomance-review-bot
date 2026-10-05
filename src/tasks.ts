import { google, type tasks_v1 } from 'googleapis';
import type { AppConfig } from './config.js';
import type { CalendarEventRequest } from './calendar.js';
import { createOAuthClient } from './oauth.js';

export type CreatedReviewerTask = {
	id: string;
	kind: 'collect' | 'check' | 'prepare';
	title: string;
	dueDate: string;
	webViewLink?: string;
};

type ReviewerTaskSettings = Pick<
	AppConfig,
	'taskCollectDaysBefore' | 'taskCheckDaysBefore' | 'taskPrepareDaysBefore'
>;

type TasksResource = {
	tasks: {
		insert(
			params: tasks_v1.Params$Resource$Tasks$Insert,
		): Promise<{ data: tasks_v1.Schema$Task }>;
	};
};

export class ReviewerTasksCreationError extends Error {
	constructor(
		readonly createdTasks: CreatedReviewerTask[],
		cause: unknown,
	) {
		super(cause instanceof Error ? cause.message : String(cause), { cause });
		this.name = 'ReviewerTasksCreationError';
	}
}

function createTasksClient(config: AppConfig, refreshToken: string) {
	const auth = createOAuthClient(config);
	auth.setCredentials({ refresh_token: refreshToken });
	return google.tasks({ version: 'v1', auth });
}

export async function verifyReviewerTasksAccess(
	config: AppConfig,
	refreshToken: string,
): Promise<void> {
	await createTasksClient(config, refreshToken).tasks.list({
		tasklist: '@default',
		maxResults: 1,
	});
}

export async function createReviewerTasks(
	config: AppConfig,
	refreshToken: string,
	request: CalendarEventRequest,
	currentDate = new Date(),
): Promise<CreatedReviewerTask[]> {
	return createReviewerTasksInTasks(
		createTasksClient(config, refreshToken),
		config,
		request,
		currentDate,
	);
}

export async function createReviewerTasksInTasks(
	tasks: TasksResource,
	settings: ReviewerTaskSettings,
	request: CalendarEventRequest,
	currentDate = new Date(),
): Promise<CreatedReviewerTask[]> {
	const reminders = [
		{
			kind: 'collect' as const,
			title: `Запустить сбор отзывов для PR ${request.fullName}`,
			daysBefore: settings.taskCollectDaysBefore,
		},
		{
			kind: 'check' as const,
			title: `Проверить отзывы для PR ${request.fullName}`,
			daysBefore: settings.taskCheckDaysBefore,
		},
		{
			kind: 'prepare' as const,
			title: `Подготовиться к проведению PR ${request.fullName}`,
			daysBefore: settings.taskPrepareDaysBefore,
		},
	];
	const today = new Date(currentDate.getTime() + 5 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 10);
	const createdTasks: CreatedReviewerTask[] = [];
	try {
		for (const reminder of reminders) {
			const dueDate = buildReviewerReminderDate(
				request.reviewDate,
				reminder.daysBefore,
			);
			if (dueDate < today) continue;
			const { data } = await tasks.tasks.insert({
				tasklist: '@default',
				requestBody: {
					title: reminder.title,
					notes: buildTaskNotes(request),
					status: 'needsAction',
					due: `${dueDate}T00:00:00.000Z`,
				},
			});
			if (!data.id)
				throw new Error('Google Tasks did not return created task ID');
			createdTasks.push({
				id: data.id,
				kind: reminder.kind,
				title: data.title || reminder.title,
				dueDate,
				...(data.webViewLink ? { webViewLink: data.webViewLink } : {}),
			});
		}
	} catch (error) {
		throw new ReviewerTasksCreationError(createdTasks, error);
	}
	return createdTasks;
}

function buildTaskNotes(request: CalendarEventRequest): string {
	return [
		`📁 Папка ревью: ${request.folderUrl}`,
		...(request.reportUrl ? [`📄 Отчёт: ${request.reportUrl}`] : []),
		...(request.internalFormUrl
			? [`📝 Форма обратной связи (fuse8): ${request.internalFormUrl}`]
			: []),
		...(request.clientFormUrl
			? [`📝 Форма обратной связи (клиенту): ${request.clientFormUrl}`]
			: []),
		...(request.previousReviewUrl
			? [`📄 Предыдущее ревью: ${request.previousReviewUrl}`]
			: []),
	].join('\n\n');
}
export function buildReviewerReminderDate(
	reviewDate: string,
	daysBefore: number,
): string {
	const [year, month, day] = reviewDate.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	date.setUTCDate(date.getUTCDate() - daysBefore);

	while (!isWeekday(date)) {
		date.setUTCDate(date.getUTCDate() - 1);
	}

	return date.toISOString().slice(0, 10);
}

function isWeekday(date: Date): boolean {
	const day = date.getUTCDay();
	return day !== 0 && day !== 6;
}
