import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
	buildReviewerReminderDate,
	createReviewerTasksInTasks,
	ReviewerTasksCreationError,
} from './tasks.js';
import type { tasks_v1 } from 'googleapis';

const settings = {
	taskCollectDaysBefore: 14,
	taskCheckDaysBefore: 7,
	taskPrepareDaysBefore: 3,
};
const request = {
	fullName: 'Ivan Petrov',
	employeeEmail: 'employee@example.test',
	reviewerEmail: 'reviewer@example.test',
	reviewDate: '2026-06-15',
	meetingTime: '14:30',
	folderUrl: 'https://example.test/folder',
	reportUrl: 'https://example.test/report',
	internalFormUrl: 'https://example.test/internal',
	clientFormUrl: 'https://example.test/client',
	previousReviewUrl: 'https://example.test/previous',
};
function client(failAt?: number) {
	const inserted: tasks_v1.Params$Resource$Tasks$Insert[] = [];
	return {
		inserted,
		tasks: {
			async insert(params: tasks_v1.Params$Resource$Tasks$Insert) {
				if (inserted.length === failAt) throw new Error('Tasks unavailable');
				inserted.push(params);
				return {
					data: {
						id: `task-${inserted.length}`,
						title: params.requestBody?.title,
						webViewLink: 'https://example.test/task',
					},
				};
			},
		},
	};
}

test('task dates subtract calendar days and shift weekends backward', () => {
	assert.equal(buildReviewerReminderDate('2026-06-15', 14), '2026-06-01');
	assert.equal(buildReviewerReminderDate('2026-06-08', 1), '2026-06-05');
	assert.equal(buildReviewerReminderDate('2026-06-08', 2), '2026-06-05');
	assert.equal(buildReviewerReminderDate('2026-05-06', 14), '2026-04-22');
	assert.equal(buildReviewerReminderDate('2026-06-14', 0), '2026-06-12');
});

test('creates three personal date-only tasks with plain text links and optional web links', async () => {
	const api = client();
	const tasks = await createReviewerTasksInTasks(
		api,
		settings,
		request,
		new Date('2026-05-01T00:00:00Z'),
	);
	assert.deepEqual(
		tasks.map((task) => [task.kind, task.dueDate, task.title]),
		[
			['collect', '2026-06-01', 'Запустить сбор отзывов для PR Ivan Petrov'],
			['check', '2026-06-08', 'Проверить отзывы для PR Ivan Petrov'],
			['prepare', '2026-06-12', 'Подготовиться к проведению PR Ivan Petrov'],
		],
	);
	for (const [index, params] of api.inserted.entries()) {
		assert.equal(params.tasklist, '@default');
		assert.deepEqual(Object.keys(params.requestBody ?? {}).sort(), [
			'due',
			'notes',
			'status',
			'title',
		]);
		assert.equal(params.requestBody?.status, 'needsAction');
		assert.equal(
			params.requestBody?.due,
			`${tasks[index].dueDate}T00:00:00.000Z`,
		);
		for (const url of [
			request.folderUrl,
			request.reportUrl,
			request.internalFormUrl,
			request.clientFormUrl,
			request.previousReviewUrl,
		])
			assert.ok(params.requestBody?.notes?.includes(url));
		assert.doesNotMatch(params.requestBody?.notes ?? '', /<a /);
	}
	const noLink = {
		tasks: {
			async insert() {
				return { data: { id: 'id' } };
			},
		},
	};
	const withoutLinks = await createReviewerTasksInTasks(
		noLink,
		settings,
		request,
		new Date('2026-05-01T00:00:00Z'),
	);
	assert.equal(withoutLinks[0].webViewLink, undefined);
});

test('skips past dates but keeps today even at the end of the local day', async () => {
	const api = client();
	const tasks = await createReviewerTasksInTasks(
		api,
		settings,
		request,
		new Date('2026-06-12T18:59:59Z'),
	);
	assert.deepEqual(
		tasks.map((task) => task.kind),
		['prepare'],
	);
	const expired = client();
	assert.deepEqual(
		await createReviewerTasksInTasks(
			expired,
			settings,
			request,
			new Date('2026-06-12T19:00:00Z'),
		),
		[],
	);
	assert.equal(expired.inserted.length, 0);
});

test('zero offsets create tasks today without comparing meeting time', async () => {
	const tasks = await createReviewerTasksInTasks(
		client(),
		{
			taskCollectDaysBefore: 0,
			taskCheckDaysBefore: 0,
			taskPrepareDaysBefore: 0,
		},
		request,
		new Date('2026-06-15T18:59:59Z'),
	);
	assert.equal(tasks.length, 3);
	assert.ok(tasks.every((task) => task.dueDate === '2026-06-15'));
});

test('partial error preserves created tasks and original cause', async () => {
	await assert.rejects(
		() =>
			createReviewerTasksInTasks(
				client(1),
				settings,
				request,
				new Date('2026-05-01T00:00:00Z'),
			),
		(error) => {
			assert.ok(error instanceof ReviewerTasksCreationError);
			assert.deepEqual(
				error.createdTasks.map((task) => task.kind),
				['collect'],
			);
			assert.equal(error.message, 'Tasks unavailable');
			assert.ok(error.cause instanceof Error);
			return true;
		},
	);
});
