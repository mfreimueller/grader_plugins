import type { SessionTarget } from '../window';

/** What Grader keeps about the previous run of a course. Dates are ISO timestamps. */
export interface LastRun {
  from: string;
  to: string;
  assessmentIds: string[];
}

export type RangeMode = 'sinceLastRun' | 'manual';
export type SessionMode = 'endOfRange' | 'today';

export interface RangeRequest {
  mode: RangeMode;
  lastRun: LastRun | null;
  now: Date;
  /** Local calendar day of `now`, `YYYY-MM-DD` (Grader's `context().today`). */
  today: string;
  /** `YYYY-MM-DD`, used in manual mode. */
  manualFrom: string;
  manualTo: string;
}

export interface DateRange {
  from: Date;
  to: Date;
}

export type RangeResult = { ok: true; value: DateRange } | { ok: false; error: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_RUN_DAYS = 7;

const pad = (n: number): string => String(n).padStart(2, '0');

/** The local calendar day, `YYYY-MM-DD`. */
export function localDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDay(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(y, m - 1, d);
  return check.getFullYear() === y && check.getMonth() === m - 1 && check.getDate() === d ? { y, m, d } : null;
}

export function resolveRange(request: RangeRequest): RangeResult {
  return request.mode === 'sinceLastRun' ? sinceLastRun(request) : manualRange(request);
}

function sinceLastRun({ lastRun, now }: RangeRequest): RangeResult {
  if (lastRun === null) {
    return { ok: true, value: { from: new Date(now.getTime() - FIRST_RUN_DAYS * DAY_MS), to: now } };
  }
  const from = new Date(lastRun.to);
  if (Number.isNaN(from.getTime())) return { ok: false, error: 'Das Ende des letzten Laufs ist nicht lesbar.' };
  if (from.getTime() >= now.getTime()) return { ok: false, error: 'Der letzte Lauf endet in der Zukunft.' };
  return { ok: true, value: { from, to: now } };
}

function manualRange({ manualFrom, manualTo, now, today }: RangeRequest): RangeResult {
  const from = parseDay(manualFrom);
  const to = parseDay(manualTo);
  if (from === null) return { ok: false, error: 'Bitte ein gültiges Startdatum angeben.' };
  if (to === null) return { ok: false, error: 'Bitte ein gültiges Enddatum angeben.' };
  if (manualFrom > today || manualTo > today) return { ok: false, error: 'Die Daten dürfen nicht in der Zukunft liegen.' };
  if (manualFrom > manualTo) return { ok: false, error: 'Das Startdatum liegt nach dem Enddatum.' };
  const end = new Date(to.y, to.m - 1, to.d, 23, 59, 59, 999);
  return {
    ok: true,
    value: { from: new Date(from.y, from.m - 1, from.d, 0, 0, 0, 0), to: end.getTime() > now.getTime() ? now : end },
  };
}

/** Which Grader session the assessments of the range land in. */
export function sessionTarget(mode: SessionMode, range: DateRange): SessionTarget {
  return mode === 'today' ? { kind: 'today' } : { kind: 'date', date: localDate(range.to) };
}

const dayMonth = (date: Date): string => `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.`;

/** Title of the assessments, e.g. `Commits 01.10.–08.10.`. */
export function formatRangeTitle(range: DateRange): string {
  return `Commits ${dayMonth(range.from)}–${dayMonth(range.to)}`;
}
