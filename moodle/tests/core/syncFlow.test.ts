import { describe, expect, it } from 'vitest';
import { prepareSync, runSync } from '../../src/core/syncFlow';
import { createMoodleClient } from '../../src/core/moodleClient';
import { buildDiff, rowsToSend } from '../../src/core/buildDiff';
import { symbols5 } from '../../src/core/kinds';
import { fakeFetch } from './fakeMoodle';

const gradeItems = (items: unknown[]) => ({ usergrades: [{ userid: 1, gradeitems: items }] });
const assignItem = (graderaw: number | null, gradeformatted: string, grademax = 5) =>
  ({ itemmodule: 'assign', iteminstance: 9, graderaw, gradeformatted, grademin: 0, grademax });

function clientFor(answers: Record<string, unknown>) {
  const { fetch, calls } = fakeFetch((c) => {
    const fn = c.body.get('wsfunction') ?? '';
    return fn in answers ? answers[fn] : new Error('unexpected');
  });
  return { client: createMoodleClient({ baseUrl: 'https://m', token: 't', fetch }), calls };
}

const assignment = { id: 9, cmid: 1, name: 'A', grade: -7, markingWorkflow: false };
const tertiary = { gradingType: 'TERTIARY', maxPoints: null, displayAsGrade: false };
const students = [{ id: 1, firstname: 'A', lastname: 'B', roles: [{ shortname: 'student' }] }];

describe('prepareSync', () => {
  it('returns students and the grade items of the assignment', async () => {
    const { client } = clientFor({
      core_enrol_get_enrolled_users: students,
      gradereport_user_get_grade_items: gradeItems([assignItem(4, '+ (p)'), { ...assignItem(null, '-'), iteminstance: 77 }]),
    });
    const result = await prepareSync(client, 12706, assignment, tertiary);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.moodleStudents).toHaveLength(1);
      expect(result.value.items).toHaveLength(1);
      expect(result.value.kind.ok && result.value.kind.value.kind.id).toBe('symbols5');
    }
  });

  it('reports a scale problem without failing', async () => {
    const { client } = clientFor({ core_enrol_get_enrolled_users: students, gradereport_user_get_grade_items: gradeItems([assignItem(3, '+')]) });
    const result = await prepareSync(client, 1, assignment, tertiary);
    expect(result.ok && result.value.kind.ok).toBe(false);
  });

  it('fails when a request fails', async () => {
    const a = await prepareSync(clientFor({}).client, 1, assignment, tertiary);
    expect(a.ok).toBe(false);
    const b = await prepareSync(clientFor({ core_enrol_get_enrolled_users: students }).client, 1, assignment, tertiary);
    expect(b.ok).toBe(false);
  });
});

describe('runSync', () => {
  const rows = rowsToSend(buildDiff({
    kind: symbols5,
    students: [{ id: 'g', firstName: 'A', lastName: 'B' }],
    results: [{ studentId: 'g', symbol: 'PLUS', score: null, grade: null, note: 'ok' }],
    mapping: { g: 1 },
    current: [],
  }), new Set());

  it('saves, reads back and verifies', async () => {
    const { client, calls } = clientFor({ mod_assign_save_grades: null, gradereport_user_get_grade_items: gradeItems([assignItem(5, '++')]) });
    const result = await runSync(client, 1, 9, symbols5, rows);
    expect(result).toEqual({ ok: true, value: { ok: true, checked: 1, mismatches: [], scaleMessage: null } });
    expect(calls.map((c) => c.body.get('wsfunction'))).toEqual(['mod_assign_save_grades', 'gradereport_user_get_grade_items']);
    expect(calls[0]?.body.get('assignmentid')).toBe('9');
  });

  it('reports mismatches', async () => {
    const { client } = clientFor({ mod_assign_save_grades: null, gradereport_user_get_grade_items: gradeItems([assignItem(4, '+')]) });
    const result = await runSync(client, 1, 9, symbols5, rows);
    expect(result.ok && !result.value.ok).toBe(true);
  });

  it('fails when saving or reading back fails', async () => {
    expect((await runSync(clientFor({}).client, 1, 9, symbols5, rows)).ok).toBe(false);
    expect((await runSync(clientFor({ mod_assign_save_grades: null }).client, 1, 9, symbols5, rows)).ok).toBe(false);
  });
});
