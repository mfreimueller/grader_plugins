import { describe, expect, it } from 'vitest';
import { createGithubClient } from '../../src/core/github';
import { checkAssignment } from '../../src/core/classroomRun';
import { commit, fakeFetch, history, type GraphqlReply, type RecordedRequest } from './fakeGithub';

const students = [
  { id: 's1', firstName: 'Max', lastName: 'Mustermann', color: null },
  { id: 's2', firstName: 'Erika', lastName: 'Musterfrau', color: null },
  { id: 's3', firstName: 'Jan', lastName: 'Beispiel', color: null },
  { id: 's4', firstName: 'Eva', lastName: 'Probe', color: null },
];
const roster = ['max', 'erika', 'jan', 'eva'].map((username) => ({ username, firstName: '', lastName: '' }));

describe('checkAssignment', () => {
  it('finds missing and empty repositories, reads the others only up to the deadline', async () => {
    const due = new Date('2026-10-19T05:59:00Z');
    const history$: RecordedRequest[] = [];
    const handler = (request: RecordedRequest): GraphqlReply => {
      if (request.query.includes('isEmpty')) {
        const data: Record<string, unknown> = {};
        Object.entries(request.variables).forEach(([key, value]) => {
          if (!key.startsWith('n')) return;
          const name = String(value);
          data[`r${key.slice(1)}`] =
            name.endsWith('-erika') ? null : name.endsWith('-jan') ? { name, isEmpty: true } : { name, isEmpty: false };
        });
        return { data };
      }
      history$.push(request);
      const nodes = request.variables.name === 'k-01-app-max' ? [commit('a', 40, 10)] : [commit('b', 3, 0)];
      return { data: { repository: { refs: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ name: 'main', target: { history: history(nodes) } }] } } } };
    };
    const { fetch, requests } = fakeFetch(handler);
    const result = await checkAssignment(
      createGithubClient({ token: 't', fetch }),
      'Beispiel-Schule',
      {
        shortName: 'k',
        slug: '01-app',
        roster,
        mapping: { max: 's1', erika: 's2', jan: 's3', eva: 's4' },
        students,
        minimumCommitSize: 50,
      },
      { from: new Date('2026-10-08T09:00:00Z'), to: due },
    );
    expect(result.rows.map((r) => [r.username, r.status, r.symbol])).toEqual([
      ['max', 'graded', 'PLUS'],
      ['erika', 'no-repo', 'MINUS'],
      ['jan', 'empty', 'MINUS'],
      ['eva', 'graded', 'MINUS'],
    ]);
    expect(history$.map((r) => r.variables.name)).toEqual(['k-01-app-max', 'k-01-app-eva']);
    expect(history$.every((r) => r.variables.until === due.toISOString())).toBe(true);
    expect(requests.some((r) => r.variables.name === 'k-01-app-jan')).toBe(false);
  });
});
