import { describe, expect, it } from 'vitest';
import { effectiveMapping, matchByName, nameKey, normalizeName } from '../../src/core/nameMatch';
import type { PluginStudent } from '../../src/window';

const s = (id: string, firstName: string, lastName: string): PluginStudent => ({ id, firstName, lastName, color: null });
const u = (username: string, firstName: string, lastName: string) => ({ username, firstName, lastName });

describe('normalizeName', () => {
  it('ignores case, whitespace and diacritics', () => {
    expect(normalizeName('  JOSÉ   García ')).toBe('jose garcia');
    expect(normalizeName('Müller')).toBe(normalizeName('MULLER'));
    expect(normalizeName('Strauß')).toBe('strauss');
    expect(normalizeName('Anna-Maria')).toBe('anna maria');
  });
});

describe('nameKey', () => {
  it('is the same for swapped order', () => {
    expect(nameKey('Max', 'Mustermann')).toBe(nameKey('Mustermann', 'Max'));
  });
});

describe('matchByName', () => {
  it('matches umlauts and swapped order', () => {
    const result = matchByName(
      [u('mm', 'Max', 'Müller'), u('em', 'Musterfrau', 'Erika')],
      [s('s1', 'max', 'MULLER'), s('s2', 'Erika', 'Musterfrau')],
    );
    expect(result.matches).toEqual({ mm: 's1', em: 's2' });
    expect(result.unmatchedUsers).toEqual([]);
    expect(result.unmatchedStudents).toEqual([]);
  });

  it('leaves duplicates on either side unmatched', () => {
    const twoStudents = matchByName([u('a', 'Max', 'Mustermann')], [s('s1', 'Max', 'Mustermann'), s('s2', 'Max', 'Mustermann')]);
    expect(twoStudents.matches).toEqual({});
    const twoUsers = matchByName([u('a', 'Max', 'Mustermann'), u('b', 'Max', 'Mustermann')], [s('s1', 'Max', 'Mustermann')]);
    expect(twoUsers.matches).toEqual({});
    expect(twoUsers.unmatchedUsers).toHaveLength(2);
    expect(twoUsers.unmatchedStudents).toHaveLength(1);
  });

  it('lists the unmatched on both sides', () => {
    const result = matchByName([u('a', 'Max', 'Mustermann'), u('b', 'Ida', 'Fremd')], [s('s1', 'Max', 'Mustermann'), s('s2', 'Karl', 'Anders')]);
    expect(result.unmatchedUsers.map((r) => r.username)).toEqual(['b']);
    expect(result.unmatchedStudents.map((x) => x.id)).toEqual(['s2']);
  });

  it('never matches empty names', () => {
    expect(matchByName([u('a', '', '')], [s('s1', '', '')]).matches).toEqual({});
  });
});

describe('effectiveMapping', () => {
  const roster = [u('a', 'Max', 'Mustermann'), u('b', 'Erika', 'Musterfrau'), u('c', 'Ida', 'Fremd')];
  const students = [s('s1', 'Max', 'Mustermann'), s('s2', 'Erika', 'Musterfrau'), s('s3', 'Karl', 'Anders')];

  it('lets a stored override win over the name match', () => {
    expect(effectiveMapping(roster, students, { a: 's3' })).toEqual({ a: 's3', b: 's2' });
  });

  it('adds name matches for everything not stored', () => {
    expect(effectiveMapping(roster, students, {})).toEqual({ a: 's1', b: 's2' });
  });

  it('drops stored entries of users or students that are gone', () => {
    expect(effectiveMapping(roster, students, { zz: 's1', c: 'gone' })).toEqual({ a: 's1', b: 's2' });
  });
});
