import { google } from 'googleapis';
import type { AppConfig } from './config.js';
import { createOAuthClient } from './oauth.js';

export type DirectoryEmployee = {
	fullName: string;
	email: string;
	resourceName: string;
};

type DirectoryPerson = {
	resourceName?: string | null;
	names?: Array<{
		displayName?: string | null;
	}> | null;
	emailAddresses?: Array<{
		value?: string | null;
	}> | null;
};

type PeopleDirectoryResource = {
	searchDirectoryPeople(params: {
		query: string;
		readMask: string;
		sources: string[];
		pageSize: number;
	}): Promise<{
		data: {
			people?: DirectoryPerson[] | null;
		};
	}>;
};

const DIRECTORY_READ_MASK = 'names,emailAddresses,metadata';
const DIRECTORY_SOURCES = [
	'DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE',
	'DIRECTORY_SOURCE_TYPE_DOMAIN_CONTACT',
];

export async function searchDirectoryEmployees(
	config: AppConfig,
	refreshToken: string,
	query: string,
): Promise<DirectoryEmployee[]> {
	const auth = createOAuthClient(config);
	auth.setCredentials({ refresh_token: refreshToken });

	const people = google.people({ version: 'v1', auth });

	return searchDirectoryEmployeesInPeople(people.people, query);
}

export async function searchDirectoryEmployeesInPeople(
	people: PeopleDirectoryResource,
	query: string,
): Promise<DirectoryEmployee[]> {
	const { data } = await people.searchDirectoryPeople({
		query,
		readMask: DIRECTORY_READ_MASK,
		sources: DIRECTORY_SOURCES,
		pageSize: 20,
	});

	return (data.people ?? [])
		.map(mapDirectoryPerson)
		.filter((employee): employee is DirectoryEmployee => employee !== null);
}

function mapDirectoryPerson(person: DirectoryPerson): DirectoryEmployee | null {
	const fullName = person.names?.[0]?.displayName?.trim() ?? '';
	const email = person.emailAddresses?.[0]?.value?.trim().toLowerCase() ?? '';

	if (!fullName || !email) {
		return null;
	}

	return {
		fullName,
		email,
		resourceName: person.resourceName ?? '',
	};
}
