import type { FetchLike } from '../../src/core/github';

export interface RecordedRequest {
  url: string;
  authorization: string | null;
  query: string;
  variables: Record<string, unknown>;
}

export type GraphqlReply =
  | { data: unknown }
  | { errors: { message: string }[] }
  | { status: number; body?: unknown };

/** A fetch that answers GraphQL requests from a handler and records them. No network involved. */
export function fakeFetch(handler: (request: RecordedRequest) => GraphqlReply): {
  fetch: FetchLike;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  const fetch: FetchLike = async (input, init) => {
    const body = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> };
    const headers = new Headers(init?.headers);
    const request: RecordedRequest = {
      url: String(input),
      authorization: headers.get('Authorization'),
      query: body.query,
      variables: body.variables,
    };
    requests.push(request);
    const reply = handler(request);
    if ('status' in reply) {
      return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status });
    }
    return new Response(JSON.stringify(reply), { status: 200 });
  };
  return { fetch, requests };
}

export const commit = (oid: string, additions: number, deletions: number, parents = 1) => ({
  oid,
  additions,
  deletions,
  parents: { totalCount: parents },
});

export const history = (nodes: unknown[], endCursor: string | null = null) => ({
  pageInfo: { hasNextPage: endCursor !== null, endCursor },
  nodes,
});
