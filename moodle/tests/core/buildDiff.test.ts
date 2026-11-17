import { describe, expect, it } from 'vitest';
import type { AssessmentResultInput } from '../../src/core/types';
import { buildDiff, pendingConfirmations, rowsToSend } from '../../src/core/buildDiff';
import { gradesKind, pointsKind, symbols3, symbols5 } from '../../src/core/kinds';

const s = (id: string) => ({ id, firstName: id, lastName: 'X' });
const item = (userId: number, graderaw: number | null, gradeformatted = '-') => ({
  userId, assignmentId: 9, graderaw, gradeformatted, grademin: 0, grademax: 5,
});
const r = (studentId: string, symbol: string | null, note: string | null = null) => ({ studentId, symbol, score: null, grade: null, note });

describe('buildDiff', () => {
  const students = [s('new'), s('chg'), s('same'), s('sameNote'), s('skip'), s('nores'), s('un'), s('weird')];
  const results = [
    r('new', 'PLUS'), r('chg', 'MINUS', '  gut\nweiter  '), r('same', 'WELLE'), r('sameNote', 'WELLE', 'Notiz'),
    r('skip', null, 'ignored'), r('un', 'PLUS'), r('weird', 'BANANA'),
  ];
  const mapping = { new: 1, chg: 2, same: 3, sameNote: 4, skip: 5, nores: 6, weird: 8 };
  const current = [item(1, null), item(2, 4, '+ (p)'), item(3, 3, '~'), item(4, 3, '~'), item(8, null)];
  const rows = buildDiff({ kind: symbols5, students, results, mapping, current });
  const byId = (id: string) => rows.find((x) => x.graderStudent.id === id);

  it('has one row per course student', () => {
    expect(rows).toHaveLength(8);
  });

  it('marks ungraded Moodle entries as new, even when the label looks like a grade', () => {
    expect(byId('new')).toMatchObject({ status: 'new', moodleUserId: 1, targetValue: 5, targetLabel: '++', currentValue: null, currentLabel: null });
  });

  it('marks different grades as changed and trims notes', () => {
    expect(byId('chg')).toMatchObject({ status: 'changed', targetValue: 1, currentValue: 4, currentLabel: '+', note: 'gut\nweiter' });
  });

  it('marks equal grades as same', () => {
    expect(byId('same')).toMatchObject({ status: 'same', note: null });
  });

  it('skips students without a usable symbol and never clears', () => {
    expect(byId('skip')).toMatchObject({ status: 'skipped', targetValue: null, note: 'ignored' });
    expect(byId('nores')).toMatchObject({ status: 'skipped', sourceText: '', note: null });
    expect(byId('weird')).toMatchObject({ status: 'skipped', sourceText: 'BANANA' });
  });

  it('marks students without a Moodle user as unmatched', () => {
    expect(byId('un')).toMatchObject({ status: 'unmatched', moodleUserId: null, targetValue: 5 });
  });

  it('treats a Moodle student without a grade item as new and an out-of-scale grade as unlabeled', () => {
    const out = buildDiff({ kind: symbols5, students: [s('a'), s('b')], results: [r('a', 'PLUS'), r('b', 'PLUS')], mapping: { a: 1, b: 2 }, current: [item(2, 9, '?')] });
    expect(out[0]).toMatchObject({ status: 'new' });
    expect(out[1]).toMatchObject({ status: 'changed', currentValue: 9, currentLabel: null });
  });

  it('compares points numerically and shows them with a decimal comma', () => {
    const p = (studentId: string, score: number | null) => ({ studentId, symbol: null, score, grade: null, note: null });
    const out = buildDiff({
      kind: pointsKind(24), students: [s('a'), s('b'), s('c'), s('d')], results: [p('a', 12.5), p('b', 12.5), p('c', 3), p('d', null)],
      mapping: { a: 1, b: 2, c: 3, d: 4 }, current: [item(1, 12.5, '12,50'), item(2, 12, '12,00')],
    });
    expect(out.map((x) => x.status)).toEqual(['same', 'changed', 'new', 'skipped']);
    expect(out[1]).toMatchObject({ targetValue: 12.5, targetLabel: '12,5', currentLabel: '12', sourceText: '12,5' });
  });

  it('maps grades to indices and 3-item symbols lossily', () => {
    const g = buildDiff({ kind: gradesKind, students: [s('a')], results: [{ studentId: 'a', symbol: null, score: 20, grade: 2, note: null }], mapping: { a: 1 }, current: [item(1, 3, '3')] });
    expect(g[0]).toMatchObject({ status: 'changed', targetValue: 4, targetLabel: '2', currentLabel: '3', sourceText: '2' });
    const t = buildDiff({ kind: symbols3, students: [s('a')], results: [r('a', 'PLUS_WELLE')], mapping: { a: 1 }, current: [] });
    expect(t[0]).toMatchObject({ targetValue: 3, targetLabel: '+', sourceText: '+~' });
  });

  it('treats a blank note as no note', () => {
    const out = buildDiff({ kind: symbols5, students: [s('a')], results: [r('a', 'PLUS', '   ')], mapping: { a: 1 }, current: [] });
    expect(out[0]?.note).toBeNull();
  });
});

describe('rowsToSend', () => {
  it('sends new and changed rows and same rows only with a note', () => {
    const students = [s('n'), s('c'), s('s'), s('sn'), s('u')];
    const results = [r('n', 'PLUS'), r('c', 'PLUS'), r('s', 'WELLE'), r('sn', 'WELLE', 'x'), r('u', 'PLUS')];
    const mapping = { n: 1, c: 2, s: 3, sn: 4 };
    const current = [item(2, 1), item(3, 3), item(4, 3)];
    const rows = buildDiff({ kind: symbols5, students, results, mapping, current });
    expect(rowsToSend(rows, new Set()).map((x) => x.graderStudent.id)).toEqual(['n', 'c', 'sn']);
  });
});

describe('zero points', () => {
  const res0 = (studentId: string, score: number | null, grade: number | null) => ({ studentId, symbol: null, score, grade, note: null });
  const students = [s('z'), s('p'), s('un'), s('same')];
  const mapping = { z: 1, p: 2, same: 4 };
  const build = (kind: typeof pointsKind extends (n: number) => infer K ? K : never, results: AssessmentResultInput[]) =>
    buildDiff({ kind, students, results, mapping, current: [item(4, 0, '0,00')] });

  it('marks rows with score 0 for points', () => {
    const rows = build(pointsKind(24), [res0('z', 0, null), res0('p', 3, null), res0('un', 0, null), res0('same', 0, null)]);
    expect(rows.map((x) => x.needsConfirmation)).toEqual(['zeroPoints', null, null, null]);
  });

  it('marks rows with score 0 for grades (detected on the score, not the grade)', () => {
    const rows = build(gradesKind, [res0('z', 0, 5), res0('p', 3, 5)]);
    expect(rows.map((x) => x.needsConfirmation)).toEqual(['zeroPoints', null, null, null]);
    expect(rows[0]).toMatchObject({ targetValue: 1, targetLabel: '5' });
  });

  it('does not mark symbol rows', () => {
    const rows = build(symbols5, [{ studentId: 'z', symbol: 'PLUS', score: 0, grade: null, note: null }]);
    expect(rows[0]?.needsConfirmation).toBeNull();
  });

  it('sends zero rows only when confirmed', () => {
    const rows = build(pointsKind(24), [res0('z', 0, null), res0('p', 3, null)]);
    expect(rowsToSend(rows, new Set()).map((x) => x.graderStudent.id)).toEqual(['p']);
    expect(rowsToSend(rows, new Set(['z'])).map((x) => x.graderStudent.id)).toEqual(['z', 'p']);
    expect(pendingConfirmations(rows, new Set())).toBe(1);
    expect(pendingConfirmations(rows, new Set(['z']))).toBe(0);
  });
});
