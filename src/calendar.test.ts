import assert from 'node:assert/strict';
import { expect, test } from 'vitest';
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
	expect(insertedEvents).toEqual([
		{
			calendarId: 'primary',
			conferenceDataVersion: 1,
			requestBody: {
				summary: 'Performance Review: Ivan Petrov',
				conferenceData: {
					createRequest: {
						requestId: expect.any(String),
						conferenceSolutionKey: { type: 'hangoutsMeet' },
					},
				},
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

for (const meetingUrl of [
	undefined,
	'',
	'   ',
	'https://call.example.test/room?a=1&b="<\'x>',
	'http://call.example.test/room',
]) {
	test(`calendar selects conference mode for ${JSON.stringify(meetingUrl)}`, async () => {
		const inserted: Array<
			import('googleapis').calendar_v3.Params$Resource$Events$Insert
		> = [];
		const calendar = {
			events: {
				async insert(
					params: import('googleapis').calendar_v3.Params$Resource$Events$Insert,
				) {
					inserted.push(params);
					return {
						data: {
							id: 'event-id',
							summary: 'Review',
							htmlLink: 'https://calendar.example.test/event',
							conferenceData: {
								createRequest: { status: { statusCode: 'pending' } },
							},
						},
					};
				},
			},
		};
		const request = {
			fullName: 'Ivan Petrov',
			employeeEmail: 'employee@example.test',
			reviewerEmail: 'reviewer@example.test',
			reviewDate: '2026-06-15',
			meetingTime: '14:30',
			folderUrl: 'https://drive.example.test/folder',
			meetingUrl,
		};
		await createCalendarEventInCalendar(calendar, request);
		await createCalendarEventInCalendar(calendar, request);
		const event = inserted[0];
		assert.ok(event);
		if (meetingUrl?.trim()) {
			assert.equal(event.conferenceDataVersion, undefined);
			assert.equal(event.requestBody?.conferenceData, undefined);
			assert.equal(event.requestBody?.location, meetingUrl);
			assert.equal(
				event.requestBody?.description,
				meetingUrl.startsWith('https:')
					? '📹 <a href="https://call.example.test/room?a=1&amp;b=&quot;&lt;&#39;x&gt;">Созвон</a>'
					: '📹 <a href="http://call.example.test/room">Созвон</a>',
			);
		} else {
			assert.equal(event.conferenceDataVersion, 1);
			assert.equal(event.requestBody?.location, undefined);
			assert.equal(
				event.requestBody?.conferenceData?.createRequest?.conferenceSolutionKey
					?.type,
				'hangoutsMeet',
			);
			const requestId =
				event.requestBody?.conferenceData?.createRequest?.requestId;
			assert.ok(requestId);
			assert.notEqual(
				requestId,
				inserted[1]?.requestBody?.conferenceData?.createRequest?.requestId,
			);
		}
	});
}
