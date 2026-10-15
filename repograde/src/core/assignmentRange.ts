import type { Assignment } from './classroom50';
import type { DateRange, RangeResult } from './range';

const DAY_MS = 24 * 60 * 60 * 1000;
const FALLBACK_DAYS = 14;

/**
 * The range an assignment is graded in. `to` is the deadline (commits after it do not count), or now when there
 * is none or it has not passed yet. `from` is the release date, else the deadline of the assignment before it
 * (in `sorted`), else 14 days before `to`.
 */
export function deriveAssignmentRange(assignment: Assignment, sorted: Assignment[], now: Date): DateRange {
  const to = assignment.due !== null && assignment.due.getTime() < now.getTime() ? assignment.due : now;
  if (assignment.availableFrom !== null) return { from: assignment.availableFrom, to };
  const index = sorted.findIndex((a) => a.slug === assignment.slug);
  const previous = sorted
    .slice(0, Math.max(index, 0))
    .reverse()
    .find((a) => a.due !== null);
  return { from: previous?.due ?? new Date(to.getTime() - FALLBACK_DAYS * DAY_MS), to };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DDTHH:mm` in local time, the value format of `<input type="datetime-local">`. */
export function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseLocalInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (m === null) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const date = new Date(y, mo - 1, d, h, mi, 0, 0);
  return date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

/** The (possibly edited) date fields as a range; the end is capped at `now`. */
export function resolveOverride(fromInput: string, toInput: string, now: Date): RangeResult {
  const from = parseLocalInput(fromInput);
  const to = parseLocalInput(toInput);
  if (from === null) return { ok: false, error: 'Bitte einen gültigen Beginn angeben.' };
  if (to === null) return { ok: false, error: 'Bitte ein gültiges Ende angeben.' };
  const end = to.getTime() > now.getTime() ? now : to;
  if (from.getTime() >= end.getTime()) return { ok: false, error: 'Der Beginn liegt nicht vor dem Ende.' };
  return { ok: true, value: { from, to: end } };
}
