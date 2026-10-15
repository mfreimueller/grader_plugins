import { describe, expect, it } from 'vitest';
import type { GraderPluginApi, SessionTarget } from '../../src/window';
import { enterAssignment, undoAssignment, type EnterRequest } from '../../src/core/classroomAssess';
import { alreadyEntered, parseAssignmentRuns, parseGithubUsers, type AssignmentRuns } from '../../src/core/classroomStore';

function fakeGrader(options: { failDelete?: string[] } = {}) {
  const created: { studentId: string; symbol?: string; title?: string; session?: SessionTarget }[] = [];
  const deleted: string[] = [];
  let counter = 0;
  const grader = {
    assessment: {
      createImpromptu: async (request: { studentId: string; symbol?: string; title?: string; session?: SessionTarget }) => {
        created.push(request);
        return { ok: true, value: { assessmentId: `new${++counter}`, performanceId: 'p', sessionId: 's' } };
      },
      deleteImpromptu: async (id: string) => {
        if (options.failDelete?.includes(id)) return { ok: false, error: { code: 'INTERNAL', message: 'nein' } };
        deleted.push(id);
        return { ok: true, value: undefined };
      },
    },
  } as unknown as GraderPluginApi;
  return { grader, created, deleted };
}

const request = (overrides: Partial<EnterRequest> = {}): EnterRequest => ({
  slug: '01-app',
  title: '01-App',
  grades: [
    { studentId: 's1', symbol: 'PLUS', repo: 'r1' },
    { studentId: 's2', symbol: 'MINUS', repo: 'r2' },
  ],
  categoryId: 'cat',
  session: { kind: 'date', date: '2026-10-19' },
  from: new Date('2026-10-08T09:00:00Z'),
  to: new Date('2026-10-19T05:59:00Z'),
  confirmedReentry: false,
  ...overrides,
});

describe('enterAssignment', () => {
  it('enters one assessment per student titled with the assignment and records the ids by slug', async () => {
    const { grader, created } = fakeGrader();
    const saved: AssignmentRuns[] = [];
    const outcome = await enterAssignment(grader, {}, request(), async (r) => void saved.push(r));
    expect(created.map((c) => [c.studentId, c.symbol, c.title])).toEqual([['s1', 'PLUS', '01-App'], ['s2', 'MINUS', '01-App']]);
    expect(created[0]?.session).toEqual({ kind: 'date', date: '2026-10-19' });
    expect(outcome.status === 'entered' && outcome.runs['01-app']).toEqual({
      from: '2026-10-08T09:00:00.000Z',
      to: '2026-10-19T05:59:00.000Z',
      assessmentIds: ['new1', 'new2'],
    });
    expect(saved).toHaveLength(1);
  });

  it('asks for confirmation when the assignment was entered already and writes nothing', async () => {
    const { grader, created, deleted } = fakeGrader();
    const runs: AssignmentRuns = { '01-app': { from: 'a', to: 'b', assessmentIds: ['old1'] } };
    const outcome = await enterAssignment(grader, runs, request(), async () => undefined);
    expect(outcome).toEqual({ status: 'needs-confirmation' });
    expect(created).toEqual([]);
    expect(deleted).toEqual([]);
  });

  it('replaces the earlier assessments after confirmation', async () => {
    const { grader, created, deleted } = fakeGrader();
    const runs: AssignmentRuns = { '01-app': { from: 'a', to: 'b', assessmentIds: ['old1'] }, other: { from: 'a', to: 'b', assessmentIds: ['x'] } };
    const outcome = await enterAssignment(grader, runs, request({ confirmedReentry: true }), async () => undefined);
    expect(deleted).toEqual(['old1']);
    expect(created).toHaveLength(2);
    expect(outcome.status === 'entered' && outcome.runs['01-app']?.assessmentIds).toEqual(['new1', 'new2']);
    expect(outcome.status === 'entered' && outcome.runs.other).toBeDefined();
  });

  it('keeps ids that could not be deleted so they can be undone later', async () => {
    const { grader } = fakeGrader({ failDelete: ['old1'] });
    const runs: AssignmentRuns = { '01-app': { from: 'a', to: 'b', assessmentIds: ['old1'] } };
    const outcome = await enterAssignment(grader, runs, request({ confirmedReentry: true }), async () => undefined);
    expect(outcome.status === 'entered' && outcome.notDeleted).toBe(1);
    expect(outcome.status === 'entered' && outcome.runs['01-app']?.assessmentIds).toEqual(['old1', 'new1', 'new2']);
  });
});

describe('undoAssignment', () => {
  it('deletes the assessments of that assignment only and forgets the record', async () => {
    const { grader, deleted } = fakeGrader();
    const runs: AssignmentRuns = { '01-app': { from: 'a', to: 'b', assessmentIds: ['a1', 'a2'] }, '02-b': { from: 'a', to: 'b', assessmentIds: ['b1'] } };
    const result = await undoAssignment(grader, runs, '01-app', async () => undefined);
    expect(deleted).toEqual(['a1', 'a2']);
    expect(Object.keys(result.runs)).toEqual(['02-b']);
    expect(result.notDeleted).toBe(0);
  });

  it('keeps the record of what could not be deleted', async () => {
    const { grader } = fakeGrader({ failDelete: ['a2'] });
    const runs: AssignmentRuns = { '01-app': { from: 'a', to: 'b', assessmentIds: ['a1', 'a2'] } };
    const result = await undoAssignment(grader, runs, '01-app', async () => undefined);
    expect(result.runs['01-app']?.assessmentIds).toEqual(['a2']);
    expect(result.notDeleted).toBe(1);
  });
});

describe('classroom storage parsing', () => {
  it('knows whether an assignment was entered', () => {
    const runs = parseAssignmentRuns({ a: { from: 'x', to: 'y', assessmentIds: ['1'] }, b: { from: 'x', to: 'y', assessmentIds: [] }, c: 'junk' });
    expect(alreadyEntered(runs, 'a')).toBe(true);
    expect(alreadyEntered(runs, 'b')).toBe(false);
    expect(alreadyEntered(runs, 'c')).toBe(false);
  });

  it('keeps string ids in the username map only', () => {
    expect(parseGithubUsers({ max: 's1', bad: 3, empty: '' })).toEqual({ max: 's1' });
    expect(parseGithubUsers(null)).toEqual({});
  });
});
