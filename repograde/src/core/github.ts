/**
 * GitHub GraphQL access: the queries are ported unchanged from repograde.py. Pure apart from `fetch`, which is
 * injected so tests never touch the network. The token only ever travels in the Authorization header.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const GRAPHQL_URL = 'https://api.github.com/graphql';
const DEFAULT_CONCURRENCY = 4;

export const BRANCHES_QUERY = `
query($owner: String!, $name: String!, $since: GitTimestamp!, $until: GitTimestamp!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    refs(refPrefix: "refs/heads/", first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        target { ...History }
      }
    }
  }
}
fragment History on Commit {
  history(since: $since, until: $until, first: 100) {
    pageInfo { hasNextPage endCursor }
    nodes { oid additions deletions parents { totalCount } }
  }
}
`;

export const HISTORY_QUERY = `
query($owner: String!, $name: String!, $branch: String!, $since: GitTimestamp!, $until: GitTimestamp!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    ref(qualifiedName: $branch) {
      target {
        ... on Commit {
          history(since: $since, until: $until, first: 100, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes { oid additions deletions parents { totalCount } }
          }
        }
      }
    }
  }
}
`;

/** Not part of repograde.py (which uses `gh repo list`): the same listing through GraphQL, for a user or an organization. */
export const REPOS_QUERY = `
query($owner: String!, $cursor: String) {
  repositoryOwner(login: $owner) {
    repositories(first: 100, after: $cursor, orderBy: { field: NAME, direction: ASC }) {
      pageInfo { hasNextPage endCursor }
      nodes { name }
    }
  }
}
`;

const VIEWER_QUERY = 'query { viewer { login } }';

/** The token was refused (or is missing). */
export class GithubAuthError extends Error {
  constructor(message = 'GitHub hat das Token abgelehnt. Bitte ein gültiges Token eintragen.') {
    super(message);
    this.name = 'GithubAuthError';
  }
}

/** GitHub answered with an error, or could not be reached, or the answer had an unexpected shape. */
export class GithubApiError extends Error {
  constructor(
    message: string,
    /** The HTTP status, when the error came from one. */
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'GithubApiError';
  }
}

export interface QueryOptions {
  /** Aliased lookups of things that may not exist: `NOT_FOUND` errors are not fatal, the field is just null. */
  tolerateNotFound?: boolean;
}

export interface GithubClient {
  query(query: string, variables: Record<string, unknown>, options?: QueryOptions): Promise<unknown>;
}

export function createGithubClient(options: { token: string; fetch?: FetchLike }): GithubClient {
  const token = options.token.trim();
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  return {
    async query(query, variables, options = {}) {
      if (token === '') throw new GithubAuthError('Es ist kein GitHub-Token gespeichert.');
      let response: Response;
      try {
        response = await doFetch(GRAPHQL_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables }),
        });
      } catch {
        throw new GithubApiError('GitHub ist nicht erreichbar (Netzwerkfehler).');
      }
      if (response.status === 401) throw new GithubAuthError();
      if (!response.ok) throw new GithubApiError(`GitHub antwortete mit HTTP ${response.status}.`, response.status);
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new GithubApiError('GitHub lieferte eine unlesbare Antwort.');
      }
      return unwrapBody(body, options.tolerateNotFound === true);
    },
  };
}

function unwrapBody(body: unknown, tolerateNotFound: boolean): unknown {
  if (!isRecord(body)) throw new GithubApiError('GitHub lieferte eine unerwartete Antwort.');
  const all = Array.isArray(body.errors) ? body.errors : [];
  const errors = tolerateNotFound ? all.filter((e) => !(isRecord(e) && e.type === 'NOT_FOUND')) : all;
  if (errors.length > 0) {
    const forbidden = errors.some((e) => isRecord(e) && e.type === 'FORBIDDEN');
    if (forbidden) throw new GithubApiError('GitHub verweigert den Zugriff (Berechtigung fehlt).', 403);
    const messages = errors.map((e) => (isRecord(e) && typeof e.message === 'string' ? e.message : 'Unbekannter Fehler'));
    throw new GithubApiError(messages.join('; '));
  }
  if (!('data' in body)) throw new GithubApiError('GitHub lieferte eine Antwort ohne Daten.');
  return body.data;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unexpected(): never {
  throw new GithubApiError('GitHub lieferte eine unerwartete Antwort.');
}

export function field(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : unexpected();
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

function pageInfoOf(value: unknown): PageInfo {
  const hasNextPage = field(value, 'hasNextPage');
  const endCursor = field(value, 'endCursor');
  if (typeof hasNextPage !== 'boolean') return unexpected();
  if (endCursor !== null && typeof endCursor !== 'string') return unexpected();
  return { hasNextPage, endCursor };
}

export function nodesOf(value: unknown): unknown[] {
  const nodes = field(value, 'nodes');
  return Array.isArray(nodes) ? nodes : unexpected();
}

export async function verifyToken(client: GithubClient): Promise<string> {
  const login = field(field(await client.query(VIEWER_QUERY, {}), 'viewer'), 'login');
  return typeof login === 'string' ? login : unexpected();
}

/** Names of the repositories of `owner` (organization or user) that start with `prefix`, sorted. */
export async function listOrgRepos(client: GithubClient, owner: string, prefix: string): Promise<string[]> {
  const names: string[] = [];
  let cursor: string | null = null;
  for (;;) {
    const data = await client.query(REPOS_QUERY, { owner, cursor });
    const owned = field(data, 'repositoryOwner');
    if (owned === null) throw new GithubApiError(`Die Organisation „${owner}“ wurde nicht gefunden.`);
    const repositories = field(owned, 'repositories');
    for (const node of nodesOf(repositories)) {
      const name = field(node, 'name');
      if (typeof name !== 'string') return unexpected();
      if (name.startsWith(prefix)) names.push(name);
    }
    const page = pageInfoOf(field(repositories, 'pageInfo'));
    if (!page.hasNextPage) return names.sort();
    cursor = page.endCursor;
  }
}

export interface RepoTotals {
  added: number;
  removed: number;
  commits: number;
}

type CommitStats = Map<string, [number, number]>;

function collectCommits(history: unknown, commits: CommitStats): void {
  for (const node of nodesOf(history)) {
    const oid = field(node, 'oid');
    const additions = field(node, 'additions');
    const deletions = field(node, 'deletions');
    const parents = field(field(node, 'parents'), 'totalCount');
    if (typeof oid !== 'string' || typeof additions !== 'number' || typeof deletions !== 'number' || typeof parents !== 'number') {
      return unexpected();
    }
    // git log --numstat shows no diff for merge commits, so they are skipped here as well
    if (parents <= 1) commits.set(oid, [additions, deletions]);
  }
}

/** Lines added and removed by all non-merge commits in range on all branches, each commit counted once. */
export async function fetchRepoTotals(
  client: GithubClient,
  owner: string,
  repo: string,
  since: Date,
  until: Date,
): Promise<RepoTotals> {
  const commits: CommitStats = new Map();
  const range = { since: since.toISOString(), until: until.toISOString() };
  let cursor: string | null = null;

  for (;;) {
    const data = await client.query(BRANCHES_QUERY, { owner, name: repo, ...range, cursor });
    const repository = field(data, 'repository');
    const refs = field(repository, 'refs');

    for (const branch of nodesOf(refs)) {
      const name = field(branch, 'name');
      if (typeof name !== 'string') return unexpected();
      let history: unknown = field(field(branch, 'target'), 'history');
      while (history !== undefined && history !== null) {
        collectCommits(history, commits);
        const page = pageInfoOf(field(history, 'pageInfo'));
        if (!page.hasNextPage) break;
        const next = await client.query(HISTORY_QUERY, {
          owner,
          name: repo,
          branch: `refs/heads/${name}`,
          ...range,
          cursor: page.endCursor,
        });
        history = field(field(field(field(next, 'repository'), 'ref'), 'target'), 'history');
      }
    }

    const page = pageInfoOf(field(refs, 'pageInfo'));
    if (!page.hasNextPage) break;
    cursor = page.endCursor;
  }

  let added = 0;
  let removed = 0;
  for (const [a, d] of commits.values()) {
    added += a;
    removed += d;
  }
  return { added, removed, commits: commits.size };
}

/** The result of one repository: its totals, or the reason it could not be read. */
export interface RepoOutcome {
  repo: string;
  added: number;
  removed: number;
  error: string | null;
}

export interface FetchAllOptions {
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Totals for every repository, a few at a time. A failing repository becomes an outcome with an error; a refused
 * token aborts the whole run, because every other repository would fail the same way.
 */
export async function fetchAllRepoTotals(
  client: GithubClient,
  owner: string,
  repos: string[],
  since: Date,
  until: Date,
  options: FetchAllOptions = {},
): Promise<RepoOutcome[]> {
  const outcomes: RepoOutcome[] = new Array<RepoOutcome>(repos.length);
  let next = 0;
  let done = 0;
  let fatal: GithubAuthError | null = null;

  const worker = async (): Promise<void> => {
    while (fatal === null) {
      const index = next++;
      const repo = repos[index];
      if (repo === undefined) return;
      try {
        const totals = await fetchRepoTotals(client, owner, repo, since, until);
        outcomes[index] = { repo, added: totals.added, removed: totals.removed, error: null };
      } catch (error) {
        if (error instanceof GithubAuthError) {
          fatal = error;
          return;
        }
        const message = error instanceof GithubApiError ? error.message : 'Unbekannter Fehler beim Lesen des Repositories.';
        outcomes[index] = { repo, added: 0, removed: 0, error: message };
      }
      options.onProgress?.(++done, repos.length);
    }
  };

  const workers = Math.max(1, Math.min(options.concurrency ?? DEFAULT_CONCURRENCY, repos.length));
  await Promise.all(Array.from({ length: workers }, worker));
  if (fatal !== null) throw fatal;
  return outcomes;
}
