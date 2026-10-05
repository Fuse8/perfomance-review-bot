import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
	formatParticipantDeadline,
	formatReviewParticipantMessages,
} from './review-messages.js';
import type { CreatedFolder } from './drive.js';

for (const [reviewDate, daysBefore, expected] of [
	['2026-03-30', 0, '*Дедлайн — вечер пятницы (27 марта).*'],
	['2026-03-31', 0, '*Дедлайн — вечер понедельника (30 марта).*'],
	['2026-03-30', 1, '*Дедлайн — вечер четверга (26 марта).*'],
	['2026-04-01', 0, '*Дедлайн — вечер вторника (31 марта).*'],
	['2027-01-01', 0, '*Дедлайн — вечер четверга (31 декабря).*'],
	['2024-03-01', 0, '*Дедлайн — вечер четверга (29 февраля).*'],
] as const) {
	test(`participant deadline: ${reviewDate}, offset ${daysBefore}`, () => {
		assert.equal(formatParticipantDeadline(reviewDate, daysBefore), expected);
	});
}

const folder: CreatedFolder = {
	id: 'folder-id',
	name: 'review',
	webViewLink: 'https://example.test/folder',
	internalForm: {
		id: 'internal-id',
		name: 'internal',
		webViewLink: 'https://example.test/internal/edit',
		responderUri: 'https://example.test/internal/viewform',
	},
	clientForm: {
		id: 'client-id',
		name: 'client',
		webViewLink: 'https://example.test/client/edit',
		responderUri: 'https://example.test/client/viewform',
	},
	report: {
		id: 'report-id',
		name: 'report',
		webViewLink: 'https://example.test/report',
	},
};
const settings = { taskCheckDaysBefore: 7, taskPrepareDaysBefore: 3 };

test('templates use respondent links, separate deadlines and compact lines', () => {
	const text = formatReviewParticipantMessages(
		'Виктор Облешев',
		folder,
		true,
		'2026-06-15',
		settings,
	).join('\n');
	assert.ok(
		text.includes(
			'Привет! Виктор Облешев проходит Performance Review, прошу оставить отзыв.\n*Дедлайн — вечер пятницы (5 июня).*\nЕсли по работе не пересекались, отметь это в отзыве.\nhttps://example.test/internal/viewform',
		),
	);
	assert.ok(
		text.includes(
			'Привет, заполни саморевью для проведения PR.\n*Дедлайн — вечер четверга (11 июня).*\nhttps://example.test/report',
		),
	);
	assert.ok(text.includes('https://example.test/client/viewform'));
	assert.doesNotMatch(text, /\/edit/);
});

test('templates respect client selection and missing documents', () => {
	const text = formatReviewParticipantMessages(
		'Сотрудник',
		folder,
		false,
		'2026-06-15',
		settings,
	).join('\n');
	assert.doesNotMatch(text, /Клиенту:|client\/viewform/);
	assert.deepEqual(
		formatReviewParticipantMessages(
			'Сотрудник',
			{ id: 'id', name: 'empty', webViewLink: 'https://example.test/folder' },
			true,
			'2026-06-15',
			settings,
		),
		[],
	);
});

test('missing respondent URI offers manual fallback without an editor URL', () => {
	const text = formatReviewParticipantMessages(
		'Сотрудник',
		{
			...folder,
			report: undefined,
			clientForm: undefined,
			internalForm: { ...folder.internalForm!, responderUri: undefined },
		},
		true,
		'2026-06-15',
		settings,
	).join('\n');
	assert.match(text, /Скопируйте ссылку для респондентов вручную/);
	assert.doesNotMatch(text, /Привет|\/edit|Клиенту:|Самому сотруднику:/);
});
