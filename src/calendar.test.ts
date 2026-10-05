import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createCalendarEventInCalendar } from './calendar.js';

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
