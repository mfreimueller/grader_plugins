import { isRecord, parseAssignments, parseCourses, parseGradeItems, parseSiteInfo, parseStudents } from './moodleParse';
import { fail, ok, type Result } from './result';
import type { GradeItem, MoodleAssignment, MoodleCourse, MoodleStudent, SiteInfo } from './types';

/** The part of `fetch` the client needs (the browser's `fetch` fits). */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export type ParamValue = string | number | boolean | null | undefined | ParamValue[] | { [key: string]: ParamValue };

/** Flattens nested params PHP-style: `grades[0][userid]=5`. Booleans become 1/0, null and undefined are left out. */
export function encodeParams(params: { [key: string]: ParamValue }): URLSearchParams {
  const out = new URLSearchParams();
  const walk = (prefix: string, value: ParamValue): void => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) value.forEach((v, i) => walk(`${prefix}[${i}]`, v));
    else if (typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(`${prefix}[${k}]`, v);
    else out.append(prefix, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
  };
  for (const [key, value] of Object.entries(params)) walk(key, value);
  return out;
}

export interface MoodleClient {
  getSiteInfo(): Promise<Result<SiteInfo>>;
  getUserCourses(userId: number): Promise<Result<MoodleCourse[]>>;
  getEnrolledStudents(courseId: number): Promise<Result<MoodleStudent[]>>;
  getAssignments(courseId: number): Promise<Result<MoodleAssignment[]>>;
  getGradeItems(courseId: number): Promise<Result<GradeItem[]>>;
  /** `mod_assign_save_grades`; the only write call. Params come from `buildSavePayload`. */
  saveGrades(params: { [key: string]: ParamValue }): Promise<Result<void>>;
}

const unexpected = <T>(): Result<T> => fail('Moodle hat eine unerwartete Antwort geliefert.');

function exceptionMessage(raw: unknown): string | null {
  if (!isRecord(raw) || raw.exception === undefined) return null;
  const message = typeof raw.message === 'string' ? raw.message : 'Unbekannter Fehler';
  return typeof raw.errorcode === 'string' ? `Moodle: ${message} (${raw.errorcode})` : `Moodle: ${message}`;
}

export function createMoodleClient(options: { baseUrl: string; token: string; fetch: FetchLike }): MoodleClient {
  const endpoint = `${options.baseUrl.replace(/\/+$/, '')}/webservice/rest/server.php`;

  /** Never logs or echoes the token; it travels in the body only. */
  async function call(wsfunction: string, params: { [key: string]: ParamValue }): Promise<Result<unknown>> {
    const body = encodeParams({ wstoken: options.token, wsfunction, moodlewsrestformat: 'json', ...params }).toString();
    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await options.fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    } catch (error) {
      return fail(`Netzwerkfehler: ${error instanceof Error ? error.message : 'unbekannt'}`);
    }
    if (!response.ok) return fail(`Moodle antwortet mit HTTP ${response.status}.`);
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return fail('Moodle hat keine gültige JSON-Antwort geliefert.');
    }
    const message = exceptionMessage(json);
    return message === null ? ok(json) : fail(message);
  }

  async function typed<T>(wsfunction: string, params: { [key: string]: ParamValue }, parse: (raw: unknown) => T | null): Promise<Result<T>> {
    const raw = await call(wsfunction, params);
    if (!raw.ok) return raw;
    const parsed = parse(raw.value);
    return parsed === null ? unexpected() : ok(parsed);
  }

  return {
    getSiteInfo: () => typed('core_webservice_get_site_info', {}, parseSiteInfo),
    getUserCourses: (userId) => typed('core_enrol_get_users_courses', { userid: userId }, parseCourses),
    getEnrolledStudents: (courseId) => typed('core_enrol_get_enrolled_users', { courseid: courseId }, parseStudents),
    getAssignments: (courseId) => typed('mod_assign_get_assignments', { courseids: [courseId] }, parseAssignments),
    getGradeItems: (courseId) => typed('gradereport_user_get_grade_items', { courseid: courseId }, parseGradeItems),
    async saveGrades(params) {
      const raw = await call('mod_assign_save_grades', params);
      if (!raw.ok) return raw;
      if (raw.value === null) return ok(undefined);
      if (!Array.isArray(raw.value)) return unexpected();
      if (raw.value.length === 0) return ok(undefined);
      const messages = (raw.value as unknown[]).map((w) => (isRecord(w) && typeof w.message === 'string' ? w.message : 'Unbekannte Warnung'));
      return fail(`Moodle: ${messages.join('; ')}`);
    },
  };
}
