import type { FetchLike } from '../../src/core/moodleClient';

export interface Call {
  url: string;
  method: string;
  contentType: string | undefined;
  body: URLSearchParams;
}

/** A fetch that records requests and answers with the given JSON (or a custom Response-like object). */
export function fakeFetch(answer: (call: Call) => unknown): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    const call: Call = { url, method: init.method, contentType: init.headers['Content-Type'], body: new URLSearchParams(init.body) };
    calls.push(call);
    const value = answer(call);
    if (value instanceof Error) throw value;
    if (typeof value === 'object' && value !== null && '__raw' in value) return (value as { __raw: Awaited<ReturnType<FetchLike>> }).__raw;
    return { ok: true, status: 200, json: async () => value };
  };
  return { fetch, calls };
}
