import { describe, expect, it } from 'vitest';
import {
  BRANCHES_QUERY,
  GithubApiError,
  GithubAuthError,
  HISTORY_QUERY,
  createGithubClient,
  fetchAllRepoTotals,
  fetchRepoTotals,
  listOrgRepos,
  verifyToken,
} from '../../src/core/github';
import { commit, fakeFetch, history, type GraphqlReply, type RecordedRequest } from './fakeGithub';

const SINCE = new Date('2026-10-01T00:00:00.000Z');
const UNTIL = new Date('2026-10-08T12:00:00.000Z');

const refs = (nodes: { name: string; history?: unknown }[], endCursor: string | null = null) => ({
  data: {
    repository: {
      refs: {
        pageInfo: { hasNextPage: endCursor !== null, endCursor },
        nodes: nodes.map((n) => ({ name: n.name, target: n.history ? { history: n.history } : {} })),
      },
    },
  },
});

const totalsFor = async (handler: (r: RecordedRequest) => GraphqlReply) => {
  const { fetch, requests } = fakeFetch(handler);
  const client = createGithubClient({ token: 'tok', fetch });
  const totals = await fetchRepoTotals(client, 'org', 'team-a', SINCE, UNTIL);
  return { totals, requests };
};

describe('createGithubClient', () => {
  describe('query', () => {
    it('posts to the GraphQL endpoint with a bearer token', async () => {
      const { fetch, requests } = fakeFetch(() => ({ data: { viewer: { login: 'me' } } }));
      const client = createGithubClient({ token: 'secret-token', fetch });
      await client.query('query { viewer { login } }', {});
      expect(requests[0]?.url).toBe('https://api.github.com/graphql');
      expect(requests[0]?.authorization).toBe('Bearer secret-token');
    });

    it('throws GithubAuthError on HTTP 401', async () => {
      const { fetch } = fakeFetch(() => ({ status: 401, body: { message: 'Bad credentials' } }));
      const client = createGithubClient({ token: 'bad', fetch });
      await expect(client.query('q', {})).rejects.toBeInstanceOf(GithubAuthError);
    });

    it('throws GithubApiError with the GraphQL error messages', async () => {
      const { fetch } = fakeFetch(() => ({ errors: [{ message: 'Could not resolve' }, { message: 'Second' }] }));
      const client = createGithubClient({ token: 't', fetch });
      await expect(client.query('q', {})).rejects.toThrow('Could not resolve; Second');
    });

    it('throws GithubApiError on another HTTP status', async () => {
      const { fetch } = fakeFetch(() => ({ status: 502 }));
      const client = createGithubClient({ token: 't', fetch });
      await expect(client.query('q', {})).rejects.toBeInstanceOf(GithubApiError);
    });

    it('throws GithubApiError when the network fails, never mentioning the token', async () => {
      const client = createGithubClient({
        token: 'secret-token',
        fetch: async () => {
          throw new TypeError('Failed to fetch');
        },
      });
      const error = await client.query('q', {}).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(GithubApiError);
      expect((error as Error).message).not.toContain('secret-token');
    });

    it('rejects an empty token as an authentication error', async () => {
      const { fetch } = fakeFetch(() => ({ data: {} }));
      const client = createGithubClient({ token: '  ', fetch });
      await expect(client.query('q', {})).rejects.toBeInstanceOf(GithubAuthError);
    });
  });
});

describe('verifyToken', () => {
  it('returns the login of the token owner', async () => {
    const { fetch } = fakeFetch(() => ({ data: { viewer: { login: 'teacher' } } }));
    expect(await verifyToken(createGithubClient({ token: 't', fetch }))).toBe('teacher');
  });
});

describe('listOrgRepos', () => {
  const page = (names: string[], endCursor: string | null) => ({
    data: {
      repositoryOwner: {
        repositories: {
          pageInfo: { hasNextPage: endCursor !== null, endCursor },
          nodes: names.map((name) => ({ name })),
        },
      },
    },
  });

  it('follows pagination, filters by prefix and sorts', async () => {
    const { fetch, requests } = fakeFetch((r) =>
      r.variables.cursor === null
        ? page(['team-z', 'other', 'team-a'], 'c1')
        : page(['team-m', 'Team-x'], null),
    );
    const repos = await listOrgRepos(createGithubClient({ token: 't', fetch }), 'org', 'team-');
    expect(repos).toEqual(['team-a', 'team-m', 'team-z']);
    expect(requests).toHaveLength(2);
    expect(requests[1]?.variables.cursor).toBe('c1');
    expect(requests[0]?.variables.owner).toBe('org');
  });

  it('throws when the organization does not exist', async () => {
    const { fetch } = fakeFetch(() => ({ data: { repositoryOwner: null } }));
    await expect(listOrgRepos(createGithubClient({ token: 't', fetch }), 'nope', '')).rejects.toBeInstanceOf(
      GithubApiError,
    );
  });
});

describe('fetchRepoTotals', () => {
  it('sums additions and deletions of a single branch', async () => {
    const { totals, requests } = await totalsFor(() =>
      refs([{ name: 'main', history: history([commit('a', 10, 2), commit('b', 5, 1)]) }]),
    );
    expect(totals).toEqual({ added: 15, removed: 3, commits: 2 });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.query).toBe(BRANCHES_QUERY);
    expect(requests[0]?.variables).toMatchObject({
      owner: 'org',
      name: 'team-a',
      since: SINCE.toISOString(),
      until: UNTIL.toISOString(),
      cursor: null,
    });
  });

  it('counts a commit reachable from two branches once', async () => {
    const shared = commit('shared', 7, 3);
    const { totals } = await totalsFor(() =>
      refs([
        { name: 'main', history: history([shared, commit('m', 1, 0)]) },
        { name: 'dev', history: history([shared, commit('d', 2, 2)]) },
      ]),
    );
    expect(totals).toEqual({ added: 10, removed: 5, commits: 3 });
  });

  it('skips merge commits', async () => {
    const { totals } = await totalsFor(() =>
      refs([{ name: 'main', history: history([commit('merge', 500, 500, 2), commit('a', 4, 1), commit('root', 3, 0, 0)]) }]),
    );
    expect(totals).toEqual({ added: 7, removed: 1, commits: 2 });
  });

  it('follows the history of a branch with its own query', async () => {
    const { totals, requests } = await totalsFor((r) => {
      if (r.query === BRANCHES_QUERY) {
        return refs([{ name: 'feature/x', history: history([commit('a', 1, 1)], 'h1') }]);
      }
      return {
        data: {
          repository: {
            ref: { target: { history: r.variables.cursor === 'h1' ? history([commit('b', 2, 2)], 'h2') : history([commit('c', 3, 3)]) } },
          },
        },
      };
    });
    expect(totals).toEqual({ added: 6, removed: 6, commits: 3 });
    const followUps = requests.filter((r) => r.query === HISTORY_QUERY);
    expect(followUps.map((r) => r.variables.cursor)).toEqual(['h1', 'h2']);
    expect(followUps[0]?.variables.branch).toBe('refs/heads/feature/x');
  });

  it('follows the branch pagination', async () => {
    const { totals, requests } = await totalsFor((r) =>
      r.variables.cursor === null
        ? refs([{ name: 'main', history: history([commit('a', 1, 0)]) }], 'b1')
        : refs([{ name: 'dev', history: history([commit('b', 0, 1)]) }]),
    );
    expect(totals).toEqual({ added: 1, removed: 1, commits: 2 });
    expect(requests[1]?.variables.cursor).toBe('b1');
  });

  it('ignores a branch whose target has no history', async () => {
    const { totals } = await totalsFor(() => refs([{ name: 'tag-like' }, { name: 'main', history: history([commit('a', 2, 0)]) }]));
    expect(totals).toEqual({ added: 2, removed: 0, commits: 1 });
  });

  it('returns zeros for a repository without commits in range', async () => {
    const { totals } = await totalsFor(() => refs([{ name: 'main', history: history([]) }]));
    expect(totals).toEqual({ added: 0, removed: 0, commits: 0 });
  });

  it('propagates a GraphQL error', async () => {
    await expect(totalsFor(() => ({ errors: [{ message: 'NOT_FOUND' }] }))).rejects.toBeInstanceOf(GithubApiError);
  });

  it('propagates an authentication failure', async () => {
    await expect(totalsFor(() => ({ status: 401 }))).rejects.toBeInstanceOf(GithubAuthError);
  });

  it('throws GithubApiError on an unexpected response shape', async () => {
    await expect(totalsFor(() => ({ data: { repository: null } }))).rejects.toBeInstanceOf(GithubApiError);
  });
});

describe('fetchAllRepoTotals', () => {
  it('collects one outcome per repository, turning an API error into an error outcome', async () => {
    const { fetch } = fakeFetch((r) =>
      r.variables.name === 'team-b'
        ? { errors: [{ message: 'boom' }] }
        : refs([{ name: 'main', history: history([commit('a', 3, 1)]) }]),
    );
    const outcomes = await fetchAllRepoTotals(createGithubClient({ token: 't', fetch }), 'org', ['team-a', 'team-b'], SINCE, UNTIL);
    expect(outcomes).toEqual([
      { repo: 'team-a', added: 3, removed: 1, error: null },
      { repo: 'team-b', added: 0, removed: 0, error: expect.stringContaining('boom') },
    ]);
  });

  it('aborts the whole run on an authentication failure', async () => {
    const { fetch } = fakeFetch(() => ({ status: 401 }));
    await expect(
      fetchAllRepoTotals(createGithubClient({ token: 't', fetch }), 'org', ['a', 'b'], SINCE, UNTIL),
    ).rejects.toBeInstanceOf(GithubAuthError);
  });

  it('reports progress', async () => {
    const { fetch } = fakeFetch(() => refs([]));
    const seen: number[] = [];
    await fetchAllRepoTotals(createGithubClient({ token: 't', fetch }), 'org', ['a', 'b', 'c'], SINCE, UNTIL, {
      onProgress: (done) => seen.push(done),
    });
    expect(seen.at(-1)).toBe(3);
    expect(seen).toHaveLength(3);
  });
});
