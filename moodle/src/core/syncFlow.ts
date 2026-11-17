import type { SendRow } from './buildDiff';
import { buildSavePayload } from './buildSavePayload';
import type { MoodleClient } from './moodleClient';
import { fail, ok, type Result } from './result';
import { decideKind, type AssessmentSpec, type KindDecision, type TransferKind } from './kinds';
import type { GradeItem, MoodleAssignment, MoodleStudent } from './types';
import { verifyAfterSave, type VerifyReport } from './verifyAfterSave';

export interface SyncState {
  moodleStudents: MoodleStudent[];
  /** Grade items of the chosen assignment. */
  items: GradeItem[];
  /** How the column is transferred; failed (with the reason) when the pair does not fit: the sync must be blocked. */
  kind: Result<KindDecision>;
}

/** Reads what the preview needs from Moodle (read-only calls). */
export async function prepareSync(client: MoodleClient, courseId: number, assignment: MoodleAssignment, assessment: AssessmentSpec): Promise<Result<SyncState>> {
  const students = await client.getEnrolledStudents(courseId);
  if (!students.ok) return students;
  const all = await client.getGradeItems(courseId);
  if (!all.ok) return all;
  const items = all.value.filter((i) => i.assignmentId === assignment.id);
  return ok({ moodleStudents: students.value, items, kind: decideKind(assessment, assignment, items) });
}

/** Saves the rows, reads the grade items back and compares them. */
export async function runSync(client: MoodleClient, courseId: number, assignmentId: number, kind: TransferKind, rows: readonly SendRow[]): Promise<Result<VerifyReport>> {
  const saved = await client.saveGrades(buildSavePayload(assignmentId, rows));
  if (!saved.ok) return saved;
  const readBack = await client.getGradeItems(courseId);
  if (!readBack.ok) return fail(`Gespeichert, aber die Kontrolle schlug fehl: ${readBack.error}`);
  return ok(verifyAfterSave(kind, rows, readBack.value.filter((i) => i.assignmentId === assignmentId)));
}
