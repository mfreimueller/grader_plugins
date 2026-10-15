import type { PluginStudent } from '../window';
import type { RosterStudent } from './classroom50';

/** Lower case, no diacritics, ß as ss, hyphens as spaces, single spaces. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[-–_.]/g, ' ')
    .split(/\s+/)
    .filter((part) => part !== '')
    .join(' ');
}

/** Word order does not matter, so „Mustermann Max“ equals „Max Mustermann“. */
export function nameKey(firstName: string, lastName: string): string {
  return normalizeName(`${firstName} ${lastName}`).split(' ').sort().join(' ');
}

export interface MatchResult {
  /** GitHub username to student id: unique matches only. */
  matches: Record<string, string>;
  unmatchedUsers: RosterStudent[];
  unmatchedStudents: PluginStudent[];
}

/**
 * Matches roster students to course students by name. A name that occurs more than once on either side is
 * ambiguous and stays unmatched; the teacher assigns those by hand.
 */
export function matchByName(roster: RosterStudent[], students: PluginStudent[]): MatchResult {
  const group = <T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> => {
    const map = new Map<string, T[]>();
    for (const item of items) map.set(keyOf(item), [...(map.get(keyOf(item)) ?? []), item]);
    return map;
  };
  const users = group(roster, (r) => nameKey(r.firstName, r.lastName));
  const pupils = group(students, (s) => nameKey(s.firstName, s.lastName));
  const matches: Record<string, string> = {};
  const matchedStudents = new Set<string>();
  for (const [key, us] of users) {
    const ss = pupils.get(key);
    const user = us[0];
    const student = ss?.[0];
    if (key !== '' && us.length === 1 && ss?.length === 1 && user !== undefined && student !== undefined) {
      matches[user.username] = student.id;
      matchedStudents.add(student.id);
    }
  }
  return {
    matches,
    unmatchedUsers: roster.filter((r) => !(r.username in matches)),
    unmatchedStudents: students.filter((s) => !matchedStudents.has(s.id)),
  };
}

/**
 * The mapping in effect: the stored one (manual overrides and confirmed matches) wins, name matches fill the
 * rest. Stored entries pointing to a student who left the course are dropped, as are users not in the roster.
 */
export function effectiveMapping(
  roster: RosterStudent[],
  students: PluginStudent[],
  stored: Record<string, string>,
): Record<string, string> {
  const ids = new Set(students.map((s) => s.id));
  const users = new Set(roster.map((r) => r.username));
  const result: Record<string, string> = {};
  const taken = new Set<string>();
  for (const [user, id] of Object.entries(stored)) {
    if (users.has(user) && ids.has(id)) {
      result[user] = id;
      taken.add(id);
    }
  }
  const auto = matchByName(
    roster.filter((r) => !(r.username in result)),
    students.filter((s) => !taken.has(s.id)),
  );
  return { ...auto.matches, ...result };
}
