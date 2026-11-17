import { describe, expect, it } from 'vitest';
import { clearToken, deleteLink, loadCourseId, loadLink, loadStudentMap, loadToken, parseCourseIdValue, parseLink, parseStudentMap, saveCourseId, saveLink, saveStudentMap, saveToken } from '../../src/core/store';
import { BridgeFailure } from '../../src/core/bridge';
import type { GraderPluginApi, PluginResult } from '../../src/window';

function fakeGrader(failing = false): { grader: GraderPluginApi; data: Map<string, unknown>; secrets: Map<string, string> } {
  const data = new Map<string, unknown>();
  const secrets = new Map<string, string>();
  const fail = <T>(): PluginResult<T> => ({ ok: false, error: { code: 'INTERNAL', message: 'kaputt' } });
  const grader = {
    storage: {
      get: async (k: string) => (failing ? fail() : { ok: true, value: data.get(k) ?? null }),
      set: async (k: string, v: unknown) => { data.set(k, v); return failing ? fail<void>() : { ok: true, value: undefined }; },
      delete: async (k: string) => { data.delete(k); return { ok: true, value: undefined }; },
    },
    secrets: {
      get: async (k: string) => (failing ? fail() : { ok: true, value: secrets.get(k) ?? null }),
      set: async (k: string, v: string) => { secrets.set(k, v); return { ok: true, value: undefined }; },
      delete: async (k: string) => { secrets.delete(k); return { ok: true, value: undefined }; },
    },
  } as unknown as GraderPluginApi;
  return { grader, data, secrets };
}

describe('parsers', () => {
  it('parseCourseIdValue accepts positive integers only', () => {
    expect(parseCourseIdValue(12706)).toBe(12706);
    for (const v of [0, -1, 1.5, '5', null]) expect(parseCourseIdValue(v)).toBeNull();
  });

  it('parseLink accepts positive integers only', () => {
    expect(parseLink(4)).toBe(4);
    expect(parseLink('x')).toBeNull();
  });

  it('parseStudentMap keeps valid entries', () => {
    expect(parseStudentMap({ a: 1, b: 'x', c: 0 })).toEqual({ a: 1 });
    expect(parseStudentMap(null)).toEqual({});
    expect(parseStudentMap([1])).toEqual({});
  });
});

describe('persistence', () => {
  it('round-trips the course id, links and student map', async () => {
    const { grader, data } = fakeGrader();
    expect(await loadCourseId(grader)).toBeNull();
    await saveCourseId(grader, 12706);
    expect(await loadCourseId(grader)).toBe(12706);
    expect(await loadLink(grader, 'as1')).toBeNull();
    await saveLink(grader, 'as1', 9);
    expect(data.get('link:as1')).toBe(9);
    expect(await loadLink(grader, 'as1')).toBe(9);
    await deleteLink(grader, 'as1');
    expect(await loadLink(grader, 'as1')).toBeNull();
    await saveStudentMap(grader, { a: 1 });
    expect(await loadStudentMap(grader)).toEqual({ a: 1 });
  });

  it('stores the token as a secret', async () => {
    const { grader, secrets } = fakeGrader();
    expect(await loadToken(grader)).toBeNull();
    await saveToken(grader, 'tok');
    expect(secrets.get('moodle.token')).toBe('tok');
    expect(await loadToken(grader)).toBe('tok');
    await clearToken(grader);
    expect(await loadToken(grader)).toBeNull();
  });

  it('throws a BridgeFailure when Grader refuses', async () => {
    const { grader } = fakeGrader(true);
    await expect(loadCourseId(grader)).rejects.toBeInstanceOf(BridgeFailure);
    await expect(saveCourseId(grader, 1)).rejects.toBeInstanceOf(BridgeFailure);
  });
});
