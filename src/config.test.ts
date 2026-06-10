import assert from 'node:assert/strict';
import { test } from 'vitest';
import { loadConfig } from './config.js';

function setRequiredConfigEnv(): void {
	process.env.APP_BASE_URL = 'https://example.test';
	process.env.GOOGLE_CLIENT_ID = 'client-id';
	process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
	process.env.GOOGLE_REDIRECT_URI = 'https://example.test/auth/google/callback';
	process.env.REVIEWS_ROOT_FOLDER_ID = 'root-folder-id';
	process.env.DATABASE_URL = 'postgresql://user:pass@host/db';
	process.env.INTERNAL_REVIEW_FORM_TEMPLATE_ID = 'internal-template-id';
	process.env.CLIENT_REVIEW_FORM_TEMPLATE_ID = 'client-template-id';
}

test('loadConfig reads feedback form template ids from env', () => {
	const previousEnv = { ...process.env };

	try {
		setRequiredConfigEnv();

		const config = loadConfig();

		assert.equal(config.internalReviewFormTemplateId, 'internal-template-id');
		assert.equal(config.clientReviewFormTemplateId, 'client-template-id');
	} finally {
		process.env = previousEnv;
	}
});

test('loadConfig requires internal feedback form template id', () => {
	const previousEnv = { ...process.env };

	try {
		setRequiredConfigEnv();
		delete process.env.INTERNAL_REVIEW_FORM_TEMPLATE_ID;

		assert.throws(
			() => loadConfig(),
			/Missing required env var: INTERNAL_REVIEW_FORM_TEMPLATE_ID/,
		);
	} finally {
		process.env = previousEnv;
	}
});

test('loadConfig requires client feedback form template id', () => {
	const previousEnv = { ...process.env };

	try {
		setRequiredConfigEnv();
		delete process.env.CLIENT_REVIEW_FORM_TEMPLATE_ID;

		assert.throws(
			() => loadConfig(),
			/Missing required env var: CLIENT_REVIEW_FORM_TEMPLATE_ID/,
		);
	} finally {
		process.env = previousEnv;
	}
});

test('loadConfig allows missing EMPLOYEE_EMAIL_DOMAIN so the server can start', () => {
	const previousEnv = { ...process.env };

	try {
		setRequiredConfigEnv();
		delete process.env.REVIEW_REPORT_TEMPLATE_ID;
		delete process.env.EMPLOYEE_EMAIL_DOMAINS;

		const config = loadConfig();

		assert.deepEqual(config.employeeEmailDomains, []);
	} finally {
		process.env = previousEnv;
	}
});

test('loadConfig parses comma-separated employee email domains', () => {
	const previousEnv = { ...process.env };

	try {
		setRequiredConfigEnv();
		process.env.REVIEW_REPORT_TEMPLATE_ID = 'report-template-id';
		process.env.EMPLOYEE_EMAIL_DOMAINS = 'fuse8.online, byteminds.co.uk';

		const config = loadConfig();

		assert.deepEqual(config.employeeEmailDomains, [
			'fuse8.online',
			'byteminds.co.uk',
		]);
	} finally {
		process.env = previousEnv;
	}
});

test('loadConfig uses default reviewer task reminder settings', () => {
	const previousEnv = { ...process.env };

	try {
		setRequiredConfigEnv();
		delete process.env.TASK_COLLECT_DAYS_BEFORE;
		delete process.env.TASK_CHECK_DAYS_BEFORE;
		delete process.env.TASK_PREPARE_DAYS_BEFORE;
		delete process.env.TASK_REMINDER_TIME;

		const config = loadConfig();

		assert.equal(config.taskCollectDaysBefore, 14);
		assert.equal(config.taskCheckDaysBefore, 7);
		assert.equal(config.taskPrepareDaysBefore, 3);
		assert.equal(config.taskReminderTime, '12:00');
	} finally {
		process.env = previousEnv;
	}
});

test('loadConfig allows missing Google Chat service account key file', () => {
	const previousEnv = { ...process.env };

	try {
		setRequiredConfigEnv();
		delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;

		const config = loadConfig();

		assert.equal(config.chatServiceAccountKeyFile, undefined);
	} finally {
		process.env = previousEnv;
	}
});

test('loadConfig reads Google Chat service account key file', () => {
	const previousEnv = { ...process.env };

	try {
		setRequiredConfigEnv();
		process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE = '.data/service-account.json';

		const config = loadConfig();

		assert.equal(
			config.chatServiceAccountKeyFile,
			'.data/service-account.json',
		);
	} finally {
		process.env = previousEnv;
	}
});

test('loadConfig requires database url', () => {
	const previousEnv = { ...process.env };

	try {
		setRequiredConfigEnv();
		delete process.env.DATABASE_URL;

		assert.throws(() => loadConfig(), /Missing required env var: DATABASE_URL/);
	} finally {
		process.env = previousEnv;
	}
});

test('loadConfig reads database url', () => {
	const previousEnv = { ...process.env };

	try {
		setRequiredConfigEnv();

		const config = loadConfig();

		assert.equal(config.databaseUrl, 'postgresql://user:pass@host/db');
	} finally {
		process.env = previousEnv;
	}
});

test('loadConfig reads Google service account credentials json', () => {
	const previousEnv = { ...process.env };

	try {
		setRequiredConfigEnv();
		process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS =
			'{"client_email":"bot@example.test"}';

		const config = loadConfig();

		assert.equal(
			config.chatServiceAccountCredentials,
			'{"client_email":"bot@example.test"}',
		);
	} finally {
		process.env = previousEnv;
	}
});
