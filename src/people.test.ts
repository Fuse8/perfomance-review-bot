import assert from 'node:assert/strict';
import { test } from 'vitest';
import { searchDirectoryEmployeesInPeople } from './people.js';

test('searchDirectoryEmployeesInPeople maps directory people to employee suggestions', async () => {
	const calls: Array<Record<string, unknown>> = [];
	const people = {
		async searchDirectoryPeople(params: Record<string, unknown>) {
			calls.push(params);
			return {
				data: {
					people: [
						{
							resourceName: 'people/c123',
							names: [{ displayName: 'Ivan Petrov' }],
							emailAddresses: [{ value: 'ivan.petrov@fuse8.online' }],
						},
						{
							resourceName: 'people/c456',
							names: [{ displayName: 'No Email' }],
						},
						{
							resourceName: 'people/c789',
							emailAddresses: [{ value: 'no.name@fuse8.online' }],
						},
					],
				},
			};
		},
	};

	const employees = await searchDirectoryEmployeesInPeople(people, 'ivan');

	assert.deepEqual(calls, [
		{
			query: 'ivan',
			readMask: 'names,emailAddresses,metadata',
			sources: [
				'DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE',
				'DIRECTORY_SOURCE_TYPE_DOMAIN_CONTACT',
			],
			pageSize: 20,
		},
	]);
	assert.deepEqual(employees, [
		{
			fullName: 'Ivan Petrov',
			email: 'ivan.petrov@fuse8.online',
			resourceName: 'people/c123',
		},
	]);
});
