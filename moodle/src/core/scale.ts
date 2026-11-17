import { fail, ok, type Result } from './result';

const SYMBOL_TEXT: ReadonlyMap<string, string> = new Map([
  ['PLUS', '+'],
  ['PLUS_WELLE', '+~'],
  ['WELLE', '~'],
  ['MINUS_WELLE', '−~'],
  ['MINUS', '−'],
]);

/** How Grader shows a symbol; unknown symbols are shown as they are, none as an empty text. */
export function graderSymbolText(symbol: string | null): string {
  return symbol === null ? '' : (SYMBOL_TEXT.get(symbol) ?? symbol);
}

/** Labels may carry a suffix in parentheses, e.g. `-- (mm)`. */
export function stripLabelSuffix(label: string): string {
  return label.replace(/\s*\(.*\)$/, '').trim();
}

/** The label of a 1-based scale index, or null outside the scale. Labels run low to high. */
export function labelAt(labels: readonly string[], index: number): string | null {
  return Number.isInteger(index) ? (labels[index - 1] ?? null) : null;
}

export interface ScaleSample {
  graderaw: number | null;
  gradeformatted: string;
  grademax: number;
}

export interface LabelScaleSpec {
  labels: readonly string[];
  /** Message for a graded entry whose label contradicts the mapping. */
  mismatch: (index: number, actual: string, expected: string | null) => string;
}

export const NO_GRADE_COLUMN = 'Zu dieser Aufgabe wurde keine Notenspalte gefunden. Die Skala kann nicht geprüft werden.';

/**
 * The safety net: every graded entry of the assignment must fit the mapping. Whether an entry is graded
 * is decided on `graderaw` only, because an ungraded item also displays "-" (the same text as a real item).
 */
export function verifyLabelScale(items: readonly ScaleSample[], spec: LabelScaleSpec): Result<void> {
  const size = spec.labels.length;
  if (items.length === 0) return fail(NO_GRADE_COLUMN);
  if (items.some((i) => i.grademax !== size)) return fail(`Die Skala dieser Aufgabe hat nicht ${size} Stufen.`);
  for (const item of items) {
    if (item.graderaw === null) continue;
    const expected = labelAt(spec.labels, item.graderaw);
    if (expected === null || stripLabelSuffix(item.gradeformatted) !== expected) {
      return fail(spec.mismatch(item.graderaw, item.gradeformatted, expected));
    }
  }
  return ok(undefined);
}
