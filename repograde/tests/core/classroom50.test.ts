import { describe, expect, it } from 'vitest';
import {
  ClassroomFormatError,
  parseAssignments,
  parseClassroom,
  parseCsv,
  parseRoster,
  sortAssignments,
  studentRepoName,
} from '../../src/core/classroom50';
import { assignmentsJson, classroomJson, rosterCsv } from './classroomFixtures';

describe('parseClassroom', () => {
  it('reads name, short name and org and ignores everything else', () => {
    expect(parseClassroom('klasse', classroomJson())).toEqual({
      dir: 'klasse',
      name: 'sj2627-pos-3abc',
      shortName: 'sj2627-pos-3abc',
      org: 'Beispiel-Schule',
    });
  });

  it('rejects an unknown schema version with a message naming the file', () => {
    const text = classroomJson('x', { schema: 'classroom50/classroom/v2' });
    expect(() => parseClassroom('klasse', text)).toThrow(/klasse\/classroom\.json.*classroom50\/classroom\/v2.*nicht unterstützt/);
  });

  it('rejects a missing schema, invalid JSON and a missing short name', () => {
    expect(() => parseClassroom('k', '{}')).toThrow(ClassroomFormatError);
    expect(() => parseClassroom('k', 'nope')).toThrow(/kein gültiges JSON/);
    expect(() => parseClassroom('k', JSON.stringify({ schema: 'classroom50/classroom/v1' }))).toThrow(/short_name/);
  });
});

describe('parseAssignments', () => {
  const parsed = parseAssignments('klasse', assignmentsJson());

  it('reads slug, name and mode', () => {
    expect(parsed.map((a) => [a.slug, a.name, a.mode])).toContainEqual(['01-movie-archive', '01-Movie-Archive', 'individual']);
    expect(parsed.find((a) => a.slug === '02-space-mission')?.mode).toBe('group');
  });

  it('treats due and available_from as optional', () => {
    const open = parsed.find((a) => a.slug === '03-bowling-kata');
    expect(open).toMatchObject({ due: null, availableFrom: null });
    expect(parsed.find((a) => a.slug === '00-task-board')?.due).toEqual(new Date('2026-10-01T07:55:00Z'));
  });

  it('ignores an unreadable date instead of failing', () => {
    const text = JSON.stringify({ schema: 'classroom50/assignments/v1', assignments: [{ slug: 'a', due: 'bald' }] });
    expect(parseAssignments('k', text)[0]).toMatchObject({ slug: 'a', name: 'a', due: null });
  });

  it('rejects an unknown schema and names the file', () => {
    const text = JSON.stringify({ schema: 'classroom50/assignments/v9', assignments: [] });
    expect(() => parseAssignments('klasse', text)).toThrow(/klasse\/assignments\.json/);
  });

  it('rejects an assignment without slug and a missing list', () => {
    expect(() => parseAssignments('k', JSON.stringify({ schema: 'classroom50/assignments/v1', assignments: [{}] }))).toThrow(/slug/);
    expect(() => parseAssignments('k', JSON.stringify({ schema: 'classroom50/assignments/v1' }))).toThrow(/assignments/);
  });
});

describe('sortAssignments', () => {
  it('sorts by due date with undated assignments last, keeping their order', () => {
    const sorted = sortAssignments(parseAssignments('k', assignmentsJson()));
    expect(sorted.map((a) => a.slug)).toEqual(['00-task-board', '01-movie-archive', '03-bowling-kata', '02-space-mission']);
  });
});

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, commas in fields and CRLF', () => {
    expect(parseCsv('a,b\r\n"x,1","he said ""hi"""\r\n')).toEqual([['a', 'b'], ['x,1', 'he said "hi"']]);
  });

  it('skips blank lines and a BOM', () => {
    expect(parseCsv('﻿a,b\n\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('parseRoster', () => {
  it('keeps students only and drops everything but username and name', () => {
    const roster = parseRoster('klasse', rosterCsv());
    expect(roster).toEqual([
      { username: 'maxMuster', firstName: 'Max', lastName: 'Mustermann' },
      { username: 'erika-m', firstName: 'Erika', lastName: 'Musterfrau' },
      { username: 'jose-g', firstName: 'José', lastName: 'García-Müller' },
    ]);
    expect(JSON.stringify(roster)).not.toContain('example.org');
  });

  it('fails clearly for an empty file or missing columns', () => {
    expect(() => parseRoster('k', '')).toThrow(/k\/roster\.csv.*leer/);
    expect(() => parseRoster('k', 'name,mail\nx,y')).toThrow(/username/);
  });
});

describe('studentRepoName', () => {
  it('builds <short_name>-<slug>-<username>', () => {
    expect(studentRepoName('sj2627-pos-3abc', '01-movie-archive', 'maxMuster')).toBe('sj2627-pos-3abc-01-movie-archive-maxMuster');
  });

  it('keeps slugs that start with another slug apart', () => {
    const a = studentRepoName('k', '01-app', 'max');
    const b = studentRepoName('k', '01-app-v2', 'max');
    expect(b.startsWith(a)).toBe(false);
    expect(a).not.toBe(b);
  });
});
