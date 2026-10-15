import { describe, expect, it } from 'vitest';
import {
  formatRangeTitle,
  localDate,
  resolveRange,
  sessionTarget,
  type RangeRequest,
} from '../../src/core/range';

// Local-time dates, so the tests hold in every time zone.
const NOW = new Date(2026, 9, 14, 15, 30, 0);
const TODAY = '2026-10-14';
const DAY = 24 * 60 * 60 * 1000;

const resolve = (request: Partial<RangeRequest>) =>
  resolveRange({ mode: 'sinceLastRun', lastRun: null, now: NOW, today: TODAY, manualFrom: '', manualTo: '', ...request });

describe('resolveRange', () => {
  describe('since the last run', () => {
    it('runs from the end of the last run until now', () => {
      const lastTo = new Date(2026, 9, 8, 12, 0, 0);
      const result = resolve({ lastRun: { from: new Date(2026, 9, 1).toISOString(), to: lastTo.toISOString(), assessmentIds: [] } });
      expect(result).toEqual({ ok: true, value: { from: lastTo, to: NOW } });
    });

    it('defaults to the last 7 days on the first run', () => {
      const result = resolve({});
      expect(result).toEqual({ ok: true, value: { from: new Date(NOW.getTime() - 7 * DAY), to: NOW } });
    });

    it('refuses a last run that ends in the future', () => {
      const result = resolve({ lastRun: { from: NOW.toISOString(), to: new Date(NOW.getTime() + DAY).toISOString(), assessmentIds: [] } });
      expect(result.ok).toBe(false);
    });

    it('refuses an unreadable stored date', () => {
      expect(resolve({ lastRun: { from: 'x', to: 'nonsense', assessmentIds: [] } }).ok).toBe(false);
    });
  });

  describe('manual range', () => {
    it('covers the first day from its start to the end of the last day', () => {
      const result = resolve({ mode: 'manual', manualFrom: '2026-10-01', manualTo: '2026-10-08' });
      expect(result).toEqual({
        ok: true,
        value: { from: new Date(2026, 9, 1, 0, 0, 0, 0), to: new Date(2026, 9, 8, 23, 59, 59, 999) },
      });
    });

    it('caps today at the current moment', () => {
      const result = resolve({ mode: 'manual', manualFrom: '2026-10-10', manualTo: TODAY });
      expect(result).toMatchObject({ ok: true, value: { to: NOW } });
    });

    it('refuses an end date after today', () => {
      expect(resolve({ mode: 'manual', manualFrom: '2026-10-10', manualTo: '2026-10-15' }).ok).toBe(false);
    });

    it('refuses a start date after today', () => {
      expect(resolve({ mode: 'manual', manualFrom: '2026-10-15', manualTo: '2026-10-15' }).ok).toBe(false);
    });

    it('refuses a start after the end', () => {
      expect(resolve({ mode: 'manual', manualFrom: '2026-10-09', manualTo: '2026-10-08' }).ok).toBe(false);
    });

    it('accepts a single day', () => {
      expect(resolve({ mode: 'manual', manualFrom: '2026-10-08', manualTo: '2026-10-08' }).ok).toBe(true);
    });

    it.each(['', '2026-13-01', '2026-02-30', '01.10.2026'])('refuses the invalid date "%s"', (bad) => {
      expect(resolve({ mode: 'manual', manualFrom: bad, manualTo: '2026-10-08' }).ok).toBe(false);
      expect(resolve({ mode: 'manual', manualFrom: '2026-10-01', manualTo: bad }).ok).toBe(false);
    });
  });
});

describe('sessionTarget', () => {
  const range = { from: new Date(2026, 9, 1), to: new Date(2026, 9, 8, 23, 59, 59, 999) };

  it('uses the end date of the range', () => {
    expect(sessionTarget('endOfRange', range)).toEqual({ kind: 'date', date: '2026-10-08' });
  });

  it('uses today', () => {
    expect(sessionTarget('today', range)).toEqual({ kind: 'today' });
  });
});

describe('formatRangeTitle', () => {
  it('writes both days as DD.MM.', () => {
    expect(formatRangeTitle({ from: new Date(2026, 9, 1, 8), to: new Date(2026, 9, 8, 12) })).toBe('Commits 01.10.–08.10.');
  });
});

describe('localDate', () => {
  it('formats the local calendar day', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
