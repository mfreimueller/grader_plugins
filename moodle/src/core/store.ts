import type { GraderPluginApi } from '../window';
import { toPlain, unwrap } from './bridge';

/** Secret key of the Moodle web service token (plugin-global). */
export const SECRET_TOKEN = 'moodle.token';
export const KEY_COURSE_ID = 'moodleCourseId';
export const KEY_STUDENT_MAP = 'studentMap';
export const linkKey = (assessmentId: string): string => `link:${assessmentId}`;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const positiveInt = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null);

export const parseCourseIdValue = positiveInt;
export const parseLink = positiveInt;

/** Grader student id to Moodle user id; invalid entries are dropped. */
export function parseStudentMap(raw: unknown): Record<string, number> {
  const map: Record<string, number> = {};
  if (!isRecord(raw)) return map;
  for (const [id, userId] of Object.entries(raw)) {
    const valid = positiveInt(userId);
    if (valid !== null) map[id] = valid;
  }
  return map;
}

/** The stored Moodle token, or null. Never log or display it. */
export async function loadToken(grader: GraderPluginApi): Promise<string | null> {
  return unwrap(await grader.secrets.get(SECRET_TOKEN));
}

export async function saveToken(grader: GraderPluginApi, token: string): Promise<void> {
  unwrap(await grader.secrets.set(SECRET_TOKEN, token));
}

export async function clearToken(grader: GraderPluginApi): Promise<void> {
  unwrap(await grader.secrets.delete(SECRET_TOKEN));
}

export async function loadCourseId(grader: GraderPluginApi): Promise<number | null> {
  return parseCourseIdValue(unwrap(await grader.storage.get(KEY_COURSE_ID)));
}

export async function saveCourseId(grader: GraderPluginApi, courseId: number): Promise<void> {
  unwrap(await grader.storage.set(KEY_COURSE_ID, courseId));
}

export async function loadLink(grader: GraderPluginApi, assessmentId: string): Promise<number | null> {
  return parseLink(unwrap(await grader.storage.get(linkKey(assessmentId))));
}

export async function saveLink(grader: GraderPluginApi, assessmentId: string, assignmentId: number): Promise<void> {
  unwrap(await grader.storage.set(linkKey(assessmentId), assignmentId));
}

export async function deleteLink(grader: GraderPluginApi, assessmentId: string): Promise<void> {
  unwrap(await grader.storage.delete(linkKey(assessmentId)));
}

export async function loadStudentMap(grader: GraderPluginApi): Promise<Record<string, number>> {
  return parseStudentMap(unwrap(await grader.storage.get(KEY_STUDENT_MAP)));
}

export async function saveStudentMap(grader: GraderPluginApi, map: Record<string, number>): Promise<void> {
  unwrap(await grader.storage.set(KEY_STUDENT_MAP, toPlain(map)));
}
