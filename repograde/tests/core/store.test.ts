import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseLastRun, parseRepoMapping, parseSettings } from '../../src/core/store';

describe('parseSettings', () => {
  it('returns the defaults for nothing stored', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values and replaces invalid ones with the defaults', () => {
    expect(
      parseSettings({ organization: 'org', prefix: 'team-', minimumCommitSize: -3, categoryId: 7, sessionMode: 'today' }),
    ).toEqual({ ...DEFAULT_SETTINGS, mode: 'manual', organization: 'org', prefix: 'team-', sessionMode: 'today' });
  });

  it('uses Classroom 50 by default and once a classroom is configured', () => {
    expect(parseSettings({ organization: 'org' }).mode).toBe('classroom50');
    expect(parseSettings({ prefix: 'team-', classroom: 'k' }).mode).toBe('classroom50');
    expect(parseSettings({ classroom: 'k', classroomDir: 'd', stateRepo: 'state' })).toMatchObject({ classroom: 'k', classroomDir: 'd', stateRepo: 'state' });
  });

  it('keeps an explicit mode and defaults the state repository', () => {
    expect(parseSettings({ mode: 'manual', classroom: 'k' }).mode).toBe('manual');
    expect(parseSettings({ stateRepo: '  ' }).stateRepo).toBe('classroom50');
  });

  it('rejects an unknown session mode', () => {
    expect(parseSettings({ sessionMode: 'tomorrow' }).sessionMode).toBe('endOfRange');
  });
});

describe('parseRepoMapping', () => {
  it('keeps arrays of strings only', () => {
    expect(parseRepoMapping({ a: ['s1', 2, 's2'], b: 'x', c: [] })).toEqual({ a: ['s1', 's2'] });
  });

  it('returns an empty mapping for garbage', () => {
    expect(parseRepoMapping('nope')).toEqual({});
  });
});

describe('parseLastRun', () => {
  it('reads a complete last run', () => {
    const run = { from: '2026-10-01T00:00:00.000Z', to: '2026-10-08T00:00:00.000Z', assessmentIds: ['a1'] };
    expect(parseLastRun(run)).toEqual(run);
  });

  it('returns null for an incomplete one', () => {
    expect(parseLastRun({ from: 'x' })).toBeNull();
    expect(parseLastRun(undefined)).toBeNull();
  });
});
