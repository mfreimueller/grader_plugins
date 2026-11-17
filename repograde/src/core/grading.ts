import type { PluginStudent } from '../window';
import type { RepoOutcome } from './github';

export type GradeSymbol = 'PLUS' | 'MINUS';

export interface GradingInput {
  outcomes: RepoOutcome[];
  /** Repository name to the ids of the students who worked on it (team projects: several). */
  repoMapping: Record<string, string[]>;
  /** A repository passes when lines added + removed reach this. */
  minimumCommitSize: number;
  prefix: string;
  /** Everybody in the course. */
  students: PluginStudent[];
}

export interface RepoRow {
  repo: string;
  projectName: string;
  studentIds: string[];
  studentNames: string[];
  added: number;
  removed: number;
  total: number;
  /** null when the repository could not be read. */
  passes: boolean | null;
  error: string | null;
}

export interface StudentGrade {
  studentId: string;
  symbol: GradeSymbol;
  /** The repository the grade comes from. */
  repo: string;
}

export interface GradingResult {
  rows: RepoRow[];
  grades: StudentGrade[];
  /** Read repositories nobody is assigned to. */
  unmappedRepos: string[];
  erroredRepos: string[];
  /** Students without any of the repositories that were read. */
  studentsWithoutRepo: PluginStudent[];
}

/**
 * Turns the commit totals of the repositories into PLUS/MINUS per student: everybody assigned to a repository
 * gets its grade. A student with several repositories gets PLUS if any passes; if none passes but one could not
 * be read, the student is skipped rather than given a MINUS on incomplete data.
 */
export function gradeRepos(input: GradingInput): GradingResult {
  const byId = new Map(input.students.map((s) => [s.id, s] as const));
  const courseOrder = new Map(input.students.map((s, i) => [s.id, i] as const));
  const inCourseOrder = (ids: Iterable<string>): string[] =>
    [...new Set(ids)].filter((id) => byId.has(id)).sort((a, b) => (courseOrder.get(a) ?? 0) - (courseOrder.get(b) ?? 0));

  const rows: RepoRow[] = input.outcomes.map((outcome) => {
    const studentIds = inCourseOrder(input.repoMapping[outcome.repo] ?? []);
    const total = outcome.added + outcome.removed;
    return {
      repo: outcome.repo,
      projectName: outcome.repo.startsWith(input.prefix) ? outcome.repo.slice(input.prefix.length) : outcome.repo,
      studentIds,
      studentNames: studentIds.map((id) => {
        const s = byId.get(id);
        return s === undefined ? id : `${s.firstName} ${s.lastName}`;
      }),
      added: outcome.added,
      removed: outcome.removed,
      total,
      passes: outcome.error === null ? total >= input.minimumCommitSize : null,
      error: outcome.error,
    };
  });

  const rowsOfStudent = new Map<string, RepoRow[]>();
  for (const row of rows) {
    for (const id of row.studentIds) rowsOfStudent.set(id, [...(rowsOfStudent.get(id) ?? []), row]);
  }

  const grades: StudentGrade[] = [];
  for (const id of inCourseOrder(rowsOfStudent.keys())) {
    const own = rowsOfStudent.get(id) ?? [];
    const passing = own.find((r) => r.passes === true);
    if (passing !== undefined) {
      grades.push({ studentId: id, symbol: 'PLUS', repo: passing.repo });
      continue;
    }
    if (own.some((r) => r.passes === null)) continue;
    const first = own[0];
    if (first !== undefined) grades.push({ studentId: id, symbol: 'MINUS', repo: first.repo });
  }

  return {
    rows,
    grades,
    unmappedRepos: rows.filter((r) => r.studentIds.length === 0).map((r) => r.repo),
    erroredRepos: rows.filter((r) => r.error !== null).map((r) => r.repo),
    studentsWithoutRepo: input.students.filter((s) => !rowsOfStudent.has(s.id)),
  };
}

/** The grades without the students marked absent: they get no assessment at all, neither PLUS nor MINUS. */
export function withoutAbsent(grades: StudentGrade[], absent: ReadonlySet<string>): StudentGrade[] {
  return grades.filter((g) => !absent.has(g.studentId));
}
