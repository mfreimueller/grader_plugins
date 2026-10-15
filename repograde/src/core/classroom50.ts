/**
 * Classroom 50 (https://github.com/foundation50/classroom50): all state lives in files of the `classroom50`
 * repository of the organization. This module parses those files (pure, no I/O) and builds repository names.
 * Unknown fields are ignored; unknown schema versions and missing fields give a clear German error.
 */

export const CLASSROOM_SCHEMA = 'classroom50/classroom/v1';
export const ASSIGNMENTS_SCHEMA = 'classroom50/assignments/v1';

/** A state file is missing, unreadable or in a version this plugin does not know. */
export class ClassroomFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClassroomFormatError';
  }
}

export interface Classroom {
  /** Subdirectory of the state repository. */
  dir: string;
  name: string;
  shortName: string;
  org: string | null;
}

export interface Assignment {
  slug: string;
  name: string;
  /** `individual` or something else (group assignments, not supported yet). */
  mode: string;
  due: Date | null;
  availableFrom: Date | null;
}

/** The only roster data this plugin looks at. Emails and the like are dropped while parsing. */
export interface RosterStudent {
  username: string;
  firstName: string;
  lastName: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function parseJson(file: string, textContent: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(textContent);
  } catch {
    throw new ClassroomFormatError(`Die Datei ${file} ist kein gültiges JSON.`);
  }
  if (!isRecord(value)) throw new ClassroomFormatError(`Die Datei ${file} hat ein unerwartetes Format.`);
  return value;
}

function requireSchema(file: string, value: Record<string, unknown>, expected: string): void {
  const schema = value.schema;
  if (schema !== expected) {
    const found = typeof schema === 'string' ? `„${schema}“` : 'keinem';
    throw new ClassroomFormatError(`Die Datei ${file} hat ${found} Schema (erwartet: „${expected}“). Diese Version wird nicht unterstützt.`);
  }
}

export function parseClassroom(dir: string, textContent: string): Classroom {
  const file = `${dir}/classroom.json`;
  const json = parseJson(file, textContent);
  requireSchema(file, json, CLASSROOM_SCHEMA);
  const shortName = json.short_name;
  if (typeof shortName !== 'string' || shortName.trim() === '') {
    throw new ClassroomFormatError(`In ${file} fehlt „short_name“.`);
  }
  const name = typeof json.name === 'string' && json.name !== '' ? json.name : shortName;
  return { dir, name, shortName, org: typeof json.org === 'string' && json.org !== '' ? json.org : null };
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseAssignments(dir: string, textContent: string): Assignment[] {
  const file = `${dir}/assignments.json`;
  const json = parseJson(file, textContent);
  requireSchema(file, json, ASSIGNMENTS_SCHEMA);
  if (!Array.isArray(json.assignments)) throw new ClassroomFormatError(`In ${file} fehlt die Liste „assignments“.`);
  const result: Assignment[] = [];
  for (const entry of json.assignments) {
    if (!isRecord(entry) || typeof entry.slug !== 'string' || entry.slug === '') {
      throw new ClassroomFormatError(`In ${file} hat eine Aufgabe keinen „slug“.`);
    }
    result.push({
      slug: entry.slug,
      name: typeof entry.name === 'string' && entry.name !== '' ? entry.name : entry.slug,
      mode: typeof entry.mode === 'string' ? entry.mode : 'individual',
      due: parseDate(entry.due),
      availableFrom: parseDate(entry.available_from),
    });
  }
  return result;
}

/** Assignments by due date, the ones without a due date last (in their original order). */
export function sortAssignments(assignments: Assignment[]): Assignment[] {
  return assignments
    .map((a, index) => ({ a, index }))
    .sort((x, y) => {
      const dx = x.a.due?.getTime();
      const dy = y.a.due?.getTime();
      if (dx !== undefined && dy !== undefined) return dx - dy || x.index - y.index;
      if (dx !== undefined) return -1;
      if (dy !== undefined) return 1;
      return x.index - y.index;
    })
    .map(({ a }) => a);
}

/** RFC 4180 style: quoted fields, doubled quotes, CRLF or LF, optional BOM. */
export function parseCsv(textContent: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = textContent.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src.charAt(i);
    if (quoted) {
      if (c === '"' && src.charAt(i + 1) === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src.charAt(i + 1) === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** The rows of the roster with role `student`. Teachers and any other roles are ignored. */
export function parseRoster(dir: string, textContent: string): RosterStudent[] {
  const file = `${dir}/roster.csv`;
  const [header, ...rows] = parseCsv(textContent);
  if (header === undefined) throw new ClassroomFormatError(`Die Datei ${file} ist leer.`);
  const columns = header.map((h) => h.trim().toLowerCase());
  const index = (name: string): number => columns.indexOf(name);
  const [iUser, iFirst, iLast, iRole] = ['username', 'first_name', 'last_name', 'role'].map(index);
  if (iUser === undefined || iUser < 0 || iRole === undefined || iRole < 0) {
    throw new ClassroomFormatError(`In ${file} fehlen die Spalten „username“ und „role“.`);
  }
  const students: RosterStudent[] = [];
  for (const row of rows) {
    const cellAt = (i: number | undefined): string => (i === undefined || i < 0 ? '' : (row[i] ?? '').trim());
    const username = cellAt(iUser);
    if (cellAt(iRole).toLowerCase() !== 'student' || username === '') continue;
    students.push({ username, firstName: cellAt(iFirst), lastName: cellAt(iLast) });
  }
  return students;
}

/** `<short_name>-<slug>-<github username>`: the repository Classroom 50 creates for one student. */
export function studentRepoName(shortName: string, slug: string, username: string): string {
  return `${shortName}-${slug}-${username}`;
}
