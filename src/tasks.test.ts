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
	const { createdTasks: tasks } = await createReviewerTasksInTasks(
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
	const { createdTasks: withoutLinks } = await createReviewerTasksInTasks(
		noLink,
		settings,
		request,
		new Date('2026-05-01T00:00:00Z'),
	);
	assert.equal(withoutLinks[0].webViewLink, undefined);
});

test('skips all past and today tasks without calling Google Tasks', async () => {
	const api = client();
	const result = await createReviewerTasksInTasks(
		api,
		settings,
		request,
		new Date('2026-06-12T18:59:59Z'),
	);
	assert.deepEqual(result, {
		createdTasks: [],
		skippedTasks: [
			{ kind: 'collect', dueDate: '2026-06-01' },
			{ kind: 'check', dueDate: '2026-06-08' },
			{ kind: 'prepare', dueDate: '2026-06-12' },
		],
	});
	assert.equal(api.inserted.length, 0);
});

test('zero offsets skip all tasks today regardless of meeting time', async () => {
	const api = client();
	const result = await createReviewerTasksInTasks(
		api,
		{
			taskCollectDaysBefore: 0,
			taskCheckDaysBefore: 0,
			taskPrepareDaysBefore: 0,
		},
		request,
		new Date('2026-06-15T18:59:59Z'),
	);
	assert.deepEqual(result.createdTasks, []);
	assert.deepEqual(
		result.skippedTasks,
		['collect', 'check', 'prepare'].map((kind) => ({
			kind,
			dueDate: '2026-06-15',
		})),
	);
	assert.equal(api.inserted.length, 0);
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

for (const [now, skipped] of [
	['2026-05-31T18:59:59Z', false],
	['2026-05-31T19:00:00Z', true],
	['2026-06-01T18:59:59Z', true],
	['2026-06-01T19:00:00Z', true],
] as const) {
	test(`collect uses Chelyabinsk date and skips today or past (${now})`, async () => {
		const api = client();
		const result = await createReviewerTasksInTasks(
			api,
			settings,
			request,
			new Date(now),
		);
		assert.deepEqual(
			result.skippedTasks,
			skipped ? [{ kind: 'collect', dueDate: '2026-06-01' }] : [],
		);
		assert.deepEqual(
			result.createdTasks.map((task) => task.kind),
			skipped ? ['check', 'prepare'] : ['collect', 'check', 'prepare'],
		);
		assert.equal(api.inserted.length, skipped ? 2 : 3);
	});
}

test('collect skip reports the date after shifting a weekend backward', async () => {
	const result = await createReviewerTasksInTasks(
		client(),
		{
			...settings,
			taskCollectDaysBefore: 1,
		},
		{ ...request, reviewDate: '2026-06-08' },
		new Date('2026-06-05T00:00:00Z'),
	);
	assert.deepEqual(result.skippedTasks, [
		{ kind: 'collect', dueDate: '2026-06-05' },
		{ kind: 'check', dueDate: '2026-06-01' },
		{ kind: 'prepare', dueDate: '2026-06-05' },
	]);
	assert.ok(result.createdTasks.every((task) => task.kind !== 'collect'));
});

test('check tasks due today are skipped while future prepare is created', async () => {
	const result = await createReviewerTasksInTasks(
		client(),
		settings,
		request,
		new Date('2026-06-08T18:59:59Z'),
	);
	assert.deepEqual(
		result.createdTasks.map((task) => [task.kind, task.dueDate]),
		[['prepare', '2026-06-12']],
	);
});

for (const failAt of [0, 1]) {
	test(`Tasks error preserves actual collect skip and partial tasks (failAt=${failAt})`, async () => {
		await assert.rejects(
			() =>
				createReviewerTasksInTasks(
					client(failAt),
					settings,
					request,
					new Date('2026-06-01T00:00:00Z'),
				),
			(error) => {
				assert.ok(error instanceof ReviewerTasksCreationError);
				assert.deepEqual(error.skippedTasks, [
					{ kind: 'collect', dueDate: '2026-06-01' },
				]);
				assert.deepEqual(
					error.createdTasks.map((task) => task.kind),
					failAt === 1 ? ['check'] : [],
				);
				return true;
			},
		);
	});
}

test('failed future collect task is not reported as skipped', async () => {
	await assert.rejects(
		() =>
			createReviewerTasksInTasks(
				client(0),
				settings,
				request,
				new Date('2026-05-01T00:00:00Z'),
			),
		(error) => {
			assert.ok(error instanceof ReviewerTasksCreationError);
			assert.deepEqual(error.skippedTasks, []);
			return true;
		},
	);
});

for (const [now, skipAll] of [
	['2026-05-31T18:59:59Z', false],
	['2026-05-31T19:00:00Z', true],
	['2026-06-01T18:59:59Z', true],
	['2026-06-01T19:00:00Z', true],
] as const) {
	test(`all task kinds skip today or past by Chelyabinsk date (${now})`, async () => {
		const api = client();
		const result = await createReviewerTasksInTasks(
			api,
			{
				taskCollectDaysBefore: 14,
				taskCheckDaysBefore: 14,
				taskPrepareDaysBefore: 14,
			},
			request,
			new Date(now),
		);
		const kinds = ['collect', 'check', 'prepare'];
		assert.deepEqual(
			result.skippedTasks,
			skipAll ? kinds.map((kind) => ({ kind, dueDate: '2026-06-01' })) : [],
		);
		assert.deepEqual(
			result.createdTasks.map((task) => task.kind),
			skipAll ? [] : kinds,
		);
		assert.equal(api.inserted.length, skipAll ? 0 : 3);
	});
}

test('failure of an earlier future task preserves all locally skipped stages', async () => {
	await assert.rejects(
		() =>
			createReviewerTasksInTasks(
				client(0),
				{
					taskCollectDaysBefore: 1,
					taskCheckDaysBefore: 14,
					taskPrepareDaysBefore: 7,
				},
				request,
				new Date('2026-06-08T00:00:00Z'),
			),
		(error) => {
			assert.ok(error instanceof ReviewerTasksCreationError);
			assert.deepEqual(error.createdTasks, []);
			assert.deepEqual(error.skippedTasks, [
				{ kind: 'check', dueDate: '2026-06-01' },
				{ kind: 'prepare', dueDate: '2026-06-08' },
			]);
			return true;
		},
	);
});
