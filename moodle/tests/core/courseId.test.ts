import { describe, expect, it } from 'vitest';
import { parseMoodleCourseId } from '../../src/core/courseId';

describe('parseMoodleCourseId', () => {
  it('accepts a plain number', () => {
    expect(parseMoodleCourseId(' 12706 ')).toEqual({ ok: true, value: 12706 });
  });

  it('accepts a course url', () => {
    expect(parseMoodleCourseId('https://moodle.spengergasse.at/course/view.php?id=12706')).toEqual({ ok: true, value: 12706 });
  });

  it('rejects empty input, zero and non-numeric ids', () => {
    for (const input of ['', '0', 'abc', 'https://moodle.spengergasse.at/course/view.php?id=x', 'https://moodle.spengergasse.at/', 'https://a.at/?id=0']) {
      expect(parseMoodleCourseId(input).ok).toBe(false);
    }
  });
});
