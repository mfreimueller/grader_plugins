import { describe, expect, it } from 'vitest';
import { buildSavePayload, escapeNote } from '../../src/core/buildSavePayload';
import { encodeParams } from '../../src/core/moodleClient';
import type { SendRow } from '../../src/core/buildDiff';

const row = (userId: number, targetValue: number, note: string | null): SendRow => ({
  graderStudent: { id: 'g', firstName: 'A', lastName: 'B' }, moodleUserId: userId, sourceText: '+', targetValue, targetLabel: '++',
  currentValue: null, currentLabel: null, note, status: 'new', needsConfirmation: null,
});

describe('escapeNote', () => {
  it('escapes html and turns line breaks into <br>', () => {
    expect(escapeNote('a <b> & "c" \'d\'\r\nz\ny')).toBe('a &lt;b&gt; &amp; &quot;c&quot; &#39;d&#39;<br>z<br>y');
  });
});

describe('buildSavePayload', () => {
  it('omits plugindata when there is no note', () => {
    const p = encodeParams(buildSavePayload(42, [row(5, 3, null)]));
    expect(p.get('assignmentid')).toBe('42');
    expect(p.get('applytoall')).toBe('0');
    expect(p.get('grades[0][userid]')).toBe('5');
    expect(p.get('grades[0][grade]')).toBe('3');
    expect(p.get('grades[0][attemptnumber]')).toBe('-1');
    expect(p.get('grades[0][addattempt]')).toBe('0');
    expect(p.get('grades[0][workflowstate]')).toBe('');
    expect([...p.keys()].some((k) => k.includes('plugindata'))).toBe(false);
  });

  it('sends fractional points as they are', () => {
    expect(encodeParams(buildSavePayload(42, [row(5, 12.5, null)])).get('grades[0][grade]')).toBe('12.5');
  });

  it('adds the escaped note as feedback comment', () => {
    const p = encodeParams(buildSavePayload(42, [row(5, 3, null), row(6, 1, 'a<b\nc')]));
    expect(p.get('grades[1][userid]')).toBe('6');
    expect(p.get('grades[1][plugindata][assignfeedbackcomments_editor][text]')).toBe('a&lt;b<br>c');
    expect(p.get('grades[1][plugindata][assignfeedbackcomments_editor][format]')).toBe('1');
  });
});
