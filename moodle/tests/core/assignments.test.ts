import { describe, expect, it } from 'vitest';
import { classifyAssignments } from '../../src/core/assignments';

const a = (id: number, grade: number) => ({ id, cmid: id + 100, name: `A${id}`, grade, markingWorkflow: false });
const tertiary = { gradingType: 'TERTIARY', maxPoints: null, displayAsGrade: false };
const numeric = { gradingType: 'NUMERIC', maxPoints: 24, displayAsGrade: false };
const numericGrade = { ...numeric, displayAsGrade: true };
const list = [a(1, -7), a(2, 24), a(3, 30), a(4, 0)];
const sel = (assessment: Parameters<typeof classifyAssignments>[1]) => classifyAssignments(list, assessment).map((c) => c.selectable);

describe('classifyAssignments', () => {
  it('offers scales for symbol columns and explains the others', () => {
    expect(sel(tertiary)).toEqual([true, false, false, false]);
    const c = classifyAssignments(list, tertiary);
    expect(c[0]).toEqual({ assignment: a(1, -7), selectable: true, reason: null });
    expect(c[1]?.reason).toContain('24');
    expect(c[3]?.reason).toContain('keine Bewertung');
  });

  it('offers points assignments with equal maximum for point columns', () => {
    expect(sel(numeric)).toEqual([false, true, false, false]);
    const c = classifyAssignments(list, numeric);
    expect(c[0]?.reason).toContain('Skala');
    expect(c[2]?.reason).toContain('Grader 24, Moodle 30');
  });

  it('offers points and scales for point columns shown as grades', () => {
    expect(sel(numericGrade)).toEqual([true, true, false, false]);
  });
});
