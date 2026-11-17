import { describe, expect, it } from 'vitest';
import { decideKind, formatPoints, symbols5, symbols3, gradesKind, pointsKind } from '../../src/core/kinds';
import type { AssessmentResultInput, GradeItem } from '../../src/core/types';

const res = (over: Partial<AssessmentResultInput>): AssessmentResultInput => ({ studentId: 's', symbol: null, score: null, grade: null, note: null, ...over });
const item = (graderaw: number | null, gradeformatted: string, grademax = 5): GradeItem => ({ userId: 1, assignmentId: 9, graderaw, gradeformatted, grademin: 0, grademax });
const assignment = (grade: number) => ({ id: 9, cmid: 1, name: 'A', grade, markingWorkflow: false });
const tertiary = { gradingType: 'TERTIARY', maxPoints: null, displayAsGrade: false };
const numeric = { gradingType: 'NUMERIC', maxPoints: 24, displayAsGrade: false };
const numericGrade = { ...numeric, displayAsGrade: true };

describe('symbols5', () => {
  it('maps the five symbols', () => {
    const idx = ['MINUS', 'MINUS_WELLE', 'WELLE', 'PLUS_WELLE', 'PLUS'].map((symbol) => symbols5.targetFor(res({ symbol })));
    expect(idx).toEqual([
      { value: 1, label: '--' }, { value: 2, label: '-' }, { value: 3, label: '~' }, { value: 4, label: '+' }, { value: 5, label: '++' },
    ]);
  });

  it('has no target for missing or unknown symbols and shows Grader symbols', () => {
    expect(symbols5.targetFor(res({}))).toBeNull();
    expect(symbols5.targetFor(res({ symbol: 'BANANA' }))).toBeNull();
    expect(symbols5.sourceText(res({ symbol: 'PLUS_WELLE' }))).toBe('+~');
    expect(symbols5.expectedLabel(9)).toBeNull();
    expect(symbols5.checksLabel).toBe(true);
    expect(symbols5.hint).toBeNull();
  });

  it('accepts a consistent scale and ignores the ungraded "-"', () => {
    expect(symbols5.verifyScale([item(null, '-'), item(1, '-- (mm)'), item(4, '+ (p)'), item(5, '++'), item(2, '-')]).ok).toBe(true);
    expect(symbols5.verifyScale([item(null, '-')]).ok).toBe(true);
  });

  it('blocks contradicting, out-of-scale, wrong-sized and unchecked scales', () => {
    const a = symbols5.verifyScale([item(3, '+')]);
    expect(!a.ok && a.error).toContain('Skala');
    expect(symbols5.verifyScale([item(7, '+')]).ok).toBe(false);
    const c = symbols5.verifyScale([item(null, '-', 4)]);
    expect(!c.ok && c.error).toContain('5');
    expect(symbols5.verifyScale([]).ok).toBe(false);
  });
});

describe('symbols3', () => {
  it('maps lossily: +~ to +, -~ to -', () => {
    const t = (symbol: string) => symbols3.targetFor(res({ symbol }));
    expect(t('PLUS')).toEqual({ value: 3, label: '+' });
    expect(t('PLUS_WELLE')).toEqual({ value: 3, label: '+' });
    expect(t('WELLE')).toEqual({ value: 2, label: '~' });
    expect(t('MINUS_WELLE')).toEqual({ value: 1, label: '-' });
    expect(t('MINUS')).toEqual({ value: 1, label: '-' });
    expect(t('X')).toBeNull();
    expect(symbols3.targetFor(res({}))).toBeNull();
  });

  it('carries a legend and checks the 3 labels', () => {
    expect(symbols3.hint).toContain('+~ → +');
    expect(symbols3.verifyScale([item(1, '- (m)', 3), item(2, '~ (w)', 3), item(3, '+ (p)', 3), item(null, '-', 3)]).ok).toBe(true);
    expect(symbols3.verifyScale([item(3, '~', 3)]).ok).toBe(false);
    expect(symbols3.verifyScale([item(null, '-', 5)]).ok).toBe(false);
    expect(symbols3.expectedLabel(3)).toBe('+');
  });
});

describe('grades', () => {
  it('sends index 6 - grade with the grade as label', () => {
    expect(gradesKind.targetFor(res({ grade: 1 }))).toEqual({ value: 5, label: '1' });
    expect(gradesKind.targetFor(res({ grade: 5 }))).toEqual({ value: 1, label: '5' });
    expect(gradesKind.targetFor(res({ grade: 3 }))).toEqual({ value: 3, label: '3' });
    expect(gradesKind.sourceText(res({ grade: 2 }))).toBe('2');
    expect(gradesKind.sourceText(res({}))).toBe('');
  });

  it('skips missing, undefined and invalid grades', () => {
    expect(gradesKind.targetFor(res({}))).toBeNull();
    expect(gradesKind.targetFor({ studentId: 's', symbol: null, score: null, note: null } as unknown as AssessmentResultInput)).toBeNull();
    expect(gradesKind.targetFor(res({ grade: 0 }))).toBeNull();
    expect(gradesKind.targetFor(res({ grade: 6 }))).toBeNull();
    expect(gradesKind.targetFor(res({ grade: 2.5 }))).toBeNull();
  });

  it('checks the grade labels and explains symbol-like scales', () => {
    expect(gradesKind.verifyScale([item(5, '1'), item(3, '3'), item(null, '-')]).ok).toBe(true);
    const bad = gradesKind.verifyScale([item(5, '++')]);
    expect(!bad.ok && bad.error).toContain('Diese Skala sieht nicht nach Noten 1–5 aus');
    expect(gradesKind.verifyScale([item(9, '1')]).ok).toBe(false);
    expect(gradesKind.verifyScale([item(null, '-', 3)]).ok).toBe(false);
    expect(gradesKind.verifyScale([]).ok).toBe(false);
    expect(gradesKind.expectedLabel(2)).toBe('4');
  });
});

describe('zero confirmation', () => {
  it('is required for points and grades only', () => {
    expect([symbols5, symbols3, gradesKind, pointsKind(24)].map((k) => k.confirmsZero)).toEqual([false, false, true, true]);
  });
});

describe('points', () => {
  const kind = pointsKind(24);
  it('sends the score and skips missing scores', () => {
    expect(kind.targetFor(res({ score: 17.5 }))).toEqual({ value: 17.5, label: '17,5' });
    expect(kind.targetFor(res({ score: 0 }))).toEqual({ value: 0, label: '0' });
    expect(kind.targetFor(res({}))).toBeNull();
    expect(kind.sourceText(res({ score: 3 }))).toBe('3');
    expect(kind.sourceText(res({}))).toBe('');
  });

  it('does not check labels and needs at least one grade item', () => {
    expect(kind.checksLabel).toBe(false);
    expect(kind.expectedLabel(12)).toBe('12');
    expect(kind.verifyScale([item(null, '-', 24)]).ok).toBe(true);
    expect(kind.verifyScale([]).ok).toBe(false);
  });

  it('formats points with a decimal comma', () => {
    expect(formatPoints(67)).toBe('67');
    expect(formatPoints(6.25)).toBe('6,25');
  });
});

describe('decideKind scale verification', () => {
  const unverified = (a: Parameters<typeof decideKind>[0], grade: number, items: GradeItem[]) => {
    const r = decideKind(a, assignment(grade), items);
    return r.ok ? r.value.unverified : 'refused';
  };

  it('flags a scale without any graded item as unverified, for every scale kind', () => {
    expect(unverified(tertiary, -7, [item(null, '-', 5)])).toBe(true);
    expect(unverified(tertiary, -3, [item(null, '-', 3)])).toBe(true);
    expect(unverified(numericGrade, -541, [item(null, '-', 5)])).toBe(true);
  });

  it('is verified as soon as one graded pair was checked', () => {
    expect(unverified(tertiary, -7, [item(null, '-', 5), item(5, '++')])).toBe(false);
    expect(unverified(tertiary, -3, [item(3, '+', 3)])).toBe(false);
    expect(unverified(numericGrade, -541, [item(5, '1')])).toBe(false);
  });

  it('never flags points', () => {
    expect(unverified(numeric, 24, [item(null, '-', 24)])).toBe(false);
  });
});

describe('decideKind', () => {
  it('chooses symbols by the item count of the scale', () => {
    const k5 = decideKind(tertiary, assignment(-7), [item(null, '-', 5)]);
    expect(k5.ok && k5.value.kind.id).toBe('symbols5');
    const k3 = decideKind(tertiary, assignment(-3), [item(null, '-', 3)]);
    expect(k3.ok && k3.value.kind.id).toBe('symbols3');
  });

  it('refuses symbols for other scale sizes, points, no grading and no grade items', () => {
    const k4 = decideKind(tertiary, assignment(-7), [item(null, '-', 4)]);
    expect(!k4.ok && k4.error).toContain('3 oder 5');
    const pts = decideKind(tertiary, assignment(100), [item(null, '-', 100)]);
    expect(!pts.ok && pts.error).toContain('Skala');
    const none = decideKind(tertiary, assignment(0), []);
    expect(!none.ok && none.error).toContain('keine Bewertung');
    const empty = decideKind(tertiary, assignment(-7), []);
    expect(!empty.ok && empty.error).toContain('keine Notenspalte');
  });

  it('reports a scale that contradicts the mapping', () => {
    expect(decideKind(tertiary, assignment(-7), [item(3, '+')]).ok).toBe(false);
  });

  it('chooses points when the maximum matches', () => {
    const k = decideKind(numeric, assignment(24), [item(null, '-', 24)]);
    expect(k.ok && k.value.kind.id).toBe('points');
    const g = decideKind(numericGrade, assignment(24), [item(null, '-', 24)]);
    expect(g.ok && g.value.kind.id).toBe('points');
  });

  it('refuses points with different maximum', () => {
    const k = decideKind(numeric, assignment(30), [item(null, '-', 30)]);
    expect(!k.ok && k.error).toBe('Höchstpunkte stimmen nicht überein: Grader 24, Moodle 30 – bitte die Aufgabe in Moodle anpassen.');
  });

  it('refuses points without grade items and numeric without maxPoints', () => {
    expect(decideKind(numeric, assignment(24), []).ok).toBe(false);
    expect(decideKind({ ...numeric, maxPoints: null }, assignment(24), [item(null, '-')]).ok).toBe(false);
  });

  it('chooses grades for displayAsGrade columns on 5-item scales', () => {
    const k = decideKind(numericGrade, assignment(-541), [item(null, '-', 5), item(5, '1')]);
    expect(k.ok && k.value.kind.id).toBe('grades');
  });

  it('refuses grades on other scales or labels, and scales for point columns', () => {
    const k3 = decideKind(numericGrade, assignment(-3), [item(null, '-', 3)]);
    expect(!k3.ok && k3.error).toContain('5 Stufen');
    const sym = decideKind(numericGrade, assignment(-7), [item(5, '++')]);
    expect(!sym.ok && sym.error).toContain('nicht nach Noten');
    const empty = decideKind(numericGrade, assignment(-7), []);
    expect(!empty.ok && empty.error).toContain('keine Notenspalte');
    const sc = decideKind(numeric, assignment(-7), [item(null, '-', 5)]);
    expect(!sc.ok && sc.error).toContain('Punkte');
    expect(decideKind(numeric, assignment(0), []).ok).toBe(false);
  });

  it('refuses unknown grading types', () => {
    expect(decideKind({ gradingType: 'X', maxPoints: null, displayAsGrade: false }, assignment(-7), []).ok).toBe(false);
  });
});
