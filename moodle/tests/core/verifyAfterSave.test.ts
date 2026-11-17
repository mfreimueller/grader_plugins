import { describe, expect, it } from 'vitest';
import { verifyAfterSave } from '../../src/core/verifyAfterSave';
import { gradesKind, pointsKind, symbols5 } from '../../src/core/kinds';
import type { SendRow } from '../../src/core/buildDiff';

const row = (userId: number, targetValue: number, targetLabel: string | null): SendRow => ({
  graderStudent: { id: `g${userId}`, firstName: 'A', lastName: 'B' }, moodleUserId: userId, sourceText: '+', targetValue, targetLabel,
  currentValue: null, currentLabel: null, note: null, status: 'new', needsConfirmation: null,
});
const item = (userId: number, graderaw: number | null, gradeformatted: string) => ({ userId, assignmentId: 1, graderaw, gradeformatted, grademin: 0, grademax: 5 });

describe('verifyAfterSave', () => {
  it('reports ok when index and label match, ignoring a label suffix', () => {
    expect(verifyAfterSave(symbols5, [row(1, 5, '++'), row(2, 4, '+')], [item(1, 5, '++'), item(2, 4, '+ (p)')])).toEqual({
      ok: true, checked: 2, mismatches: [], scaleMessage: null,
    });
  });

  it('flags a right index with a wrong label as a scale problem', () => {
    const result = verifyAfterSave(symbols5, [row(1, 5, '++')], [item(1, 5, '-- (mm)')]);
    expect(result.ok).toBe(false);
    expect(result.mismatches.map((m) => [m.actualValue, m.actualLabel])).toEqual([[5, '--']]);
    expect(result.scaleMessage).toContain('Skala in Moodle passt nicht');
  });

  it('reports wrong index, ungraded and missing items without a scale message', () => {
    const result = verifyAfterSave(symbols5, [row(1, 5, '++'), row(2, 3, '~'), row(3, 2, '-')], [item(1, 4, '+'), item(2, null, '-')]);
    expect(result.ok).toBe(false);
    expect(result.mismatches.map((m) => [m.row.moodleUserId, m.actualValue, m.actualLabel])).toEqual([[1, 4, '+'], [2, null, null], [3, null, null]]);
    expect(result.scaleMessage).toBeNull();
  });

  it('compares points numerically without a label check', () => {
    const kind = pointsKind(24);
    const result = verifyAfterSave(kind, [row(1, 12.5, '12,5'), row(2, 3, '3'), row(3, 5, '5')], [item(1, 12.5, '12,50'), item(2, 4, '4,00'), item(3, null, '-')]);
    expect(result.mismatches.map((m) => [m.row.moodleUserId, m.actualValue])).toEqual([[2, 4], [3, null]]);
    expect(result.scaleMessage).toBeNull();
  });

  it('checks grade labels like a scale', () => {
    const ok = verifyAfterSave(gradesKind, [row(1, 5, '1')], [item(1, 5, '1')]);
    expect(ok.ok).toBe(true);
    const bad = verifyAfterSave(gradesKind, [row(1, 5, '1')], [item(1, 5, '++')]);
    expect(bad.scaleMessage).not.toBeNull();
  });
});
