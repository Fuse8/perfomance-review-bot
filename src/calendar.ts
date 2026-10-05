import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import type { AppConfig } from './config.js';
import { createOAuthClient } from './oauth.js';

const REVIEW_TIME_ZONE = 'Asia/Yekaterinburg';
const REVIEW_TIME_ZONE_OFFSET = '+05:00';
const REVIEW_DURATION_MINUTES = 150;

export type CreatedCalendarEvent = {
	id: string;
	summary: string;
	htmlLink: string;
	startDateTime: string;
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

function buildReviewMeetingDescription(request: CalendarEventRequest): string {
	return request.reportUrl
		? formatCalendarLink('📄', 'Отчёт', request.reportUrl)
		: '';
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
