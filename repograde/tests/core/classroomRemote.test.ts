import { describe, expect, it } from 'vitest';
import { createGithubClient } from '../../src/core/github';
import { discoverClassrooms, loadClassroomData, lookupRepos, StateRepoError } from '../../src/core/classroomRemote';
import { fakeFetch, type GraphqlReply, type RecordedRequest } from './fakeGithub';
import { assignmentsJson, classroomJson, rosterCsv } from './classroomFixtures';

const OWNER = 'Beispiel-Schule';

/** A state repository with these files; `HEAD:` lists the top-level directories. */
const stateRepo = (files: Record<string, string>, dirs: string[]) => (request: RecordedRequest): GraphqlReply => {
  if (request.query.includes('entries')) {
    return { data: { repository: { object: { entries: [...dirs.map((name) => ({ name, type: 'tree' })), { name: 'README.md', type: 'blob' }] } } } };
  }
  const repository: Record<string, unknown> = {};
  Object.entries(request.variables).forEach(([key, value]) => {
    if (key.startsWith('e')) {
      const text = files[String(value).replace('HEAD:', '')];
      repository[`f${key.slice(1)}`] = text === undefined ? null : { text };
    }
  });
  return { data: { repository } };
};

const clientFor = (handler: (r: RecordedRequest) => GraphqlReply) => {
  const { fetch, requests } = fakeFetch(handler);
  return { client: createGithubClient({ token: 'secret-token', fetch }), requests };
};

describe('discoverClassrooms', () => {
  it('finds every directory with a classroom.json and skips the one without', async () => {
    const { client } = clientFor(
      stateRepo({ 'a/classroom.json': classroomJson('klasse-a'), 'b/classroom.json': classroomJson('klasse-b') }, ['a', 'b', 'docs']),
    );
    const { classrooms, problems } = await discoverClassrooms(client, OWNER, 'classroom50');
    expect(classrooms.map((c) => [c.dir, c.shortName])).toEqual([['a', 'klasse-a'], ['b', 'klasse-b']]);
    expect(problems).toEqual([]);
  });

  it('reports a classroom.json with an unknown schema as a problem instead of failing', async () => {
    const bad = classroomJson('x', { schema: 'classroom50/classroom/v7' });
    const { client } = clientFor(stateRepo({ 'a/classroom.json': classroomJson('klasse-a'), 'b/classroom.json': bad }, ['a', 'b']));
    const { classrooms, problems } = await discoverClassrooms(client, OWNER, 'classroom50');
    expect(classrooms).toHaveLength(1);
    expect(problems[0]).toMatch(/b\/classroom\.json/);
  });

  it('never sends the token anywhere but the Authorization header', async () => {
    const { client, requests } = clientFor(stateRepo({}, []));
    await discoverClassrooms(client, OWNER, 'classroom50');
    expect(JSON.stringify(requests.map((r) => [r.query, r.variables]))).not.toContain('secret-token');
  });

  it('explains a state repository that cannot be found', async () => {
    const { client } = clientFor(() => ({ data: { repository: null }, errors: [{ type: 'NOT_FOUND', message: 'Could not resolve' }] } as unknown as GraphqlReply));
    await expect(discoverClassrooms(client, OWNER, 'classroom50')).rejects.toThrow(StateRepoError);
    await expect(discoverClassrooms(client, OWNER, 'classroom50')).rejects.toThrow(/Contents \+ Metadata/);
  });

  it('explains HTTP 403 and 404 on the state repository', async () => {
    for (const status of [403, 404]) {
      const { client } = clientFor(() => ({ status }));
      await expect(discoverClassrooms(client, OWNER, 'classroom50')).rejects.toThrow(StateRepoError);
    }
  });

  it('does not hide a refused token behind the state repository message', async () => {
    const { client } = clientFor(() => ({ status: 401 }));
    await expect(discoverClassrooms(client, OWNER, 'classroom50')).rejects.toThrow(/Token/);
  });
});

describe('loadClassroomData', () => {
  const files = {
    'k/classroom.json': classroomJson('klasse-a'),
    'k/assignments.json': assignmentsJson(),
    'k/roster.csv': rosterCsv(),
  };

  it('reads the classroom, its assignments and its students', async () => {
    const { client } = clientFor(stateRepo(files, ['k']));
    const data = await loadClassroomData(client, OWNER, 'classroom50', 'k');
    expect(data.classroom.shortName).toBe('klasse-a');
    expect(data.assignments).toHaveLength(4);
    expect(data.roster).toHaveLength(3);
  });

  it('names the missing file', async () => {
    const { 'k/assignments.json': _drop, ...rest } = files;
    const { client } = clientFor(stateRepo(rest, ['k']));
    await expect(loadClassroomData(client, OWNER, 'classroom50', 'k')).rejects.toThrow(/k\/assignments\.json fehlt/);
  });
});

describe('lookupRepos', () => {
  it('looks every repository up by its exact name, in chunks, and tells missing from empty', async () => {
    const names = Array.from({ length: 45 }, (_, i) => `k-a-user${i}`);
    const { client, requests } = clientFor((request) => {
      const data: Record<string, unknown> = {};
      Object.entries(request.variables).forEach(([key, value]) => {
        if (!key.startsWith('n')) return;
        const name = String(value);
        data[`r${key.slice(1)}`] = name === 'k-a-user1' ? { name, isEmpty: true } : name === 'k-a-user2' ? null : { name, isEmpty: false };
      });
      return { data };
    });
    const result = await lookupRepos(client, OWNER, names);
    expect(requests).toHaveLength(3);
    expect(result.get('k-a-user0')).toEqual({ exists: true, name: 'k-a-user0', isEmpty: false });
    expect(result.get('k-a-user1')).toEqual({ exists: true, name: 'k-a-user1', isEmpty: true });
    expect(result.get('k-a-user2')).toEqual({ exists: false });
    expect(result.size).toBe(45);
    expect(requests.every((r) => !r.query.includes('repositoryOwner'))).toBe(true);
  });

  it('tolerates NOT_FOUND errors next to the data', async () => {
    const { client } = clientFor(() => ({ data: { r0: null }, errors: [{ type: 'NOT_FOUND', message: 'x' }] } as unknown as GraphqlReply));
    expect((await lookupRepos(client, OWNER, ['k-a-nobody'])).get('k-a-nobody')).toEqual({ exists: false });
  });

  it('still fails on other GraphQL errors', async () => {
    const { client } = clientFor(() => ({ errors: [{ message: 'kaputt' }] }));
    await expect(lookupRepos(client, OWNER, ['x'])).rejects.toThrow(/kaputt/);
  });
});
