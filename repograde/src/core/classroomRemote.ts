import { GithubApiError, field, isRecord, type GithubClient } from './github';
import {
  ClassroomFormatError,
  parseAssignments,
  parseClassroom,
  parseRoster,
  type Assignment,
  type Classroom,
  type RosterStudent,
} from './classroom50';

/** Lookups per request; GraphQL aliases keep the number of requests small. */
const CHUNK = 20;

/** The state repository cannot be read: it does not exist, or the token may not see it. */
export class StateRepoError extends Error {
  constructor(owner: string, repo: string) {
    super(
      `Das Repository „${owner}/${repo}“ wurde nicht gefunden oder ist für das Token nicht lesbar. ` +
        `Das Token braucht Lesezugriff (Contents + Metadata) auf dieses Repository.`,
    );
    this.name = 'StateRepoError';
  }
}

const TREE_QUERY = `
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    object(expression: "HEAD:") { ... on Tree { entries { name type } } }
  }
}
`;

/** One query reading several files of the state repository: `f0: object(expression: $e0) { ... on Blob { text } }`. */
export function filesQuery(count: number): string {
  const vars = Array.from({ length: count }, (_, i) => `$e${i}: String!`).join(', ');
  const aliases = Array.from({ length: count }, (_, i) => `f${i}: object(expression: $e${i}) { ... on Blob { text } }`).join('\n    ');
  return `query($owner: String!, $name: String!, ${vars}) {\n  repository(owner: $owner, name: $name) {\n    ${aliases}\n  }\n}`;
}

async function guardState<T>(owner: string, repo: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof GithubApiError && (error.status === 403 || error.status === 404)) throw new StateRepoError(owner, repo);
    throw error;
  }
}

/** Texts of the files (null when a file does not exist), in the order of `paths`. */
export async function readStateFiles(client: GithubClient, owner: string, repo: string, paths: string[]): Promise<(string | null)[]> {
  const texts: (string | null)[] = [];
  for (let start = 0; start < paths.length; start += CHUNK) {
    const chunk = paths.slice(start, start + CHUNK);
    const variables: Record<string, unknown> = { owner, name: repo };
    chunk.forEach((path, i) => (variables[`e${i}`] = `HEAD:${path}`));
    const data = await guardState(owner, repo, () => client.query(filesQuery(chunk.length), variables, { tolerateNotFound: true }));
    const repository = field(data, 'repository');
    if (repository === null) throw new StateRepoError(owner, repo);
    chunk.forEach((_, i) => {
      const blob = field(repository, `f${i}`);
      const content = isRecord(blob) ? blob.text : null;
      texts.push(typeof content === 'string' ? content : null);
    });
  }
  return texts;
}

export interface Discovery {
  classrooms: Classroom[];
  /** Directories with a classroom.json that could not be used, with the reason. */
  problems: string[];
}

/** The classrooms of the state repository: every top-level directory with a classroom.json. */
export async function discoverClassrooms(client: GithubClient, owner: string, repo: string): Promise<Discovery> {
  const data = await guardState(owner, repo, () => client.query(TREE_QUERY, { owner, name: repo }, { tolerateNotFound: true }));
  const repository = field(data, 'repository');
  if (repository === null) throw new StateRepoError(owner, repo);
  const tree = field(repository, 'object');
  const entries = isRecord(tree) && Array.isArray(tree.entries) ? tree.entries : [];
  const dirs = entries
    .filter(isRecord)
    .filter((e) => e.type === 'tree' && typeof e.name === 'string' && !e.name.startsWith('.'))
    .map((e) => String(e.name));
  const texts = await readStateFiles(client, owner, repo, dirs.map((d) => `${d}/classroom.json`));
  const result: Discovery = { classrooms: [], problems: [] };
  dirs.forEach((dir, i) => {
    const content = texts[i];
    if (content === null || content === undefined) return; // not a classroom directory
    try {
      result.classrooms.push(parseClassroom(dir, content));
    } catch (error) {
      if (!(error instanceof ClassroomFormatError)) throw error;
      result.problems.push(error.message);
    }
  });
  return result;
}

export interface ClassroomData {
  classroom: Classroom;
  assignments: Assignment[];
  roster: RosterStudent[];
}

/** classroom.json, assignments.json and roster.csv of one classroom directory. scores.json is not needed. */
export async function loadClassroomData(client: GithubClient, owner: string, repo: string, dir: string): Promise<ClassroomData> {
  const files = ['classroom.json', 'assignments.json', 'roster.csv'];
  const texts = await readStateFiles(client, owner, repo, files.map((f) => `${dir}/${f}`));
  files.forEach((file, i) => {
    if (texts[i] === null || texts[i] === undefined) throw new ClassroomFormatError(`Die Datei ${dir}/${file} fehlt im Repository „${repo}“.`);
  });
  const [classroomText, assignmentsText, rosterText] = texts;
  return {
    classroom: parseClassroom(dir, classroomText ?? ''),
    assignments: parseAssignments(dir, assignmentsText ?? ''),
    roster: parseRoster(dir, rosterText ?? ''),
  };
}

export type RepoPresence = { exists: false } | { exists: true; name: string; isEmpty: boolean };

function presenceQuery(count: number): string {
  const vars = Array.from({ length: count }, (_, i) => `$n${i}: String!`).join(', ');
  const aliases = Array.from({ length: count }, (_, i) => `r${i}: repository(owner: $owner, name: $n${i}) { name isEmpty }`).join('\n  ');
  return `query($owner: String!, ${vars}) {\n  ${aliases}\n}`;
}

/** Whether each repository exists (looked up by its exact name, never by prefix) and whether it is empty. */
export async function lookupRepos(client: GithubClient, owner: string, names: string[]): Promise<Map<string, RepoPresence>> {
  const result = new Map<string, RepoPresence>();
  for (let start = 0; start < names.length; start += CHUNK) {
    const chunk = names.slice(start, start + CHUNK);
    const variables: Record<string, unknown> = { owner };
    chunk.forEach((name, i) => (variables[`n${i}`] = name));
    const data = await client.query(presenceQuery(chunk.length), variables, { tolerateNotFound: true });
    chunk.forEach((name, i) => {
      const repo = field(data, `r${i}`);
      if (repo === null) {
        result.set(name, { exists: false });
        return;
      }
      const repoName = field(repo, 'name');
      const empty = field(repo, 'isEmpty');
      if (typeof repoName !== 'string' || typeof empty !== 'boolean') throw new GithubApiError('GitHub lieferte eine unerwartete Antwort.');
      result.set(name, { exists: true, name: repoName, isEmpty: empty });
    });
  }
  return result;
}
