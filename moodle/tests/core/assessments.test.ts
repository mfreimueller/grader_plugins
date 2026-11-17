import { describe, expect, it } from 'vitest';
import { assessmentLabel, pickCandidates } from '../../src/core/assessments';
import type { PluginAssessment } from '../../src/window';

const make = (over: Partial<PluginAssessment>): PluginAssessment => ({
  id: 'a', title: 'T', date: '2026-10-05', sessionId: 's', categoryId: 'c', gradingType: 'TERTIARY', maxPoints: null, displayAsGrade: false,
  isImpromptu: false, results: [{ studentId: '1', score: null, symbol: 'PLUS', grade: null, note: null }], ...over,
});
const scored = (over: Partial<PluginAssessment> = {}) =>
  make({ gradingType: 'NUMERIC', maxPoints: 24, results: [{ studentId: '1', score: 20, symbol: null, grade: null, note: null }], ...over });

describe('pickCandidates', () => {
  it('keeps shared symbol columns with a symbol and point columns with a maximum and a score', () => {
    expect(pickCandidates([make({ id: 'sym' }), scored({ id: 'pts' }), scored({ id: 'grade', displayAsGrade: true })]).map((a) => a.id)).toEqual(['sym', 'pts', 'grade']);
  });

  it('drops impromptu, empty and unusable columns', () => {
    const list = [
      make({ id: 'imp', isImpromptu: true }),
      make({ id: 'none', results: [{ studentId: '1', score: null, symbol: null, grade: null, note: 'x' }] }),
      make({ id: 'empty', results: [] }),
      scored({ id: 'nomax', maxPoints: null }),
      scored({ id: 'zeromax', maxPoints: 0 }),
      scored({ id: 'noscore', results: [{ studentId: '1', score: null, symbol: null, grade: null, note: 'x' }] }),
      make({ id: 'other', gradingType: 'ORDINAL' }),
    ];
    expect(pickCandidates(list)).toEqual([]);
  });
});

describe('assessmentLabel', () => {
  it('shows date and type', () => {
    expect(assessmentLabel(make({ title: 'Übung 3' }))).toBe('Übung 3 – 05.10. – Symbole');
    expect(assessmentLabel(scored({ title: '1. Test' }))).toBe('1. Test – 05.10. – Punkte (24)');
    expect(assessmentLabel(scored({ title: '1. Test', displayAsGrade: true }))).toBe('1. Test – 05.10. – Noten');
  });
});
