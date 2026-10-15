import type { GraderPluginApi, SessionTarget } from '../window';
import { errorText, unwrap } from './bridge';
import type { StudentGrade } from './grading';

export interface CommitResult {
  assessmentIds: string[];
  /** Students whose assessment could not be created, with the reason. */
  failures: { studentId: string; message: string }[];
}

/** Creates one impromptu assessment per grade, one after the other. A failure does not stop the others. */
export async function commitGrades(
  grader: GraderPluginApi,
  grades: StudentGrade[],
  categoryId: string,
  session: SessionTarget,
  title: string,
): Promise<CommitResult> {
  const result: CommitResult = { assessmentIds: [], failures: [] };
  for (const grade of grades) {
    try {
      const created = unwrap(
        await grader.assessment.createImpromptu({ studentId: grade.studentId, categoryId, symbol: grade.symbol, session, title }),
      );
      result.assessmentIds.push(created.assessmentId);
    } catch (error) {
      result.failures.push({ studentId: grade.studentId, message: errorText(error) });
    }
  }
  return result;
}

/** Deletes the assessments of a run. Returns the ids that could not be deleted. */
export async function deleteAssessments(grader: GraderPluginApi, ids: string[]): Promise<string[]> {
  const remaining: string[] = [];
  for (const id of ids) {
    try {
      unwrap(await grader.assessment.deleteImpromptu(id));
    } catch (error) {
      // An assessment that is already gone needs no deleting; anything else stays on the list.
      if (!(error instanceof Error && 'code' in error && error.code === 'NOT_FOUND')) remaining.push(id);
    }
  }
  return remaining;
}
