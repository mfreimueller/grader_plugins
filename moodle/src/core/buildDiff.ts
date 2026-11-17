import type { TransferKind } from './kinds';
import type { AssessmentResultInput, GradeItem, GraderStudent } from './types';

export type RowStatus = 'new' | 'changed' | 'same' | 'skipped' | 'unmatched';

export interface DiffRow {
  graderStudent: GraderStudent;
  moodleUserId: number | null;
  /** The Grader value as Grader shows it (symbol, points or grade); empty when there is none. */
  sourceText: string;
  /** The Moodle grade value to send (scale index or points). */
  targetValue: number | null;
  targetLabel: string | null;
  /** What Moodle holds now (`graderaw`). */
  currentValue: number | null;
  currentLabel: string | null;
  note: string | null;
  status: RowStatus;
  /** A row that is only sent once the teacher confirmed it. */
  needsConfirmation: 'zeroPoints' | null;
}

/** A row that is sent: it has a Moodle user and a target grade. */
export type SendRow = DiffRow & { moodleUserId: number; targetValue: number };

export interface DiffInput {
  kind: TransferKind;
  /** Every student of the Grader course. */
  students: readonly GraderStudent[];
  results: readonly AssessmentResultInput[];
  /** Grader student id to Moodle user id. */
  mapping: Readonly<Record<string, number>>;
  /** Grade items of the one assignment. */
  current: readonly GradeItem[];
}

/** Numeric comparison of grades; points may be fractional. */
export function sameValue(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}

/**
 * One row per course student. A student without a usable grade is `skipped`: a grade in Moodle is never cleared.
 */
export function buildDiff(input: DiffInput): DiffRow[] {
  const { kind } = input;
  const resultByStudent = new Map(input.results.map((r) => [r.studentId, r]));
  const currentByUser = new Map(input.current.map((i) => [i.userId, i]));
  return input.students.map((graderStudent) => {
    const result = resultByStudent.get(graderStudent.id);
    const target = result === undefined ? null : kind.targetFor(result);
    const note = result?.note?.trim() || null;
    const moodleUserId = input.mapping[graderStudent.id] ?? null;
    const currentValue = (moodleUserId === null ? undefined : currentByUser.get(moodleUserId))?.graderaw ?? null;
    let status: RowStatus;
    if (target === null) status = 'skipped';
    else if (moodleUserId === null) status = 'unmatched';
    else if (currentValue === null) status = 'new';
    else status = sameValue(currentValue, target.value) ? 'same' : 'changed';
    return {
      graderStudent,
      moodleUserId,
      sourceText: result === undefined ? '' : kind.sourceText(result),
      targetValue: target?.value ?? null,
      targetLabel: target?.label ?? null,
      currentValue,
      currentLabel: currentValue === null ? null : kind.expectedLabel(currentValue),
      note,
      status,
      needsConfirmation: kind.confirmsZero && result?.score === 0 && (status === 'new' || status === 'changed') ? 'zeroPoints' : null,
    };
  });
}

/**
 * What is sent: `new` and `changed` rows, and `same` rows only when they carry a note (the grade is unchanged,
 * the note is written as feedback). `same` rows without a note are left alone.
 */
export function rowsToSend(rows: readonly DiffRow[], confirmed: ReadonlySet<string>): SendRow[] {
  return rows.filter(
    (r): r is SendRow =>
      (r.needsConfirmation === null || confirmed.has(r.graderStudent.id)) &&
      r.moodleUserId !== null && r.targetValue !== null && (r.status === 'new' || r.status === 'changed' || (r.status === 'same' && r.note !== null)),
  );
}

/** How many rows still wait for the teacher's confirmation. */
export function pendingConfirmations(rows: readonly DiffRow[], confirmed: ReadonlySet<string>): number {
  return rows.filter((r) => r.needsConfirmation !== null && !confirmed.has(r.graderStudent.id)).length;
}
