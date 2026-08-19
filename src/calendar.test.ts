import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
	buildReviewerReminderDate,
	createReviewerReminderEventsInCalendar,
	createCalendarEventInCalendar,
} from './calendar.js';

const EXPECTED_REVIEW_DESCRIPTION = [
	'📁 <a href="https://drive.google.com/folder">Папка ревью</a>',
	'📄 <a href="https://docs.google.com/document/report-id">Отчёт</a>',
	'📝 <a href="https://docs.google.com/forms/internal-form-id">Форма обратной связи (fuse8)</a>',
	'📝 <a href="https://docs.google.com/forms/client-form-id">Форма обратной связи (клиенту)</a>',
	'📄 <a href="https://docs.google.com/document/previous-report-id">Предыдущее ревью</a>',
].join('\n\n');

const REMINDER_SETTINGS = {
	taskCollectDaysBefore: 14,
	taskCheckDaysBefore: 7,
	taskPrepareDaysBefore: 3,
	taskReminderTime: '12:00',
};

const REMINDER_REQUEST = {
	fullName: 'Ivan Petrov',
	employeeEmail: 'ivan.petrov@example.test',
	reviewerEmail: 'reviewer@example.test',
	reviewDate: '2026-06-15',
	meetingTime: '14:30',
	folderUrl: 'https://drive.google.com/folder',
};

function createReminderCalendar() {
	const insertedEvents: unknown[] = [];
	return {
		insertedEvents,
		calendar: {
			events: {
				async insert(params: unknown) {
					insertedEvents.push(params);
					return {
						data: {
							id: `reminder-${insertedEvents.length}`,
							summary: (params as { requestBody: { summary: string } })
								.requestBody.summary,
							htmlLink: `https://calendar.google.com/event?eid=reminder-${insertedEvents.length}`,
						},
					};
				},
			},
		},
	};
}

test('createCalendarEventInCalendar creates a 2.5h review meeting with only the report link', async () => {
	const insertedEvents: unknown[] = [];
	const calendar = {
		events: {
			async insert(params: unknown) {
				insertedEvents.push(params);
				return {
					data: {
						id: 'event-id',
						summary: 'Performance Review: Ivan Petrov',
						htmlLink: 'https://calendar.google.com/event?eid=event-id',
					},
				};
			},
		},
	};

	const event = await createCalendarEventInCalendar(calendar, {
		fullName: 'Ivan Petrov',
		employeeEmail: 'ivan.petrov@example.test',
		reviewerEmail: 'reviewer@example.test',
		reviewDate: '2026-06-15',
		meetingTime: '14:30',
		folderUrl: 'https://drive.google.com/folder',
		reportUrl: 'https://docs.google.com/document/report-id',
		internalFormUrl: 'https://docs.google.com/forms/internal-form-id',
		clientFormUrl: 'https://docs.google.com/forms/client-form-id',
		previousReviewUrl: 'https://docs.google.com/document/previous-report-id',
	});

	assert.deepEqual(event, {
		id: 'event-id',
		summary: 'Performance Review: Ivan Petrov',
		htmlLink: 'https://calendar.google.com/event?eid=event-id',
		startDateTime: '2026-06-15T14:30:00+05:00',
	});
	assert.deepEqual(insertedEvents, [
		{
			calendarId: 'primary',
			requestBody: {
				summary: 'Performance Review: Ivan Petrov',
				description:
					'📄 <a href="https://docs.google.com/document/report-id">Отчёт</a>',
				start: {
					dateTime: '2026-06-15T14:30:00+05:00',
					timeZone: 'Asia/Yekaterinburg',
				},
				end: {
					dateTime: '2026-06-15T17:00:00+05:00',
					timeZone: 'Asia/Yekaterinburg',
				},
				attendees: [
					{ email: 'reviewer@example.test' },
					{ email: 'ivan.petrov@example.test' },
				],
			},
		},
	]);
});

test('createCalendarEventInCalendar leaves description empty without a report', async () => {
	const insertedEvents: Array<{
		requestBody: { description?: string | null };
	}> = [];
	const calendar = {
		events: {
			async insert(params: { requestBody: { description?: string | null } }) {
				insertedEvents.push(params);
				return {
					data: {
						id: 'event-id',
						summary: 'Performance Review: Ivan Petrov',
						htmlLink: 'https://calendar.google.com/event?eid=event-id',
					},
				};
			},
		},
	};

	await createCalendarEventInCalendar(calendar, {
		fullName: 'Ivan Petrov',
		employeeEmail: 'ivan.petrov@example.test',
		reviewerEmail: 'reviewer@example.test',
		reviewDate: '2026-06-15',
		meetingTime: '14:30',
		folderUrl: 'https://drive.google.com/folder',
	});

	assert.equal(insertedEvents[0]?.requestBody.description, '');
});

test('buildReviewerReminderDate subtracts calendar days and shifts weekends backward', () => {
	assert.equal(buildReviewerReminderDate('2026-06-15', 14), '2026-06-01');
	assert.equal(buildReviewerReminderDate('2026-06-15', 7), '2026-06-08');
	assert.equal(buildReviewerReminderDate('2026-06-15', 3), '2026-06-12');
	assert.equal(buildReviewerReminderDate('2026-05-06', 14), '2026-04-22');
	assert.equal(buildReviewerReminderDate('2026-06-08', 1), '2026-06-05');
	assert.equal(buildReviewerReminderDate('2026-06-08', 2), '2026-06-05');

	for (const daysBefore of [1, 3, 7, 14, 20]) {
		const date = new Date(
			`${buildReviewerReminderDate('2026-06-15', daysBefore)}T00:00:00Z`,
		);
		assert.notEqual(date.getUTCDay(), 0);
		assert.notEqual(date.getUTCDay(), 6);
	}
});

test('createReviewerReminderEventsInCalendar creates 3 reviewer reminder events with links', async () => {
	const insertedEvents: unknown[] = [];
	const calendar = {
		events: {
			async insert(params: unknown) {
				insertedEvents.push(params);
				return {
					data: {
						id: `reminder-${insertedEvents.length}`,
						summary: (params as { requestBody: { summary: string } })
							.requestBody.summary,
						htmlLink: `https://calendar.google.com/event?eid=reminder-${insertedEvents.length}`,
					},
				};
			},
		},
	};

	const events = await createReviewerReminderEventsInCalendar(
		calendar,
		{
			taskCollectDaysBefore: 14,
			taskCheckDaysBefore: 7,
			taskPrepareDaysBefore: 3,
			taskReminderTime: '12:00',
		},
		{
			fullName: 'Ivan Petrov',
			employeeEmail: 'ivan.petrov@example.test',
			reviewerEmail: 'reviewer@example.test',
			reviewDate: '2026-06-15',
			meetingTime: '14:30',
			folderUrl: 'https://drive.google.com/folder',
			reportUrl: 'https://docs.google.com/document/report-id',
			internalFormUrl: 'https://docs.google.com/forms/internal-form-id',
			clientFormUrl: 'https://docs.google.com/forms/client-form-id',
			previousReviewUrl: 'https://docs.google.com/document/previous-report-id',
		},
		new Date('2026-05-01T00:00:00.000Z'),
	);

	assert.deepEqual(
		events.map((event) => ({ kind: event.kind, summary: event.summary })),
		[
			{
				kind: 'collect',
				summary: 'Запустить сбор отзывов для PR Ivan Petrov',
			},
			{
				kind: 'check',
				summary: 'Проверить отзывы для PR Ivan Petrov',
			},
			{
				kind: 'prepare',
				summary: 'Подготовиться к проведению PR Ivan Petrov',
			},
		],
	);
	assert.deepEqual(insertedEvents, [
		{
			calendarId: 'primary',
			requestBody: {
				summary: 'Запустить сбор отзывов для PR Ivan Petrov',
				description: EXPECTED_REVIEW_DESCRIPTION,
				start: {
					dateTime: '2026-06-01T12:00:00+05:00',
					timeZone: 'Asia/Yekaterinburg',
				},
				end: {
					dateTime: '2026-06-01T12:30:00+05:00',
					timeZone: 'Asia/Yekaterinburg',
				},
				attendees: [{ email: 'reviewer@example.test' }],
			},
		},
		{
			calendarId: 'primary',
			requestBody: {
				summary: 'Проверить отзывы для PR Ivan Petrov',
				description: EXPECTED_REVIEW_DESCRIPTION,
				start: {
					dateTime: '2026-06-08T12:00:00+05:00',
					timeZone: 'Asia/Yekaterinburg',
				},
				end: {
					dateTime: '2026-06-08T12:30:00+05:00',
					timeZone: 'Asia/Yekaterinburg',
				},
				attendees: [{ email: 'reviewer@example.test' }],
			},
		},
		{
			calendarId: 'primary',
			requestBody: {
				summary: 'Подготовиться к проведению PR Ivan Petrov',
				description: EXPECTED_REVIEW_DESCRIPTION,
				start: {
					dateTime: '2026-06-12T12:00:00+05:00',
					timeZone: 'Asia/Yekaterinburg',
				},
				end: {
					dateTime: '2026-06-12T12:30:00+05:00',
					timeZone: 'Asia/Yekaterinburg',
				},
				attendees: [{ email: 'reviewer@example.test' }],
			},
		},
	]);
});

test('createReviewerReminderEventsInCalendar skips all reminders that have started', async () => {
	const { calendar, insertedEvents } = createReminderCalendar();

	const events = await createReviewerReminderEventsInCalendar(
		calendar,
		REMINDER_SETTINGS,
		REMINDER_REQUEST,
		new Date('2026-06-12T07:00:00.000Z'),
	);

	assert.deepEqual(events, []);
	assert.deepEqual(insertedEvents, []);
});

test('createReviewerReminderEventsInCalendar keeps only future reminders', async () => {
	const { calendar, insertedEvents } = createReminderCalendar();

	const events = await createReviewerReminderEventsInCalendar(
		calendar,
		REMINDER_SETTINGS,
		REMINDER_REQUEST,
		new Date('2026-06-05T07:00:00.000Z'),
	);

	assert.deepEqual(
		events.map((event) => event.kind),
		['check', 'prepare'],
	);
	assert.equal(insertedEvents.length, 2);
});

test('createReviewerReminderEventsInCalendar compares same-day reminder time', async () => {
	const sameDaySettings = {
		...REMINDER_SETTINGS,
		taskCollectDaysBefore: 0,
		taskCheckDaysBefore: 0,
		taskPrepareDaysBefore: 0,
	};
	const beforeStart = createReminderCalendar();
	const atStart = createReminderCalendar();

	const futureEvents = await createReviewerReminderEventsInCalendar(
		beforeStart.calendar,
		sameDaySettings,
		REMINDER_REQUEST,
		new Date('2026-06-15T06:59:59.000Z'),
	);
	const startedEvents = await createReviewerReminderEventsInCalendar(
		atStart.calendar,
		sameDaySettings,
		REMINDER_REQUEST,
		new Date('2026-06-15T07:00:00.000Z'),
	);

	assert.equal(futureEvents.length, 3);
	assert.equal(beforeStart.insertedEvents.length, 3);
	assert.deepEqual(startedEvents, []);
	assert.deepEqual(atStart.insertedEvents, []);
});
