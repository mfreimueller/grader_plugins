import { describe, expect, it } from 'vitest';
import { gradeRepos, withoutAbsent, type GradingInput } from '../../src/core/grading';
import type { PluginStudent } from '../../src/window';

const student = (id: string, firstName = id, lastName = 'Muster'): PluginStudent => ({ id, firstName, lastName, color: null });
const ok = (repo: string, added: number, removed: number) => ({ repo, added, removed, error: null });
const failed = (repo: string) => ({ repo, added: 0, removed: 0, error: 'boom' });

const input = (overrides: Partial<GradingInput> = {}): GradingInput => ({
  outcomes: [],
  repoMapping: {},
  minimumCommitSize: 50,
  prefix: 'team-',
  students: [student('s1'), student('s2'), student('s3')],
  ...overrides,
});

describe('gradeRepos', () => {
  describe('pass/fail per repository', () => {
    it('passes when added + removed reaches the minimum exactly', () => {
      const { rows } = gradeRepos(input({ outcomes: [ok('team-a', 30, 20)], repoMapping: { 'team-a': ['s1'] } }));
      expect(rows[0]).toMatchObject({ added: 30, removed: 20, total: 50, passes: true });
    });

    it('fails one line below the minimum', () => {
      const { rows } = gradeRepos(input({ outcomes: [ok('team-a', 30, 19)], repoMapping: { 'team-a': ['s1'] } }));
      expect(rows[0]).toMatchObject({ total: 49, passes: false });
    });

    it('counts removed lines like added lines', () => {
      const { rows } = gradeRepos(input({ outcomes: [ok('team-a', 0, 80)], repoMapping: { 'team-a': ['s1'] } }));
      expect(rows[0]?.passes).toBe(true);
    });

    it('strips the prefix from the project name', () => {
      const { rows } = gradeRepos(input({ outcomes: [ok('team-wetter-app', 1, 1)] }));
      expect(rows[0]?.projectName).toBe('wetter-app');
    });
  });

  describe('team grading', () => {
    it('gives every student of a repository its grade', () => {
      const { grades } = gradeRepos(
        input({ outcomes: [ok('team-a', 100, 0), ok('team-b', 1, 0)], repoMapping: { 'team-a': ['s1', 's2'], 'team-b': ['s3'] } }),
      );
      expect(grades).toEqual([
        { studentId: 's1', symbol: 'PLUS', repo: 'team-a' },
        { studentId: 's2', symbol: 'PLUS', repo: 'team-a' },
        { studentId: 's3', symbol: 'MINUS', repo: 'team-b' },
      ]);
    });

    it('lists the student names of a repository', () => {
      const { rows } = gradeRepos(
        input({ outcomes: [ok('team-a', 100, 0)], repoMapping: { 'team-a': ['s2', 's1'] }, students: [student('s1', 'Anna', 'Berg'), student('s2', 'Ben', 'Adler')] }),
      );
      expect(rows[0]?.studentNames).toEqual(['Anna Berg', 'Ben Adler']);
    });

    it('ignores mapped ids that are not students of the course', () => {
      const { grades, rows } = gradeRepos(input({ outcomes: [ok('team-a', 100, 0)], repoMapping: { 'team-a': ['s1', 'gone'] } }));
      expect(grades.map((g) => g.studentId)).toEqual(['s1']);
      expect(rows[0]?.studentIds).toEqual(['s1']);
    });
  });

  describe('unmapped repositories and students', () => {
    it('shows a repository without students and grades nobody for it', () => {
      const result = gradeRepos(input({ outcomes: [ok('team-a', 100, 0)] }));
      expect(result.rows).toHaveLength(1);
      expect(result.grades).toEqual([]);
      expect(result.unmappedRepos).toEqual(['team-a']);
    });

    it('lists the students without a repository', () => {
      const result = gradeRepos(input({ outcomes: [ok('team-a', 100, 0)], repoMapping: { 'team-a': ['s1'] } }));
      expect(result.studentsWithoutRepo.map((s) => s.id)).toEqual(['s2', 's3']);
    });

    it('ignores mappings of repositories that were not read', () => {
      const result = gradeRepos(input({ outcomes: [], repoMapping: { 'team-old': ['s1'] } }));
      expect(result.grades).toEqual([]);
      expect(result.studentsWithoutRepo).toHaveLength(3);
    });
  });

  describe('errors', () => {
    it('skips an errored repository and reports it', () => {
      const result = gradeRepos(input({ outcomes: [failed('team-a'), ok('team-b', 100, 0)], repoMapping: { 'team-a': ['s1'], 'team-b': ['s2'] } }));
      expect(result.grades).toEqual([{ studentId: 's2', symbol: 'PLUS', repo: 'team-b' }]);
      expect(result.rows[0]).toMatchObject({ error: 'boom', passes: null });
      expect(result.erroredRepos).toEqual(['team-a']);
    });
  });

  describe('a student in several repositories', () => {
    const mapping = { 'team-a': ['s1'], 'team-b': ['s1'] };

    it('gets PLUS when any repository passes', () => {
      const { grades } = gradeRepos(input({ outcomes: [ok('team-a', 1, 0), ok('team-b', 99, 0)], repoMapping: mapping }));
      expect(grades).toEqual([{ studentId: 's1', symbol: 'PLUS', repo: 'team-b' }]);
    });

    it('gets MINUS when all fail', () => {
      const { grades } = gradeRepos(input({ outcomes: [ok('team-a', 1, 0), ok('team-b', 2, 0)], repoMapping: mapping }));
      expect(grades).toHaveLength(1);
      expect(grades[0]?.symbol).toBe('MINUS');
    });

    it('is skipped when no repository passes and one could not be read', () => {
      const { grades } = gradeRepos(input({ outcomes: [ok('team-a', 1, 0), failed('team-b')], repoMapping: mapping }));
      expect(grades).toEqual([]);
    });

    it('still gets PLUS when one repository passes and another errored', () => {
      const { grades } = gradeRepos(input({ outcomes: [ok('team-a', 99, 0), failed('team-b')], repoMapping: mapping }));
      expect(grades.map((g) => g.symbol)).toEqual(['PLUS']);
    });
  });
});

describe('withoutAbsent', () => {
  const grades = [
    { studentId: 's1', symbol: 'PLUS' as const, repo: 'team-a' },
    { studentId: 's2', symbol: 'MINUS' as const, repo: 'team-a' },
    { studentId: 's3', symbol: 'MINUS' as const, repo: 'team-b' },
  ];

  it('drops the grades of absent students, whatever the symbol', () => {
    expect(withoutAbsent(grades, new Set(['s2', 's1'])).map((g) => g.studentId)).toEqual(['s3']);
  });

  it('keeps everything when nobody is absent', () => {
    expect(withoutAbsent(grades, new Set())).toEqual(grades);
  });
});
