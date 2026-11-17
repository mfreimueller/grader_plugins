import { describe, expect, it } from 'vitest';
import { BridgeFailure, errorText, toPlain, unwrap } from '../../src/core/bridge';

describe('bridge helpers', () => {
  it('unwraps values and throws on refusal', () => {
    expect(unwrap({ ok: true, value: 1 })).toBe(1);
    expect(() => unwrap({ ok: false, error: { code: 'VALIDATION', message: 'nein' } })).toThrow(BridgeFailure);
  });

  it('describes errors', () => {
    expect(errorText(new BridgeFailure('INTERNAL', 'a'))).toBe('a');
    expect(errorText(new Error('b'))).toBe('b');
    expect(errorText(7)).toBe('Unbekannter Fehler.');
  });

  it('copies to plain data', () => {
    expect(toPlain({ a: [1] })).toEqual({ a: [1] });
  });
});
