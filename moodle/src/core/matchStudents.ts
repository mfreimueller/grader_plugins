import type { GraderStudent, MoodleStudent } from './types';

/** Lower case, no diacritics, single spaces. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/\s+/)
    .filter((part) => part !== '')
    .join(' ');
}

/** Word order does not matter: "Max Huber" equals "Huber Max". */
const nameKey = (firstName: string, lastName: string): string =>
  normalizeName(`${firstName} ${lastName}`).split(' ').sort().join(' ');

export interface StudentPair {
  grader: GraderStudent;
  moodle: MoodleStudent;
}

export interface MatchResult {
  matched: StudentPair[];
  unmatchedGrader: GraderStudent[];
  unusedMoodle: MoodleStudent[];
}

function group<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(keyOf(item), [...(map.get(keyOf(item)) ?? []), item]);
  return map;
}

/**
 * Pairs Grader students with Moodle students. The stored mapping (Grader id to Moodle user id) wins; the rest is
 * matched by name, and only a unique hit on both sides counts.
 */
export function matchStudents(
  graderStudents: readonly GraderStudent[],
  moodleStudents: readonly MoodleStudent[],
  stored: Readonly<Record<string, number>>,
): MatchResult {
  const moodleById = new Map(moodleStudents.map((m) => [m.id, m]));
  const matched: StudentPair[] = [];
  const taken = new Set<string>();
  const used = new Set<number>();
  const claim = (grader: GraderStudent, moodle: MoodleStudent): void => {
    matched.push({ grader, moodle });
    taken.add(grader.id);
    used.add(moodle.id);
  };

  for (const grader of graderStudents) {
    const moodle = moodleById.get(stored[grader.id] ?? -1);
    if (moodle !== undefined && !used.has(moodle.id)) claim(grader, moodle);
  }

  const freeGrader = graderStudents.filter((s) => !taken.has(s.id));
  const freeMoodle = moodleStudents.filter((s) => !used.has(s.id));
  const graderByKey = group(freeGrader, (s) => nameKey(s.firstName, s.lastName));
  const moodleByKey = group(freeMoodle, (s) => nameKey(s.firstName, s.lastName));
  for (const [key, candidates] of graderByKey) {
    const grader = candidates[0];
    const moodle = moodleByKey.get(key)?.[0];
    if (key !== '' && candidates.length === 1 && moodleByKey.get(key)?.length === 1 && grader !== undefined && moodle !== undefined) {
      claim(grader, moodle);
    }
  }

  return {
    matched,
    unmatchedGrader: graderStudents.filter((s) => !taken.has(s.id)),
    unusedMoodle: moodleStudents.filter((s) => !used.has(s.id)),
  };
}
