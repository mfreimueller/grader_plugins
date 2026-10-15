import type { PluginStudent } from '../window';
import type { RepoOutcome } from './github';
import type { RepoPresence } from './classroomRemote';
import type { RosterStudent } from './classroom50';
import { studentRepoName } from './classroom50';
import type { GradeSymbol, StudentGrade } from './grading';

export type RowStatus = 'graded' | 'no-repo' | 'empty' | 'error';

export interface ClassroomRow {
  username: string;
  studentId: string;
  studentName: string;
  repo: string;
  status: RowStatus;
  added: number;
  removed: number;
  total: number;
  /** null when there is no commit data (no repository, empty, error). */
  passes: boolean | null;
  symbol: GradeSymbol | null;
  error: string | null;
}

export interface ClassroomGradingInput {
  shortName: string;
  slug: string;
  roster: RosterStudent[];
  /** GitHub username to student id. Only mapped roster students are graded. */
  mapping: Record<string, string>;
  students: PluginStudent[];
  presence: Map<string, RepoPresence>;
  /** Totals of the repositories that exist and are not empty, by repository name. */
  outcomes: RepoOutcome[];
  minimumCommitSize: number;
}

export interface ClassroomGradingResult {
  rows: ClassroomRow[];
  grades: StudentGrade[];
  erroredRepos: string[];
  /** Roster students nobody in the course is assigned to: not graded. */
  unmappedUsers: RosterStudent[];
  /** Course students without a GitHub user. */
  studentsWithoutUser: PluginStudent[];
}

/** The repositories whose commits have to be read: the ones that exist and have content. */
export function reposToRead(input: Pick<ClassroomGradingInput, 'shortName' | 'slug' | 'roster' | 'mapping' | 'presence'>): string[] {
  const names: string[] = [];
  for (const user of input.roster) {
    if (!(user.username in input.mapping)) continue;
    const name = studentRepoName(input.shortName, input.slug, user.username);
    const presence = input.presence.get(name);
    if (presence?.exists === true && !presence.isEmpty) names.push(presence.name);
  }
  return names;
}

/** Repository names to look up: one exact name per mapped roster student, never a prefix match. */
export function reposToLookUp(input: Pick<ClassroomGradingInput, 'shortName' | 'slug' | 'roster' | 'mapping'>): string[] {
  return input.roster
    .filter((r) => r.username in input.mapping)
    .map((r) => studentRepoName(input.shortName, input.slug, r.username));
}

/**
 * PLUS/MINUS per student for one assignment. A student without a repository (never accepted) or with an empty
 * one handed in nothing: MINUS. A repository that could not be read is skipped, not graded on incomplete data.
 */
export function gradeClassroom(input: ClassroomGradingInput): ClassroomGradingResult {
  const byId = new Map(input.students.map((s) => [s.id, s] as const));
  const outcomeOf = new Map(input.outcomes.map((o) => [o.repo, o] as const));
  const rows: ClassroomRow[] = [];

  for (const user of input.roster) {
    const studentId = input.mapping[user.username];
    const student = studentId === undefined ? undefined : byId.get(studentId);
    if (studentId === undefined || student === undefined) continue;
    const wanted = studentRepoName(input.shortName, input.slug, user.username);
    const presence = input.presence.get(wanted);
    const base = {
      username: user.username,
      studentId,
      studentName: `${student.firstName} ${student.lastName}`,
      repo: wanted,
      added: 0,
      removed: 0,
      total: 0,
      passes: null,
      error: null,
    };
    if (presence === undefined) {
      rows.push({ ...base, status: 'error', symbol: null, error: 'Repository wurde nicht abgefragt.' });
    } else if (!presence.exists) {
      rows.push({ ...base, status: 'no-repo', symbol: 'MINUS' });
    } else if (presence.isEmpty) {
      rows.push({ ...base, repo: presence.name, status: 'empty', symbol: 'MINUS' });
    } else {
      const outcome = outcomeOf.get(presence.name);
      if (outcome === undefined || outcome.error !== null) {
        rows.push({ ...base, repo: presence.name, status: 'error', symbol: null, error: outcome?.error ?? 'Keine Commit-Daten erhalten.' });
      } else {
        const total = outcome.added + outcome.removed;
        const passes = total >= input.minimumCommitSize;
        rows.push({
          ...base,
          repo: presence.name,
          status: 'graded',
          added: outcome.added,
          removed: outcome.removed,
          total,
          passes,
          symbol: passes ? 'PLUS' : 'MINUS',
        });
      }
    }
  }

  const grades: StudentGrade[] = [];
  const courseOrder = input.students.map((s) => s.id);
  for (const id of courseOrder) {
    const own = rows.filter((r) => r.studentId === id);
    if (own.length === 0) continue;
    const plus = own.find((r) => r.symbol === 'PLUS');
    if (plus !== undefined) grades.push({ studentId: id, symbol: 'PLUS', repo: plus.repo });
    else if (own.some((r) => r.status === 'error')) continue;
    else grades.push({ studentId: id, symbol: 'MINUS', repo: own[0]?.repo ?? '' });
  }

  const mappedIds = new Set(Object.values(input.mapping));
  return {
    rows,
    grades,
    erroredRepos: rows.filter((r) => r.status === 'error').map((r) => r.repo),
    unmappedUsers: input.roster.filter((r) => !(r.username in input.mapping)),
    studentsWithoutUser: input.students.filter((s) => !mappedIds.has(s.id)),
  };
}
