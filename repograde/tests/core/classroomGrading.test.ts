import { describe, expect, it } from 'vitest';
import { gradeClassroom, reposToLookUp, reposToRead, type ClassroomGradingInput } from '../../src/core/classroomGrading';
import type { RepoPresence } from '../../src/core/classroomRemote';
import type { PluginStudent } from '../../src/window';

const student = (id: string, firstName: string, lastName: string): PluginStudent => ({ id, firstName, lastName, color: null });
const present = (name: string, isEmpty = false): RepoPresence => ({ exists: true, name, isEmpty });

const base = (overrides: Partial<ClassroomGradingInput> = {}): ClassroomGradingInput => ({
  shortName: 'k',
  slug: '01-app',
  roster: [
    { username: 'max', firstName: 'Max', lastName: 'Mustermann' },
    { username: 'erika', firstName: 'Erika', lastName: 'Musterfrau' },
    { username: 'ida', firstName: 'Ida', lastName: 'Fremd' },
  ],
  mapping: { max: 's1', erika: 's2' },
  students: [student('s1', 'Max', 'Mustermann'), student('s2', 'Erika', 'Musterfrau'), student('s3', 'Karl', 'Anders')],
  presence: new Map(),
  outcomes: [],
  minimumCommitSize: 50,
  ...overrides,
});

describe('reposToLookUp', () => {
  it('builds one exact name per mapped roster student', () => {
    expect(reposToLookUp(base())).toEqual(['k-01-app-max', 'k-01-app-erika']);
  });

  it('does not mix up slugs where one starts with the other', () => {
    const names = reposToLookUp(base({ slug: '01-app', roster: [{ username: 'max', firstName: '', lastName: '' }] }));
    const other = reposToLookUp(base({ slug: '01-app-v2', roster: [{ username: 'max', firstName: '', lastName: '' }] }));
    expect(names).toEqual(['k-01-app-max']);
    expect(other).toEqual(['k-01-app-v2-max']);
  });
});

describe('reposToRead', () => {
  it('skips repositories that do not exist or are empty', () => {
    const presence = new Map<string, RepoPresence>([
      ['k-01-app-max', present('k-01-app-max')],
      ['k-01-app-erika', present('k-01-app-erika', true)],
    ]);
    expect(reposToRead(base({ presence }))).toEqual(['k-01-app-max']);
  });
});

describe('gradeClassroom', () => {
  const presence = new Map<string, RepoPresence>([
    ['k-01-app-max', present('k-01-app-max')],
    ['k-01-app-erika', { exists: false }],
  ]);

  it('gives PLUS for a repository that reaches the minimum and FAIL below it', () => {
    const result = gradeClassroom(base({ presence, outcomes: [{ repo: 'k-01-app-max', added: 30, removed: 20, error: null }] }));
    expect(result.rows[0]).toMatchObject({ studentName: 'Max Mustermann', status: 'graded', total: 50, passes: true, symbol: 'PLUS' });
    const below = gradeClassroom(base({ presence, outcomes: [{ repo: 'k-01-app-max', added: 10, removed: 5, error: null }] }));
    expect(below.rows[0]).toMatchObject({ passes: false, symbol: 'MINUS' });
  });

  it('gives MINUS to a student who never accepted the assignment', () => {
    const result = gradeClassroom(base({ presence, outcomes: [{ repo: 'k-01-app-max', added: 90, removed: 0, error: null }] }));
    expect(result.rows[1]).toMatchObject({ username: 'erika', status: 'no-repo', symbol: 'MINUS', total: 0, passes: null });
    expect(result.grades).toEqual([
      { studentId: 's1', symbol: 'PLUS', repo: 'k-01-app-max' },
      { studentId: 's2', symbol: 'MINUS', repo: 'k-01-app-erika' },
    ]);
  });

  it('gives MINUS for an empty repository', () => {
    const result = gradeClassroom(base({ presence: new Map([['k-01-app-max', present('k-01-app-max', true)], ['k-01-app-erika', { exists: false }]]) }));
    expect(result.rows[0]).toMatchObject({ status: 'empty', symbol: 'MINUS' });
  });

  it('skips a repository that could not be read and lists it', () => {
    const result = gradeClassroom(base({ presence, outcomes: [{ repo: 'k-01-app-max', added: 0, removed: 0, error: 'Netzwerk' }] }));
    expect(result.rows[0]).toMatchObject({ status: 'error', symbol: null, error: 'Netzwerk' });
    expect(result.grades.map((g) => g.studentId)).toEqual(['s2']);
    expect(result.erroredRepos).toEqual(['k-01-app-max']);
  });

  it('counts commits as the caller read them: post-deadline commits are not in the totals', () => {
    // The range ends at the deadline, so the query that produced `outcomes` never saw later commits.
    const result = gradeClassroom(base({ presence, outcomes: [{ repo: 'k-01-app-max', added: 10, removed: 0, error: null }] }));
    expect(result.rows[0]?.passes).toBe(false);
  });

  it('lists roster students without a mapping and course students without a user', () => {
    const result = gradeClassroom(base({ presence }));
    expect(result.unmappedUsers.map((u) => u.username)).toEqual(['ida']);
    expect(result.studentsWithoutUser.map((s) => s.id)).toEqual(['s3']);
    expect(result.rows.map((r) => r.username)).toEqual(['max', 'erika']);
  });
});
