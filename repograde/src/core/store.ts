import type { GraderPluginApi } from '../window';
import { toPlain, unwrap } from './bridge';
import type { LastRun, SessionMode } from './range';

/** Per-course settings (storage key `settings`). */
export type GradingMode = 'classroom50' | 'manual';

export interface Settings {
  /** Classroom 50 (pick an assignment) or the manual prefix + mapping flow. */
  mode: GradingMode;
  organization: string;
  /** The repository of the organization holding Classroom 50's state. */
  stateRepo: string;
  /** `short_name` of the chosen classroom, '' while none is chosen. */
  classroom: string;
  /** Its directory in the state repository. */
  classroomDir: string;
  prefix: string;
  minimumCommitSize: number;
  /** A tertiary category of the course, '' while none is chosen. */
  categoryId: string;
  sessionMode: SessionMode;
}

export const DEFAULT_STATE_REPO = 'classroom50';

export const DEFAULT_SETTINGS: Settings = {
  mode: 'classroom50',
  organization: '',
  stateRepo: DEFAULT_STATE_REPO,
  classroom: '',
  classroomDir: '',
  prefix: '',
  minimumCommitSize: 50,
  categoryId: '',
  sessionMode: 'endOfRange',
};

/** Repository name to student ids. */
export type RepoMapping = Record<string, string[]>;

export const KEY_SETTINGS = 'settings';
export const KEY_REPO_MAPPING = 'repoMapping';
export const KEY_LAST_RUN = 'lastRun';
/** Secret key of the GitHub token, plugin-global. */
export const SECRET_TOKEN = 'github-token';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);

export function parseSettings(raw: unknown): Settings {
  if (!isRecord(raw)) return { ...DEFAULT_SETTINGS };
  const size = raw.minimumCommitSize;
  const classroom = text(raw.classroom, '');
  const prefix = text(raw.prefix, DEFAULT_SETTINGS.prefix);
  // Settings from before Classroom 50 existed keep the manual flow they were made for.
  const mode: GradingMode =
    raw.mode === 'manual' || raw.mode === 'classroom50' ? raw.mode : classroom === '' && prefix !== '' ? 'manual' : 'classroom50';
  return {
    mode,
    stateRepo: text(raw.stateRepo, '').trim() || DEFAULT_STATE_REPO,
    classroom,
    classroomDir: text(raw.classroomDir, ''),
    organization: text(raw.organization, DEFAULT_SETTINGS.organization),
    prefix,
    minimumCommitSize: typeof size === 'number' && Number.isInteger(size) && size >= 0 ? size : DEFAULT_SETTINGS.minimumCommitSize,
    categoryId: text(raw.categoryId, DEFAULT_SETTINGS.categoryId),
    sessionMode: raw.sessionMode === 'today' ? 'today' : 'endOfRange',
  };
}

export function parseRepoMapping(raw: unknown): RepoMapping {
  const mapping: RepoMapping = {};
  if (!isRecord(raw)) return mapping;
  for (const [repo, ids] of Object.entries(raw)) {
    if (!Array.isArray(ids)) continue;
    const valid = ids.filter((id): id is string => typeof id === 'string');
    if (valid.length > 0) mapping[repo] = valid;
  }
  return mapping;
}

export function parseLastRun(raw: unknown): LastRun | null {
  if (!isRecord(raw) || typeof raw.from !== 'string' || typeof raw.to !== 'string' || !Array.isArray(raw.assessmentIds)) {
    return null;
  }
  return { from: raw.from, to: raw.to, assessmentIds: raw.assessmentIds.filter((id): id is string => typeof id === 'string') };
}

export async function loadSettings(grader: GraderPluginApi): Promise<Settings> {
  return parseSettings(unwrap(await grader.storage.get(KEY_SETTINGS)));
}

export async function saveSettings(grader: GraderPluginApi, settings: Settings): Promise<void> {
  unwrap(await grader.storage.set(KEY_SETTINGS, toPlain(settings)));
}

export async function loadRepoMapping(grader: GraderPluginApi): Promise<RepoMapping> {
  return parseRepoMapping(unwrap(await grader.storage.get(KEY_REPO_MAPPING)));
}

export async function saveRepoMapping(grader: GraderPluginApi, mapping: RepoMapping): Promise<void> {
  unwrap(await grader.storage.set(KEY_REPO_MAPPING, toPlain(mapping)));
}

export async function loadLastRun(grader: GraderPluginApi): Promise<LastRun | null> {
  return parseLastRun(unwrap(await grader.storage.get(KEY_LAST_RUN)));
}

export async function saveLastRun(grader: GraderPluginApi, run: LastRun): Promise<void> {
  unwrap(await grader.storage.set(KEY_LAST_RUN, toPlain(run)));
}

/** The stored GitHub token, or null. Never log or display it. */
export async function loadToken(grader: GraderPluginApi): Promise<string | null> {
  return unwrap(await grader.secrets.get(SECRET_TOKEN));
}
