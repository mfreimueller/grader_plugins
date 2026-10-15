import { describe, expect, it } from 'vitest';
import { parseAssignments, sortAssignments, type Assignment } from '../../src/core/classroom50';
import { deriveAssignmentRange, resolveOverride, toLocalInput } from '../../src/core/assignmentRange';
import { assignmentsJson } from './classroomFixtures';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-20T10:00:00Z');
const sorted = sortAssignments(parseAssignments('k', assignmentsJson()));
const bySlug = (slug: string): Assignment => {
  const found = sorted.find((a) => a.slug === slug);
  if (found === undefined) throw new Error(slug);
  return found;
};

describe('deriveAssignmentRange', () => {
  it('runs from available_from to the deadline', () => {
    expect(deriveAssignmentRange(bySlug('01-movie-archive'), sorted, NOW)).toEqual({
      from: new Date('2026-10-08T09:00:00Z'),
      to: new Date('2026-10-19T05:59:00Z'),
    });
  });

  it('caps the end at now while the deadline is still ahead', () => {
    const early = new Date('2026-10-10T00:00:00Z');
    expect(deriveAssignmentRange(bySlug('01-movie-archive'), sorted, early).to).toEqual(early);
  });

  it('starts at the previous assignment deadline without available_from', () => {
    const assignment: Assignment = { slug: 'x', name: 'x', mode: 'individual', due: new Date('2026-11-01T00:00:00Z'), availableFrom: null };
    const list = sortAssignments([...sorted, assignment]);
    expect(deriveAssignmentRange(assignment, list, new Date('2026-11-05T00:00:00Z')).from).toEqual(new Date('2026-10-19T05:59:00Z'));
  });

  it('uses now for an undated assignment and starts at the last deadline before it', () => {
    expect(deriveAssignmentRange(bySlug('03-bowling-kata'), sorted, NOW)).toEqual({ from: new Date('2026-10-19T05:59:00Z'), to: NOW });
  });

  it('falls back to 14 days before the end when nothing else is known', () => {
    const only: Assignment = { slug: 'x', name: 'x', mode: 'individual', due: null, availableFrom: null };
    expect(deriveAssignmentRange(only, [only], NOW)).toEqual({ from: new Date(NOW.getTime() - 14 * DAY), to: NOW });
  });
});

describe('resolveOverride', () => {
  const now = new Date(2026, 9, 20, 12, 0);

  it('reads local date and time', () => {
    const result = resolveOverride('2026-10-08T11:00', '2026-10-19T07:59', now);
    expect(result).toEqual({ ok: true, value: { from: new Date(2026, 9, 8, 11, 0), to: new Date(2026, 9, 19, 7, 59) } });
  });

  it('caps the end at now', () => {
    const result = resolveOverride('2026-10-08T11:00', '2026-12-01T00:00', now);
    expect(result).toEqual({ ok: true, value: { from: new Date(2026, 9, 8, 11, 0), to: now } });
  });

  it('rejects garbage and a start behind the end', () => {
    expect(resolveOverride('', '2026-10-19T07:59', now).ok).toBe(false);
    expect(resolveOverride('2026-10-08T11:00', 'x', now).ok).toBe(false);
    expect(resolveOverride('2026-10-19T07:59', '2026-10-08T11:00', now).ok).toBe(false);
  });

  it('round-trips through toLocalInput', () => {
    const d = new Date(2026, 9, 8, 11, 5);
    expect(toLocalInput(d)).toBe('2026-10-08T11:05');
  });
});
