import { describe, expect, it } from 'vitest';
import { matchStudents, normalizeName } from '../../src/core/matchStudents';

const g = (id: string, firstName: string, lastName: string) => ({ id, firstName, lastName });
const m = (id: number, firstName: string, lastName: string) => ({ id, firstName, lastName });

describe('normalizeName', () => {
  it('lowercases, strips diacritics and collapses whitespace', () => {
    expect(normalizeName('  Jürgen   Müller ')).toBe('jurgen muller');
  });
});

describe('matchStudents', () => {
  it('matches by name, ignoring case, diacritics and word order', () => {
    const r = matchStudents([g('a', 'Jürgen', 'Müller'), g('b', 'Anna', 'Huber')], [m(1, 'JURGEN', 'muller'), m(2, 'Huber', 'Anna')], {});
    expect(r.matched.map((p) => [p.grader.id, p.moodle.id])).toEqual([['a', 1], ['b', 2]]);
    expect(r.unmatchedGrader).toEqual([]);
    expect(r.unusedMoodle).toEqual([]);
  });

  it('does not match ambiguous names on either side', () => {
    const r = matchStudents(
      [g('a', 'Max', 'Huber'), g('b', 'Max', 'Huber'), g('c', 'Eva', 'Roth')],
      [m(1, 'Max', 'Huber'), m(2, 'Eva', 'Roth'), m(3, 'Eva', 'Roth')],
      {},
    );
    expect(r.matched).toEqual([]);
    expect(r.unmatchedGrader.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(r.unusedMoodle.map((s) => s.id)).toEqual([1, 2, 3]);
  });

  it('leaves students without a counterpart unmatched', () => {
    const r = matchStudents([g('a', 'Anna', 'A')], [m(1, 'Bert', 'B')], {});
    expect(r.unmatchedGrader).toHaveLength(1);
    expect(r.unusedMoodle).toHaveLength(1);
  });

  it('does not match empty names', () => {
    const r = matchStudents([g('a', '', '')], [m(1, '', '')], {});
    expect(r.matched).toEqual([]);
  });

  it('lets the stored mapping win over automatic matching', () => {
    const r = matchStudents([g('a', 'Anna', 'Huber')], [m(1, 'Anna', 'Huber'), m(2, 'Zoe', 'Zed')], { a: 2 });
    expect(r.matched.map((p) => [p.grader.id, p.moodle.id])).toEqual([['a', 2]]);
    expect(r.unusedMoodle.map((s) => s.id)).toEqual([1]);
  });

  it('ignores stored entries for vanished students and users', () => {
    const r = matchStudents([g('a', 'Anna', 'Huber')], [m(1, 'Anna', 'Huber')], { a: 99, gone: 1 });
    expect(r.matched.map((p) => [p.grader.id, p.moodle.id])).toEqual([['a', 1]]);
  });

  it('does not map two Grader students to one Moodle user via the stored mapping', () => {
    const r = matchStudents([g('a', 'A', 'A'), g('b', 'B', 'B')], [m(1, 'X', 'X')], { a: 1, b: 1 });
    expect(r.matched.map((p) => p.grader.id)).toEqual(['a']);
    expect(r.unmatchedGrader.map((s) => s.id)).toEqual(['b']);
  });
});
