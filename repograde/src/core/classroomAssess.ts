import type { GraderPluginApi, SessionTarget } from '../window';
import { commitGrades, deleteAssessments, type CommitResult } from './assess';
import { alreadyEntered, type AssignmentRun, type AssignmentRuns } from './classroomStore';
import type { StudentGrade } from './grading';

export interface EnterRequest {
  slug: string;
  /** The assignment's name, used as the title of every assessment. */
  title: string;
  grades: StudentGrade[];
  categoryId: string;
  session: SessionTarget;
  from: Date;
  to: Date;
  /** The teacher confirmed entering an assignment that was entered before. */
  confirmedReentry: boolean;
}

export type EnterOutcome =
  | { status: 'needs-confirmation' }
  | { status: 'entered'; runs: AssignmentRuns; commit: CommitResult; notDeleted: number };

/**
 * Enters one PLUS/MINUS per student for an assignment and records the ids by slug. An assignment that was entered
 * before is only entered again after confirmation, and its earlier assessments are deleted first so nothing is
 * counted twice.
 */
export async function enterAssignment(
  grader: GraderPluginApi,
  runs: AssignmentRuns,
  request: EnterRequest,
  persist: (runs: AssignmentRuns) => Promise<void>,
): Promise<EnterOutcome> {
  const entered = alreadyEntered(runs, request.slug);
  if (entered && !request.confirmedReentry) return { status: 'needs-confirmation' };
  const earlier = runs[request.slug]?.assessmentIds ?? [];
  const leftOver = entered ? await deleteAssessments(grader, earlier) : [];
  const commit = await commitGrades(grader, request.grades, request.categoryId, request.session, request.title);
  const ids = [...leftOver, ...commit.assessmentIds];
  const next: AssignmentRuns = { ...runs };
  if (ids.length > 0) {
    next[request.slug] = { from: request.from.toISOString(), to: request.to.toISOString(), assessmentIds: ids };
  } else delete next[request.slug];
  if (ids.length > 0 || entered) await persist(next);
  return { status: 'entered', runs: next, commit, notDeleted: leftOver.length };
}

/** Deletes the assessments of one assignment ("Rückgängig"). Returns the runs and how many could not be deleted. */
export async function undoAssignment(
  grader: GraderPluginApi,
  runs: AssignmentRuns,
  slug: string,
  persist: (runs: AssignmentRuns) => Promise<void>,
): Promise<{ runs: AssignmentRuns; notDeleted: number }> {
  const run: AssignmentRun | undefined = runs[slug];
  if (run === undefined) return { runs, notDeleted: 0 };
  const remaining = await deleteAssessments(grader, run.assessmentIds);
  const next: AssignmentRuns = { ...runs };
  if (remaining.length === 0) delete next[slug];
  else next[slug] = { ...run, assessmentIds: remaining };
  await persist(next);
  return { runs: next, notDeleted: remaining.length };
}
