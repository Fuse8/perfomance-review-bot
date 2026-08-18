import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
	createReviewFolderInDrive,
	extractPreviousReviewHeader,
	findEmployeeFolderInDrive,
	findPreviousReviewReportInDrive,
	formatGoogleDriveFolderUrl,
	formatDriveStepError,
	grantCompanyFormResponderAccess,
	isReviewMonthFolderName,
	listEmployeeFoldersInDrive,
	listReviewStatusesInDrive,
	normalizePersonName,
	parseGoogleDriveFolderUrl,
	publishCopiedGoogleForm,
	withDriveStep,
} from './drive.js';

test('parseGoogleDriveFolderUrl extracts the folder ID from a canonical URL', () => {
	assert.equal(
		parseGoogleDriveFolderUrl(
			'https://drive.google.com/drive/folders/reviewer-folder-id',
		),
		'reviewer-folder-id',
	);
});

test('Google Drive folder URL conversion handles account paths and canonical output', () => {
	assert.equal(
		parseGoogleDriveFolderUrl(
			'https://drive.google.com/drive/u/2/folders/reviewer-folder-id?usp=drive_link#section',
		),
		'reviewer-folder-id',
	);
	assert.equal(
		formatGoogleDriveFolderUrl('reviewer-folder-id'),
		'https://drive.google.com/drive/folders/reviewer-folder-id',
	);
});

test('parseGoogleDriveFolderUrl rejects values that are not supported folder URLs', () => {
	for (const value of [
		'reviewer-folder-id',
		'http://drive.google.com/drive/folders/reviewer-folder-id',
		'https://example.test/drive/folders/reviewer-folder-id',
		'https://drive.google.com/file/d/reviewer-folder-id/view',
		'https://drive.google.com/drive/folders/reviewer-folder-id?resourcekey=resource-key',
	]) {
		assert.throws(() => parseGoogleDriveFolderUrl(value));
	}
});

test('isReviewMonthFolderName matches YYYY.MM folders', () => {
	assert.equal(isReviewMonthFolderName('2026.06'), true);
	assert.equal(isReviewMonthFolderName('2026-06'), false);
});

test('normalizePersonName trims, lowercases and collapses spaces', () => {
	assert.equal(normalizePersonName('  Ivan   PETROV  '), 'ivan petrov');
});

test('formatDriveStepError includes the failing Drive step', () => {
	assert.equal(
		formatDriveStepError(
			'Проверка доступа к шаблону PR report (REVIEW_REPORT_TEMPLATE_ID)',
			new Error('The user does not have sufficient permissions for this file.'),
		),
		'Проверка доступа к шаблону PR report (REVIEW_REPORT_TEMPLATE_ID): The user does not have sufficient permissions for this file.',
	);
});

test('extractPreviousReviewHeader reads header values from table cells', () => {
	const header = extractPreviousReviewHeader({
		body: {
			content: [
				{
					table: {
						tableRows: [
							{
								tableCells: [
									{
										content: [paragraph('Должность')],
									},
									{
										content: [paragraph('Senior Developer')],
									},
								],
							},
							{
								tableCells: [
									{
										content: [paragraph('Работает с')],
									},
									{
										content: [paragraph('2022-03-01')],
									},
								],
							},
							{
								tableCells: [
									{
										content: [paragraph('Дата этого ревью')],
									},
									{
										content: [paragraph('2026-05-20')],
									},
								],
							},
						],
					},
				},
			],
		},
	});

	assert.deepEqual(header, {
		position: 'Senior Developer',
		worksSince: '2022-03-01',
		previousReviewDate: '2026-05-20',
	});
});

test('extractPreviousReviewHeader uses dash for missing values', () => {
	const header = extractPreviousReviewHeader({
		body: {
			content: [
				{
					paragraph: {
						elements: [{ textRun: { content: 'Unexpected document' } }],
					},
				},
			],
		},
	});

	assert.deepEqual(header, {
		position: '-',
		worksSince: '-',
		previousReviewDate: '-',
	});
});

test('withDriveStep rethrows errors with step context', async () => {
	await assert.rejects(
		() =>
			withDriveStep('Копирование PR report из шаблона', async () => {
				throw new Error(
					'The user does not have sufficient permissions for this file.',
				);
			}),
		/Копирование PR report из шаблона: The user does not have sufficient permissions for this file\./,
	);
});

test('listEmployeeFoldersInDrive returns matching employee folders', async () => {
	const files = {
		async list(params: { q?: string; fields?: string; pageSize?: number }) {
			assert.match(params.q ?? '', /root-folder-id/);
			assert.equal(params.fields, 'nextPageToken,files(id,name)');
			assert.equal(params.pageSize, 100);
			return {
				data: {
					files: [
						{ id: 'ivan-folder-id', name: 'Ivan Petrov' },
						{ id: 'petr-folder-id', name: 'Petr Ivanov' },
						{ id: 'empty-name', name: '' },
						{ id: null, name: 'No Id' },
					],
				},
			};
		},
	};

	const folders = await listEmployeeFoldersInDrive(
		files,
		'root-folder-id',
		'ivan',
	);

	assert.deepEqual(folders, [
		{ id: 'ivan-folder-id', name: 'Ivan Petrov' },
		{ id: 'petr-folder-id', name: 'Petr Ivanov' },
	]);
});

test('findEmployeeFolderInDrive finds employee by exact normalized folder name', async () => {
	const files = {
		async list() {
			return {
				data: {
					files: [
						{ id: 'wrong-folder-id', name: 'Ivan Ivanov' },
						{ id: 'employee-folder-id', name: '  IVAN   petrov ' },
					],
				},
			};
		},
	};

	const folder = await findEmployeeFolderInDrive(
		files,
		'root-folder-id',
		'Ivan Petrov',
	);

	assert.deepEqual(folder, {
		id: 'employee-folder-id',
		name: '  IVAN   petrov ',
	});
});

test('createReviewFolderInDrive creates review month folder inside matched employee folder', async () => {
	const createdParents: string[][] = [];
	const copiedFiles: Array<{
		fileId: string;
		name?: string;
		parents?: string[];
	}> = [];
	const replacedTexts: Array<{ containsText?: string; replaceText?: string }> =
		[];
	const fetchedDocumentIds: string[] = [];
	const permissions: Array<{
		fileId: string;
		emailAddress?: string;
		domain?: string;
		type?: string;
		role?: string;
		view?: string;
	}> = [];
	const files = {
		async get() {
			return {
				data: {
					mimeType: 'application/vnd.google-apps.folder',
				},
			};
		},
		async list() {
			return {
				data: {
					files: [
						{
							id: 'employee-folder-id',
							name: '  IVAN   petrov ',
						},
					],
				},
			};
		},
		async create(params: { requestBody?: { parents?: string[] } }) {
			createdParents.push(params.requestBody?.parents ?? []);
			return {
				data: {
					id: 'month-folder-id',
					name: '2026.06',
					webViewLink: 'https://drive.google.com/month-folder',
				},
			};
		},
		async copy(params: {
			fileId: string;
			requestBody?: { name?: string; parents?: string[] };
		}) {
			copiedFiles.push({
				fileId: params.fileId,
				name: params.requestBody?.name,
				parents: params.requestBody?.parents,
			});
			const webViewLink =
				params.fileId === 'internal-form-template-id'
					? 'https://docs.google.com/forms/internal-form-id'
					: params.fileId === 'client-form-template-id'
						? 'https://docs.google.com/forms/client-form-id'
						: 'https://docs.google.com/document/report-id';
			const id =
				params.fileId === 'internal-form-template-id'
					? 'internal-form-id'
					: params.fileId === 'client-form-template-id'
						? 'client-form-id'
						: 'report-id';
			return {
				data: {
					id,
					name: params.requestBody?.name,
					webViewLink,
				},
			};
		},
	};
	const documents = {
		async get(params: { documentId: string }) {
			fetchedDocumentIds.push(params.documentId);
			return {
				data: {
					body: {
						content: [
							{
								table: {
									tableRows: [
										{
											tableCells: [
												{ content: [paragraph('Должность')] },
												{ content: [paragraph('Senior Developer')] },
											],
										},
										{
											tableCells: [
												{ content: [paragraph('Работает с')] },
												{ content: [paragraph('2022-03-01')] },
											],
										},
										{
											tableCells: [
												{ content: [paragraph('Дата этого ревью')] },
												{ content: [paragraph('2026-05-20')] },
											],
										},
									],
								},
							},
						],
					},
				},
			};
		},
		async batchUpdate(params: {
			documentId: string;
			requestBody?: {
				requests?: Array<{
					replaceAllText?: {
						containsText?: { text?: string };
						replaceText?: string;
					};
				}>;
			};
		}) {
			assert.equal(params.documentId, 'report-id');
			for (const request of params.requestBody?.requests ?? []) {
				replacedTexts.push({
					containsText: request.replaceAllText?.containsText?.text,
					replaceText: request.replaceAllText?.replaceText,
				});
			}
			return { data: {} };
		},
	};
	const permissionsResource = {
		async create(params: {
			fileId: string;
			requestBody?: {
				emailAddress?: string;
				domain?: string;
				type?: string;
				role?: string;
				view?: string;
			};
		}) {
			permissions.push({
				fileId: params.fileId,
				emailAddress: params.requestBody?.emailAddress,
				domain: params.requestBody?.domain,
				type: params.requestBody?.type,
				role: params.requestBody?.role,
				view: params.requestBody?.view,
			});
			return { data: {} };
		},
	};
	const publishedFormIds: string[] = [];
	const formEmailSettings: Array<{
		formId: string;
		emailCollectionType?: string | null;
		updateMask?: string | null;
	}> = [];
	const formTitles: Array<{
		formId: string;
		title?: string | null;
		updateMask?: string | null;
		description?: string | null;
	}> = [];
	const forms = {
		async setPublishSettings(params: { formId: string }) {
			publishedFormIds.push(params.formId);
			return { data: {} };
		},
		async batchUpdate(params: {
			formId: string;
			requestBody?: {
				requests?: Array<{
					updateSettings?: {
						settings?: { emailCollectionType?: string | null };
						updateMask?: string | null;
					};
					updateFormInfo?: {
						info?: { title?: string | null; description?: string | null };
						updateMask?: string | null;
					};
				}>;
			};
		}) {
			for (const request of params.requestBody?.requests ?? []) {
				if (request.updateSettings) {
					formEmailSettings.push({
						formId: params.formId,
						emailCollectionType:
							request.updateSettings.settings?.emailCollectionType,
						updateMask: request.updateSettings.updateMask,
					});
				}

				if (request.updateFormInfo) {
					formTitles.push({
						formId: params.formId,
						title: request.updateFormInfo.info?.title,
						updateMask: request.updateFormInfo.updateMask,
						description: request.updateFormInfo.info?.description,
					});
				}
			}
			return { data: {} };
		},
	};

	const folder = await createReviewFolderInDrive(
		{ files, permissions: permissionsResource, documents, forms },
		{
			rootFolderId: 'root-folder-id',
			reviewReportTemplateId: 'report-template-id',
			internalReviewFormTemplateId: 'internal-form-template-id',
			clientReviewFormTemplateId: 'client-form-template-id',
			fullName: 'Ivan Petrov',
			employeeEmail: 'ivan.petrov@example.test',
			reviewerEmail: 'reviewer@example.test',
			reviewerName: 'Reviewer Name',
			reviewDate: '2026-06-15',
			meetingTime: '14:30',
			reviewMonth: '2026.06',
			needsClientForm: true,
			previousReviewId: 'previous-report-id',
			previousReviewUrl: 'https://docs.google.com/document/previous-report',
			internalFormResponderDomains: ['fuse8.online', 'byteminds.co.uk'],
		},
	);

	assert.equal(folder.name, '2026.06');
	assert.equal(
		folder.report?.webViewLink,
		'https://docs.google.com/document/report-id',
	);
	assert.equal(
		folder.internalForm?.webViewLink,
		'https://docs.google.com/forms/internal-form-id',
	);
	assert.equal(
		folder.clientForm?.webViewLink,
		'https://docs.google.com/forms/client-form-id',
	);
	assert.deepEqual(createdParents, [['employee-folder-id']]);
	assert.deepEqual(fetchedDocumentIds, ['previous-report-id']);
	assert.deepEqual(copiedFiles, [
		{
			fileId: 'report-template-id',
			name: 'Ivan Petrov // Отчёт Performance Review // 2026-06',
			parents: ['month-folder-id'],
		},
		{
			fileId: 'internal-form-template-id',
			name: 'Ivan Petrov // Отзыв Performance review // 2026-06',
			parents: ['month-folder-id'],
		},
		{
			fileId: 'client-form-template-id',
			name: 'Ivan Petrov // Отзыв Performance review от клиента // 2026-06',
			parents: ['month-folder-id'],
		},
	]);
	assert.deepEqual(replacedTexts, [
		{ containsText: '{{FULL_NAME}}', replaceText: 'Ivan Petrov' },
		{ containsText: '{{REVIEW_DATE}}', replaceText: '2026-06-15' },
		{
			containsText: '{{REVIEWER_NAME}}',
			replaceText: 'Reviewer Name',
		},
		{
			containsText: '{{REVIEW_FOLDER_URL}}',
			replaceText: 'https://drive.google.com/month-folder',
		},
		{
			containsText: '{{PREVIOUS_REVIEW_URL}}',
			replaceText: 'https://docs.google.com/document/previous-report',
		},
		{ containsText: '{{POSITION}}', replaceText: 'Senior Developer' },
		{ containsText: '{{WORKS_SINCE}}', replaceText: '2022-03-01' },
		{
			containsText: '{{PREVIOUS_REVIEW_DATE}}',
			replaceText: '2026-05-20',
		},
	]);
	assert.deepEqual(permissions, [
		{
			fileId: 'report-id',
			emailAddress: 'ivan.petrov@example.test',
			type: 'user',
			role: 'writer',
			view: undefined,
			domain: undefined,
		},
		{
			fileId: 'internal-form-id',
			emailAddress: undefined,
			type: 'domain',
			role: 'reader',
			domain: 'fuse8.online',
			view: 'published',
		},
		{
			fileId: 'internal-form-id',
			emailAddress: undefined,
			type: 'domain',
			role: 'reader',
			domain: 'byteminds.co.uk',
			view: 'published',
		},
		{
			fileId: 'client-form-id',
			emailAddress: undefined,
			type: 'anyone',
			role: 'reader',
			domain: undefined,
			view: 'published',
		},
	]);
	assert.deepEqual(publishedFormIds, ['internal-form-id', 'client-form-id']);
	assert.deepEqual(formEmailSettings, [
		{
			formId: 'internal-form-id',
			emailCollectionType: 'VERIFIED',
			updateMask: 'emailCollectionType',
		},
		{
			formId: 'client-form-id',
			emailCollectionType: 'DO_NOT_COLLECT',
			updateMask: 'emailCollectionType',
		},
	]);
	assert.deepEqual(formTitles, [
		{
			formId: 'internal-form-id',
			title: 'Ivan Petrov // Отзыв Performance review // 2026-06',
			updateMask: 'title',
			description: undefined,
		},
		{
			formId: 'client-form-id',
			title: 'Ivan Petrov // Отзыв Performance review от клиента // 2026-06',
			updateMask: 'title',
			description: undefined,
		},
	]);
});

test('grantCompanyFormResponderAccess adds published reader for each domain', async () => {
	const permissions: Array<{ fileId: string; domain?: string; view?: string }> =
		[];
	const drive = {
		files: {} as never,
		permissions: {
			async create(params: {
				fileId: string;
				requestBody: { domain?: string; view?: string };
			}) {
				permissions.push({
					fileId: params.fileId,
					domain: params.requestBody.domain,
					view: params.requestBody.view,
				});
				return { data: {} };
			},
		},
	};

	await grantCompanyFormResponderAccess(
		drive as Parameters<typeof grantCompanyFormResponderAccess>[0],
		'form-123',
		['@Fuse8.Online', 'fuse8.online', ''],
	);

	assert.deepEqual(permissions, [
		{ fileId: 'form-123', domain: 'fuse8.online', view: 'published' },
	]);
});

test('publishCopiedGoogleForm sets published and accepting responses', async () => {
	let requestBody:
		| {
				publishSettings?: {
					publishState?: {
						isPublished?: boolean;
						isAcceptingResponses?: boolean;
					};
				};
		  }
		| undefined;
	const forms = {
		async setPublishSettings(params: {
			formId: string;
			requestBody: {
				publishSettings: {
					publishState: {
						isPublished: boolean;
						isAcceptingResponses: boolean;
					};
				};
			};
		}) {
			requestBody = params.requestBody;
			return { data: {} };
		},
	};

	await publishCopiedGoogleForm(forms, 'form-abc');

	assert.equal(requestBody?.publishSettings?.publishState?.isPublished, true);
	assert.equal(
		requestBody?.publishSettings?.publishState?.isAcceptingResponses,
		true,
	);
});

test('createReviewFolderInDrive creates only internal form when client form is not needed', async () => {
	const copiedFiles: Array<{
		fileId: string;
		name?: string;
		parents?: string[];
	}> = [];
	const formEmailSettings: Array<{
		formId: string;
		emailCollectionType?: string | null;
	}> = [];
	const formTitles: Array<{ formId: string; title?: string | null }> = [];
	const permissions: Array<{ fileId: string; type?: string }> = [];
	const files = {
		async get() {
			return {
				data: {
					mimeType: 'application/vnd.google-apps.folder',
				},
			};
		},
		async list() {
			return {
				data: {
					files: [
						{
							id: 'employee-folder-id',
							name: 'Ivan Petrov',
						},
					],
				},
			};
		},
		async create() {
			return {
				data: {
					id: 'month-folder-id',
					name: '2026.06',
					webViewLink: 'https://drive.google.com/month-folder',
				},
			};
		},
		async copy(params: {
			fileId: string;
			requestBody?: { name?: string; parents?: string[] };
		}) {
			copiedFiles.push({
				fileId: params.fileId,
				name: params.requestBody?.name,
				parents: params.requestBody?.parents,
			});
			const webViewLink =
				params.fileId === 'internal-form-template-id'
					? 'https://docs.google.com/forms/internal-form-id'
					: 'https://docs.google.com/document/report-id';
			return {
				data: {
					id:
						params.fileId === 'internal-form-template-id'
							? 'internal-form-id'
							: 'report-id',
					name: params.requestBody?.name,
					webViewLink,
				},
			};
		},
	};
	const documents = {
		async batchUpdate() {
			return { data: {} };
		},
	};
	const forms = {
		async setPublishSettings() {
			return { data: {} };
		},
		async batchUpdate(params: {
			formId: string;
			requestBody?: {
				requests?: Array<{
					updateSettings?: {
						settings?: { emailCollectionType?: string | null };
					};
					updateFormInfo?: {
						info?: { title?: string | null };
					};
				}>;
			};
		}) {
			for (const request of params.requestBody?.requests ?? []) {
				if (request.updateSettings) {
					formEmailSettings.push({
						formId: params.formId,
						emailCollectionType:
							request.updateSettings.settings?.emailCollectionType,
					});
				}

				if (request.updateFormInfo) {
					formTitles.push({
						formId: params.formId,
						title: request.updateFormInfo.info?.title,
					});
				}
			}
			return { data: {} };
		},
	};
	const permissionsResource = {
		async create(params: { fileId: string; requestBody?: { type?: string } }) {
			permissions.push({
				fileId: params.fileId,
				type: params.requestBody?.type,
			});
			return { data: {} };
		},
	};

	const folder = await createReviewFolderInDrive(
		{ files, permissions: permissionsResource, documents, forms },
		{
			rootFolderId: 'root-folder-id',
			reviewReportTemplateId: 'report-template-id',
			internalReviewFormTemplateId: 'internal-form-template-id',
			clientReviewFormTemplateId: 'client-form-template-id',
			fullName: 'Ivan Petrov',
			employeeEmail: 'ivan.petrov@example.test',
			reviewerEmail: 'reviewer@example.test',
			reviewerName: 'Reviewer Name',
			reviewDate: '2026-06-15',
			meetingTime: '14:30',
			reviewMonth: '2026.06',
			needsClientForm: false,
		},
	);

	assert.equal(
		folder.internalForm?.webViewLink,
		'https://docs.google.com/forms/internal-form-id',
	);
	assert.equal(folder.clientForm, undefined);
	assert.deepEqual(
		copiedFiles.map((file) => file.fileId),
		['report-template-id', 'internal-form-template-id'],
	);
	assert.deepEqual(formEmailSettings, [
		{
			formId: 'internal-form-id',
			emailCollectionType: 'VERIFIED',
		},
	]);
	assert.deepEqual(formTitles, [
		{
			formId: 'internal-form-id',
			title: 'Ivan Petrov // Отзыв Performance review // 2026-06',
		},
	]);
	assert.equal(
		permissions.some(
			(permission) =>
				permission.fileId === 'client-form-id' || permission.type === 'anyone',
		),
		false,
	);
});

test('createReviewFolderInDrive skips permission grant when employee is the reviewer', async () => {
	let permissionCalls = 0;
	const files = createFilesStub();
	const permissions = {
		async create() {
			permissionCalls += 1;
			return { data: {} };
		},
	};

	await createReviewFolderInDrive(
		{
			files,
			permissions,
			documents: {
				async batchUpdate() {
					return { data: {} };
				},
			},
		},
		{
			rootFolderId: 'root-folder-id',
			reviewReportTemplateId: 'report-template-id',
			internalReviewFormTemplateId: 'internal-form-template-id',
			clientReviewFormTemplateId: 'client-form-template-id',
			fullName: 'Ivan Petrov',
			employeeEmail: 'dmitry.berdnikov@fuse8.online',
			reviewerEmail: 'dmitry.berdnikov@fuse8.online',
			reviewerName: 'Dmitry Berdnikov',
			reviewDate: '2026-06-15',
			meetingTime: '14:30',
			reviewMonth: '2026.06',
			needsClientForm: false,
		},
	);

	assert.equal(permissionCalls, 0);
});

test('createReviewFolderInDrive fails when employee folder is missing', async () => {
	const files = {
		async get() {
			return {
				data: {
					mimeType: 'application/vnd.google-apps.folder',
				},
			};
		},
		async list() {
			return {
				data: {
					files: [],
				},
			};
		},
		async create() {
			throw new Error('should not create folder');
		},
		async copy() {
			throw new Error('should not copy report');
		},
	};

	await assert.rejects(
		() =>
			createReviewFolderInDrive(
				{ files },
				{
					rootFolderId: 'root-folder-id',
					reviewReportTemplateId: 'report-template-id',
					internalReviewFormTemplateId: 'internal-form-template-id',
					clientReviewFormTemplateId: 'client-form-template-id',
					fullName: 'Ivan Petrov',
					employeeEmail: 'ivan.petrov@example.test',
					reviewerEmail: 'reviewer@example.test',
					reviewerName: 'Reviewer Name',
					reviewDate: '2026-06-15',
					meetingTime: '14:30',
					reviewMonth: '2026.06',
					needsClientForm: false,
				},
			),
		/Поиск папки сотрудника "Ivan Petrov": Папка сотрудника не найдена: Ivan Petrov/,
	);
});

test('findPreviousReviewReportInDrive returns the newest previous report', async () => {
	const listCalls: string[] = [];
	const files = {
		async list(params: { q?: string; fields?: string }) {
			listCalls.push(params.q ?? '');

			if (params.q?.includes('root-folder-id')) {
				return {
					data: {
						files: [{ id: 'employee-folder-id', name: 'Ivan Petrov' }],
					},
				};
			}

			if (
				params.q?.includes('employee-folder-id') &&
				params.fields === 'files(id,name)'
			) {
				return {
					data: {
						files: [
							{ id: 'month-2026-04', name: '2026.04' },
							{ id: 'month-2026-05', name: '2026.05' },
							{ id: 'month-2026-06', name: '2026.06' },
						],
					},
				};
			}

			if (params.q?.includes('month-2026-05')) {
				return {
					data: {
						files: [
							{
								id: 'report-2026-05',
								name: 'Ivan Petrov // Отчёт Performance Review // 2026-05',
								webViewLink: 'https://docs.google.com/document/report-2026-05',
							},
						],
					},
				};
			}

			if (params.q?.includes('month-2026-04')) {
				return {
					data: {
						files: [
							{
								id: 'report-2026-04',
								name: 'Ivan Petrov // Отчёт Performance Review // 2026-04',
								webViewLink: 'https://docs.google.com/document/report-2026-04',
							},
						],
					},
				};
			}

			return { data: { files: [] } };
		},
	};

	const previous = await findPreviousReviewReportInDrive(
		{ files: files as never },
		'root-folder-id',
		'Ivan Petrov',
		'2026.06',
	);

	assert.deepEqual(previous, {
		id: 'report-2026-05',
		name: 'Ivan Petrov // Отчёт Performance Review // 2026-05',
		webViewLink: 'https://docs.google.com/document/report-2026-05',
	});
	assert.match(listCalls[2] ?? '', /month-2026-05/);
});

test('findPreviousReviewReportInDrive returns null when no previous report exists', async () => {
	const files = {
		async list(params: { q?: string; fields?: string }) {
			if (params.q?.includes('root-folder-id')) {
				return {
					data: {
						files: [{ id: 'employee-folder-id', name: 'Ivan Petrov' }],
					},
				};
			}

			if (
				params.q?.includes('employee-folder-id') &&
				params.fields === 'files(id,name)'
			) {
				return {
					data: {
						files: [{ id: 'month-2026-06', name: '2026.06' }],
					},
				};
			}

			return { data: { files: [] } };
		},
	};

	const previous = await findPreviousReviewReportInDrive(
		{ files: files as never },
		'root-folder-id',
		'Ivan Petrov',
		'2026.06',
	);

	assert.equal(previous, null);
});

test('listReviewStatusesInDrive paginates Drive lists and returns latest reports', async () => {
	const listCalls: string[] = [];
	const files = {
		async list(params: { q?: string; fields?: string; pageToken?: string }) {
			listCalls.push(
				params.pageToken ? `${params.q} ${params.pageToken}` : (params.q ?? ''),
			);

			if (params.q?.includes('root-folder-id') && !params.pageToken) {
				return {
					data: {
						files: [{ id: 'ivan-folder-id', name: 'Ivan Petrov' }],
						nextPageToken: 'root-page-2',
					},
				};
			}

			if (params.pageToken === 'root-page-2') {
				return {
					data: {
						files: [{ id: 'petr-folder-id', name: 'Petr Ivanov' }],
					},
				};
			}

			if (params.q?.includes('ivan-folder-id')) {
				return {
					data: {
						files: [
							{ id: 'ivan-2026-01', name: '2026.01' },
							{ id: 'ivan-2026-05', name: '2026.05' },
						],
					},
				};
			}

			if (params.q?.includes('petr-folder-id')) {
				return {
					data: {
						files: [{ id: 'petr-2026-02', name: '2026.02' }],
					},
				};
			}

			if (params.q?.includes('ivan-2026-05')) {
				return {
					data: {
						files: [
							{
								id: 'ivan-report-id',
								name: 'Ivan Petrov // Отчёт Performance Review // 2026-05',
								webViewLink: 'https://docs.google.com/document/ivan-report-id',
							},
						],
					},
				};
			}

			return { data: { files: [] } };
		},
	};

	const result = await listReviewStatusesInDrive(
		{ files: files as never },
		'root-folder-id',
	);

	assert.deepEqual(result.employees, [
		{
			employee: { id: 'ivan-folder-id', name: 'Ivan Petrov' },
			lastReview: {
				date: '2026-05-01',
				report: {
					id: 'ivan-report-id',
					name: 'Ivan Petrov // Отчёт Performance Review // 2026-05',
					webViewLink: 'https://docs.google.com/document/ivan-report-id',
				},
			},
		},
		{
			employee: { id: 'petr-folder-id', name: 'Petr Ivanov' },
			lastReview: null,
		},
	]);
	assert.ok(listCalls.some((call) => call.includes('root-page-2')));
	assert.equal(result.driveRequestCount, listCalls.length);
});

function paragraph(text: string) {
	return {
		paragraph: {
			elements: [{ textRun: { content: text } }],
		},
	};
}

function createFilesStub() {
	return {
		async get() {
			return {
				data: {
					mimeType: 'application/vnd.google-apps.folder',
				},
			};
		},
		async list() {
			return {
				data: {
					files: [
						{
							id: 'employee-folder-id',
							name: 'Ivan Petrov',
						},
					],
				},
			};
		},
		async create() {
			return {
				data: {
					id: 'month-folder-id',
					name: '2026.06',
					webViewLink: 'https://drive.google.com/month-folder',
				},
			};
		},
		async copy(params: { fileId: string; requestBody?: { name?: string } }) {
			const webViewLink =
				params.fileId === 'internal-form-template-id'
					? 'https://docs.google.com/forms/internal-form-id'
					: 'https://docs.google.com/document/report-id';
			return {
				data: {
					id:
						params.fileId === 'internal-form-template-id'
							? 'internal-form-id'
							: 'report-id',
					name: params.requestBody?.name,
					webViewLink,
				},
			};
		},
	};
}
