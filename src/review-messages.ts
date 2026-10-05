import type { AppConfig } from './config.js';
import type { CreatedFolder, CreatedDriveFile } from './drive.js';
import { buildReviewerReminderDate } from './tasks.js';

type DeadlineSettings = Pick<
	AppConfig,
	'taskCheckDaysBefore' | 'taskPrepareDaysBefore'
>;

export function formatParticipantDeadline(
	reviewDate: string,
	daysBefore: number,
): string {
	const taskDate = buildReviewerReminderDate(reviewDate, daysBefore);
	const deadline = buildReviewerReminderDate(taskDate, 1);
	const date = new Date(`${deadline}T00:00:00Z`);
	const weekdays = [
		'воскресенья',
		'понедельника',
		'вторника',
		'среды',
		'четверга',
		'пятницы',
		'субботы',
	];
	const monthAndDay = new Intl.DateTimeFormat('ru-RU', {
		day: 'numeric',
		month: 'long',
		timeZone: 'UTC',
	}).format(date);
	return `Дедлайн — вечер ${weekdays[date.getUTCDay()]} (${monthAndDay}).`;
}

export function formatReviewParticipantMessages(
	fullName: string,
	folder: CreatedFolder,
	needsClientForm: boolean,
	reviewDate: string,
	settings: DeadlineSettings,
): string[] {
	const blocks: string[] = [];
	const feedbackDeadline = formatParticipantDeadline(
		reviewDate,
		settings.taskCheckDaysBefore,
	);
	function addFeedback(
		form: CreatedDriveFile | undefined,
		audience: string,
	): void {
		if (!form) return;
		blocks.push('', `*${audience}:*`);
		if (!form.responderUri) {
			blocks.push(
				'Не удалось получить ссылку для заполнения формы. Скопируйте ссылку для респондентов вручную из соответствующей формы выше.',
			);
			return;
		}
		blocks.push(
			`Привет! ${fullName} проходит Performance Review, прошу оставить отзыв.`,
			feedbackDeadline,
			'Если по работе не пересекались, отметь это в отзыве.',
			form.responderUri,
		);
	}
	addFeedback(folder.internalForm, 'Коллегам fuse8');
	if (needsClientForm) addFeedback(folder.clientForm, 'Клиенту');
	if (folder.report?.webViewLink) {
		blocks.push(
			'',
			'*Самому сотруднику:*',
			'Привет, заполни саморевью для проведения PR.',
			formatParticipantDeadline(reviewDate, settings.taskPrepareDaysBefore),
			folder.report.webViewLink,
		);
	}
	return blocks;
}
