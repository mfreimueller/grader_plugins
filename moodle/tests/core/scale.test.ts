import { describe, expect, it } from 'vitest';
import { graderSymbolText, labelAt, stripLabelSuffix, verifyLabelScale } from '../../src/core/scale';

const item = (graderaw: number | null, gradeformatted: string, grademax = 3) => ({ graderaw, gradeformatted, grademax });
const spec = { labels: ['a', 'b', 'c'], mismatch: (i: number, actual: string, expected: string | null) => `${i}/${actual}/${expected}` };

describe('graderSymbolText', () => {
  it('shows the Grader symbols', () => {
    expect(['PLUS', 'PLUS_WELLE', 'WELLE', 'MINUS_WELLE', 'MINUS'].map(graderSymbolText)).toEqual(['+', '+~', '~', '−~', '−']);
  });

  it('passes unknown symbols and handles none', () => {
    expect(graderSymbolText('X')).toBe('X');
    expect(graderSymbolText(null)).toBe('');
  });
});

describe('labelAt', () => {
  it('returns the label of a 1-based index and null outside', () => {
    expect([1, 2, 3].map((i) => labelAt(['a', 'b', 'c'], i))).toEqual(['a', 'b', 'c']);
    expect(labelAt(['a'], 0)).toBeNull();
    expect(labelAt(['a'], 2)).toBeNull();
    expect(labelAt(['a'], 1.5)).toBeNull();
  });
});

describe('stripLabelSuffix', () => {
  it('removes a parenthesised suffix', () => {
    expect(stripLabelSuffix('-- (mm)')).toBe('--');
    expect(stripLabelSuffix('+ (p)')).toBe('+');
  });

  it('keeps labels without suffix', () => {
    expect(stripLabelSuffix(' ~ ')).toBe('~');
  });
});

describe('verifyLabelScale', () => {
  it('accepts matching labels and ignores ungraded items', () => {
    expect(verifyLabelScale([item(1, 'a (x)'), item(null, 'zzz'), item(3, 'c')], spec).ok).toBe(true);
  });

  it('reports the caller message for a contradiction or an index outside the scale', () => {
    expect(verifyLabelScale([item(2, 'c')], spec)).toEqual({ ok: false, error: '2/c/b' });
    expect(verifyLabelScale([item(7, 'c')], spec)).toEqual({ ok: false, error: '7/c/null' });
  });

  it('refuses a wrong item count and nothing to check', () => {
    expect(verifyLabelScale([item(null, '-', 5)], spec).ok).toBe(false);
    expect(verifyLabelScale([], spec).ok).toBe(false);
  });
});
