import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import type { AppConfig } from './config.js';
import { createOAuthClient } from './oauth.js';

const REVIEW_TIME_ZONE = 'Asia/Yekaterinburg';
const REVIEW_TIME_ZONE_OFFSET = '+05:00';
const REVIEW_DURATION_MINUTES = 150;
const REMINDER_DURATION_MINUTES = 30;

export type CreatedCalendarEvent = {
	id: string;
	summary: string;
	htmlLink: string;
	startDateTime: string;
};

export type ReviewerReminderKind = 'collect' | 'check' | 'prepare';

export type CreatedReviewerReminderEvent = CreatedCalendarEvent & {
	kind: ReviewerReminderKind;
};

export type CalendarEventRequest = {
	fullName: string;
	employeeEmail: string;
	reviewerEmail: string;
	reviewDate: string;
	meetingTime: string;
	folderUrl: string;
	reportUrl?: string;
	internalFormUrl?: string;
	clientFormUrl?: string;
	previousReviewUrl?: string;
};

type CalendarResource = {
	events: {
		insert(
			params: calendar_v3.Params$Resource$Events$Insert & {
				calendarId: 'primary';
				requestBody: calendar_v3.Schema$Event;
			},
		): Promise<{
			data: calendar_v3.Schema$Event;
		}>;
	};
};

type ReviewerReminderSettings = Pick<
	AppConfig,
	| 'taskCollectDaysBefore'
	| 'taskCheckDaysBefore'
	| 'taskPrepareDaysBefore'
	| 'taskReminderTime'
>;

export async function createCalendarEvent(
	config: AppConfig,
	refreshToken: string,
	request: CalendarEventRequest,
): Promise<CreatedCalendarEvent> {
	const auth = createOAuthClient(config);
	auth.setCredentials({ refresh_token: refreshToken });

	const calendar = google.calendar({ version: 'v3', auth });
	return createCalendarEventInCalendar(calendar, request);
}

export async function createReviewerReminderEvents(
	config: AppConfig,
	refreshToken: string,
	request: CalendarEventRequest,
): Promise<CreatedReviewerReminderEvent[]> {
	const auth = createOAuthClient(config);
	auth.setCredentials({ refresh_token: refreshToken });

	const calendar = google.calendar({ version: 'v3', auth });
	return createReviewerReminderEventsInCalendar(calendar, config, request);
}

export async function createCalendarEventInCalendar(
	calendar: CalendarResource,
	request: CalendarEventRequest,
): Promise<CreatedCalendarEvent> {
	const summary = `Performance Review: ${request.fullName}`;
	const { start, end } = buildMeetingDateTimes(
		request.reviewDate,
		request.meetingTime,
	);
	const { data } = await calendar.events.insert({
		calendarId: 'primary',
		requestBody: {
			summary,
			description: buildReviewMeetingDescription(request),
			start: {
				dateTime: start,
				timeZone: REVIEW_TIME_ZONE,
			},
			end: {
				dateTime: end,
				timeZone: REVIEW_TIME_ZONE,
			},
			attendees: [
				{ email: request.reviewerEmail },
				{ email: request.employeeEmail },
			],
		},
	});

	if (!data.id || !data.summary || !data.htmlLink) {
		throw new Error('Google Calendar did not return created event metadata');
	}

	return {
		id: data.id,
		summary: data.summary,
		htmlLink: data.htmlLink,
		startDateTime: start,
	};
}

export async function createReviewerReminderEventsInCalendar(
	calendar: CalendarResource,
	settings: ReviewerReminderSettings,
	request: CalendarEventRequest,
	currentDate = new Date(),
): Promise<CreatedReviewerReminderEvent[]> {
	const reminders = [
		{
			kind: 'collect' as const,
			summary: `Запустить сбор отзывов для PR ${request.fullName}`,
			daysBefore: settings.taskCollectDaysBefore,
		},
		{
			kind: 'check' as const,
			summary: `Проверить отзывы для PR ${request.fullName}`,
			daysBefore: settings.taskCheckDaysBefore,
		},
		{
			kind: 'prepare' as const,
			summary: `Подготовиться к проведению PR ${request.fullName}`,
			daysBefore: settings.taskPrepareDaysBefore,
		},
	];

	const createdEvents: CreatedReviewerReminderEvent[] = [];
	for (const reminder of reminders) {
		const reminderDate = buildReviewerReminderDate(
			request.reviewDate,
			reminder.daysBefore,
		);
		const { start, end } = buildDateTimes(
			reminderDate,
			settings.taskReminderTime,
			REMINDER_DURATION_MINUTES,
		);
		if (new Date(start).getTime() <= currentDate.getTime()) {
			continue;
		}

		const { data } = await calendar.events.insert({
			calendarId: 'primary',
			requestBody: {
				summary: reminder.summary,
				description: buildDescription(request),
				start: {
					dateTime: start,
					timeZone: REVIEW_TIME_ZONE,
				},
				end: {
					dateTime: end,
					timeZone: REVIEW_TIME_ZONE,
				},
				attendees: [{ email: request.reviewerEmail }],
			},
		});

		if (!data.id || !data.summary || !data.htmlLink) {
			throw new Error(
				'Google Calendar did not return created reminder metadata',
			);
		}

		createdEvents.push({
			kind: reminder.kind,
			id: data.id,
			summary: data.summary,
			htmlLink: data.htmlLink,
			startDateTime: start,
		});
	}

	return createdEvents;
}

function buildReviewMeetingDescription(request: CalendarEventRequest): string {
	return request.reportUrl
		? formatCalendarLink('📄', 'Отчёт', request.reportUrl)
		: '';
}

function buildDescription(request: CalendarEventRequest): string {
	return [
		formatCalendarLink('📁', 'Папка ревью', request.folderUrl),
		...(request.reportUrl
			? [formatCalendarLink('📄', 'Отчёт', request.reportUrl)]
			: []),
		...(request.internalFormUrl
			? [
					formatCalendarLink(
						'📝',
						'Форма обратной связи (fuse8)',
						request.internalFormUrl,
					),
				]
			: []),
		...(request.clientFormUrl
			? [
					formatCalendarLink(
						'📝',
						'Форма обратной связи (клиенту)',
						request.clientFormUrl,
					),
				]
			: []),
		...(request.previousReviewUrl
			? [
					formatCalendarLink(
						'📄',
						'Предыдущее ревью',
						request.previousReviewUrl,
					),
				]
			: []),
	].join('\n\n');
}

function formatCalendarLink(icon: string, label: string, url: string): string {
	return `${icon} <a href="${url}">${label}</a>`;
}

function buildMeetingDateTimes(
	reviewDate: string,
	meetingTime: string,
): { start: string; end: string } {
	return buildDateTimes(reviewDate, meetingTime, REVIEW_DURATION_MINUTES);
}

function buildDateTimes(
	reviewDate: string,
	meetingTime: string,
	durationMinutes: number,
): { start: string; end: string } {
	const [year, month, day] = reviewDate.split('-').map(Number);
	const [hours, minutes] = meetingTime.split(':').map(Number);
	const startUtc = Date.UTC(year, month - 1, day, hours - 5, minutes);
	const endUtc = startUtc + durationMinutes * 60 * 1000;

	return {
		start: formatYekaterinburgDateTime(new Date(startUtc)),
		end: formatYekaterinburgDateTime(new Date(endUtc)),
	};
}

function formatYekaterinburgDateTime(date: Date): string {
	const localUtc = new Date(date.getTime() + 5 * 60 * 60 * 1000);
	return `${localUtc.toISOString().slice(0, 19)}${REVIEW_TIME_ZONE_OFFSET}`;
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
