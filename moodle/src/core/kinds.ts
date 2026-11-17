import type { PluginAssessment } from '../window';
import { fail, ok, type Result } from './result';
import { graderSymbolText, labelAt, NO_GRADE_COLUMN, verifyLabelScale, type ScaleSample } from './scale';
import type { AssessmentResultInput, MoodleAssignment } from './types';

export type KindId = 'symbols5' | 'symbols3' | 'points' | 'grades';

/** What is sent for one student: the Moodle grade value and the label it must show (null: nothing to compare). */
export interface Target {
  value: number;
  label: string | null;
}

/** One way of transferring a Grader column into a Moodle assignment. */
export interface TransferKind {
  id: KindId;
  /** German name shown in the UI. */
  title: string;
  /** Small legend for the preview, e.g. a lossy mapping; null when there is nothing to explain. */
  hint: string | null;
  /** Whether the displayed label of a Moodle grade is compared (scales yes, points no). */
  checksLabel: boolean;
  /** Whether a score of 0 must be confirmed per student (it may be a blank stored as 0). */
  confirmsZero: boolean;
  /** The grade to send; null means the student is skipped (a Moodle grade is never cleared). */
  targetFor(result: AssessmentResultInput): Target | null;
  /** How Grader shows the source value. */
  sourceText(result: AssessmentResultInput): string;
  /** The label Moodle shows for a stored value; null outside the scale. */
  expectedLabel(value: number): string | null;
  /** Pre-sync safety net over the grade items already present. */
  verifyScale(items: readonly ScaleSample[]): Result<void>;
}

/** The kind chosen for a pair; `unverified` when no graded item allowed checking the scale's labels. */
export interface KindDecision {
  kind: TransferKind;
  unverified: boolean;
}

/** The part of a Grader assessment that decides the kind. */
export type AssessmentSpec = Pick<PluginAssessment, 'gradingType' | 'maxPoints' | 'displayAsGrade'>;

const SYMBOLS5 = ['--', '-', '~', '+', '++'] as const;
const SYMBOLS3 = ['-', '~', '+'] as const;
const GRADE_LABELS = ['5', '4', '3', '2', '1'] as const;

const INDEX5: ReadonlyMap<string, number> = new Map([
  ['MINUS', 1], ['MINUS_WELLE', 2], ['WELLE', 3], ['PLUS_WELLE', 4], ['PLUS', 5],
]);
const INDEX3: ReadonlyMap<string, number> = new Map([
  ['MINUS', 1], ['MINUS_WELLE', 1], ['WELLE', 2], ['PLUS_WELLE', 3], ['PLUS', 3],
]);

function symbolKind(id: KindId, title: string, hint: string | null, labels: readonly string[], index: ReadonlyMap<string, number>): TransferKind {
  return {
    id,
    title,
    hint,
    checksLabel: true,
    confirmsZero: false,
    targetFor: (result) => {
      const value = result.symbol === null ? undefined : index.get(result.symbol);
      return value === undefined ? null : { value, label: labelAt(labels, value) };
    },
    sourceText: (result) => graderSymbolText(result.symbol),
    expectedLabel: (value) => labelAt(labels, value),
    verifyScale: (items) =>
      verifyLabelScale(items, {
        labels,
        mismatch: (i, actual, expected) =>
          `Die Skala passt nicht zur erwarteten Zuordnung (${labels.join(' ')}): Stufe ${i} heißt in Moodle „${actual}“, erwartet wurde „${expected ?? '?'}“. Es wird nichts übertragen.`,
      }),
  };
}

export const symbols5: TransferKind = symbolKind('symbols5', 'Symbole (5-stufige Skala)', null, SYMBOLS5, INDEX5);
export const symbols3: TransferKind = symbolKind('symbols3', 'Symbole (3-stufige Skala)', '3-stufige Skala: +~ → +, −~ → −', SYMBOLS3, INDEX3);

/** Grade 1..5 of Grader goes to scale index 6 - grade; the scale's labels are the plain digits. */
export const gradesKind: TransferKind = {
  id: 'grades',
  title: 'Noten 1–5 (Skala)',
  hint: null,
  checksLabel: true,
  confirmsZero: true,
  targetFor: (result) => {
    const grade = result.grade ?? null;
    return grade !== null && Number.isInteger(grade) && grade >= 1 && grade <= 5 ? { value: 6 - grade, label: String(grade) } : null;
  },
  sourceText: (result) => String(result.grade ?? ''),
  expectedLabel: (value) => labelAt(GRADE_LABELS, value),
  verifyScale: (items) =>
    verifyLabelScale(items, {
      labels: GRADE_LABELS,
      mismatch: (i, actual, expected) =>
        `Diese Skala sieht nicht nach Noten 1–5 aus: Stufe ${i} heißt in Moodle „${actual}“, erwartet wurde „${expected ?? '?'}“. Es wird nichts übertragen.`,
    }),
};

/** Points with a decimal comma, like Moodle shows them. */
export function formatPoints(points: number): string {
  return String(points).replace('.', ',');
}

export function pointsKind(maxPoints: number): TransferKind {
  return {
    id: 'points',
    title: `Punkte (max. ${formatPoints(maxPoints)})`,
    hint: null,
    checksLabel: false,
    confirmsZero: true,
    targetFor: (result) => (result.score === null ? null : { value: result.score, label: formatPoints(result.score) }),
    sourceText: (result) => (result.score === null ? '' : formatPoints(result.score)),
    expectedLabel: formatPoints,
    verifyScale: (items) => (items.length === 0 ? fail(NO_GRADE_COLUMN) : ok(undefined)),
  };
}

const SCALE_SIZES = 'Unterstützt werden Skalen mit 3 oder 5 Stufen.';

/**
 * Decides how a Grader column is transferred into a Moodle assignment, once its grade items are loaded
 * (only they tell the item count of a scale). The returned kind has already passed its pre-sync scale check.
 */
export function decideKind(assessment: AssessmentSpec, assignment: MoodleAssignment, items: readonly ScaleSample[]): Result<KindDecision> {
  const picked = pick(assessment, assignment, items);
  if (!picked.ok) return picked;
  const kind = picked.value;
  const checked = kind.verifyScale(items);
  if (!checked.ok) return checked;
  // Without a graded item no label could be compared; the teacher has to confirm the scale. Points have no labels.
  return ok({ kind, unverified: kind.checksLabel && items.every((i) => i.graderaw === null) });
}

function pick(assessment: AssessmentSpec, assignment: MoodleAssignment, items: readonly ScaleSample[]): Result<TransferKind> {
  if (assignment.grade === 0) return fail('Diese Aufgabe hat keine Bewertung.');
  if (assessment.gradingType === 'TERTIARY') return pickSymbols(assignment, items);
  if (assessment.gradingType === 'NUMERIC' && assessment.maxPoints !== null) return pickNumeric(assessment.maxPoints, assessment.displayAsGrade === true, assignment, items);
  return fail('Diese Grader-Bewertung kann nicht übertragen werden.');
}

function pickSymbols(assignment: MoodleAssignment, items: readonly ScaleSample[]): Result<TransferKind> {
  if (assignment.grade > 0) return fail(`Die Aufgabe wird mit Punkten (max. ${assignment.grade}) bewertet, nicht mit einer Skala. Symbole brauchen eine Skala.`);
  const size = items[0]?.grademax;
  if (size === undefined) return fail(NO_GRADE_COLUMN);
  if (size === 3) return ok(symbols3);
  if (size === 5) return ok(symbols5);
  return fail(`Die Skala dieser Aufgabe hat ${size} Stufen. ${SCALE_SIZES}`);
}

function pickNumeric(maxPoints: number, asGrade: boolean, assignment: MoodleAssignment, items: readonly ScaleSample[]): Result<TransferKind> {
  if (assignment.grade > 0) {
    if (assignment.grade !== maxPoints) {
      return fail(`Höchstpunkte stimmen nicht überein: Grader ${maxPoints}, Moodle ${assignment.grade} – bitte die Aufgabe in Moodle anpassen.`);
    }
    return ok(pointsKind(maxPoints));
  }
  if (!asGrade) return fail('Diese Grader-Bewertung hat Punkte; die Aufgabe braucht eine Punkte-Bewertung, keine Skala.');
  const size = items[0]?.grademax;
  if (size === undefined) return fail(NO_GRADE_COLUMN);
  if (size !== 5) return fail(`Für Noten 1–5 wird eine Skala mit 5 Stufen benötigt; diese hat ${size} Stufen.`);
  return ok(gradesKind);
}
