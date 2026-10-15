import type { GraderPluginApi } from '../window';
import { toPlain, unwrap } from './bridge';

/** GitHub username to Grader student id: manual overrides and confirmed matches only, no names or emails. */
export type GithubUsers = Record<string, string>;

/** What was entered for one assignment (keyed by slug). Dates are ISO timestamps. */
export interface AssignmentRun {
  from: string;
  to: string;
  assessmentIds: string[];
}

export type AssignmentRuns = Record<string, AssignmentRun>;

export const KEY_GITHUB_USERS = 'githubUsers';
export const KEY_ASSIGNMENT_RUNS = 'assignmentRuns';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseGithubUsers(raw: unknown): GithubUsers {
  const users: GithubUsers = {};
  if (!isRecord(raw)) return users;
  for (const [username, id] of Object.entries(raw)) if (typeof id === 'string' && id !== '') users[username] = id;
  return users;
}

export function parseAssignmentRuns(raw: unknown): AssignmentRuns {
  const runs: AssignmentRuns = {};
  if (!isRecord(raw)) return runs;
  for (const [slug, run] of Object.entries(raw)) {
    if (!isRecord(run) || typeof run.from !== 'string' || typeof run.to !== 'string' || !Array.isArray(run.assessmentIds)) continue;
    runs[slug] = {
      from: run.from,
      to: run.to,
      assessmentIds: run.assessmentIds.filter((id): id is string => typeof id === 'string'),
    };
  }
  return runs;
}

/** Whether the assignment has assessments in Grader already: entering again needs the teacher's confirmation. */
export function alreadyEntered(runs: AssignmentRuns, slug: string): boolean {
  return (runs[slug]?.assessmentIds.length ?? 0) > 0;
}

export async function loadGithubUsers(grader: GraderPluginApi): Promise<GithubUsers> {
  return parseGithubUsers(unwrap(await grader.storage.get(KEY_GITHUB_USERS)));
}

export async function saveGithubUsers(grader: GraderPluginApi, users: GithubUsers): Promise<void> {
  unwrap(await grader.storage.set(KEY_GITHUB_USERS, toPlain(users)));
}

export async function loadAssignmentRuns(grader: GraderPluginApi): Promise<AssignmentRuns> {
  return parseAssignmentRuns(unwrap(await grader.storage.get(KEY_ASSIGNMENT_RUNS)));
}

export async function saveAssignmentRuns(grader: GraderPluginApi, runs: AssignmentRuns): Promise<void> {
  unwrap(await grader.storage.set(KEY_ASSIGNMENT_RUNS, toPlain(runs)));
}
