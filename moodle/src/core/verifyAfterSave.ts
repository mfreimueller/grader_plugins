import type { SendRow } from './buildDiff';
import { sameValue } from './buildDiff';
import type { TransferKind } from './kinds';
import { stripLabelSuffix } from './scale';
import type { GradeItem } from './types';

export interface Mismatch {
  row: SendRow;
  /** What Moodle holds now; null when ungraded or missing. */
  actualValue: number | null;
  /** The label Moodle shows now (suffix stripped); null when ungraded or missing. */
  actualLabel: string | null;
}

export interface VerifyReport {
  ok: boolean;
  checked: number;
  mismatches: Mismatch[];
  /** Set when a grade was stored with the expected value but Moodle shows another label (scale order differs). */
  scaleMessage: string | null;
}

export const SCALE_MISMATCH_MESSAGE = 'Die Skala in Moodle passt nicht zur Zuordnung – bitte die Noten in Moodle prüfen.';

/** Compares the grade items read back after saving with what was sent: value and, for scales, label. */
export function verifyAfterSave(kind: TransferKind, sent: readonly SendRow[], readBack: readonly GradeItem[]): VerifyReport {
  const byUser = new Map(readBack.map((i) => [i.userId, i]));
  const mismatches: Mismatch[] = [];
  let scaleProblem = false;
  for (const row of sent) {
    const item = byUser.get(row.moodleUserId);
    const actualValue = item?.graderaw ?? null;
    const actualLabel = actualValue === null || item === undefined ? null : stripLabelSuffix(item.gradeformatted);
    const valueOk = actualValue !== null && sameValue(actualValue, row.targetValue);
    const labelOk = !kind.checksLabel || actualLabel === row.targetLabel;
    if (!valueOk || !labelOk) {
      mismatches.push({ row, actualValue, actualLabel });
      if (valueOk) scaleProblem = true;
    }
  }
  return { ok: mismatches.length === 0, checked: sent.length, mismatches, scaleMessage: scaleProblem ? SCALE_MISMATCH_MESSAGE : null };
}
