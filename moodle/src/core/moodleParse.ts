import type { GradeItem, MoodleAssignment, MoodleCourse, MoodleStudent, SiteInfo } from './types';

export type UnknownRecord = Record<string, unknown>;

export const isRecord = (v: unknown): v is UnknownRecord => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Maps every element; null when the input is no array or one element is invalid. */
function mapAll<T>(raw: unknown, parse: (item: UnknownRecord) => T | null): T[] | null {
  if (!Array.isArray(raw)) return null;
  const out: T[] = [];
  for (const item of raw as unknown[]) {
    const parsed = isRecord(item) ? parse(item) : null;
    if (parsed === null) return null;
    out.push(parsed);
  }
  return out;
}

/** Concatenates the lists of nested parents; null when any level is malformed. */
function flatMapAll<T>(raw: unknown, parse: (parent: UnknownRecord) => T[] | null): T[] | null {
  const parents = mapAll(raw, (p) => parse(p));
  return parents === null ? null : parents.flat();
}

export function parseSiteInfo(raw: unknown): SiteInfo | null {
  if (!isRecord(raw)) return null;
  const { sitename, userid, fullname } = raw;
  return typeof sitename === 'string' && typeof userid === 'number' && typeof fullname === 'string'
    ? { sitename, userId: userid, fullName: fullname }
    : null;
}

export function parseCourses(raw: unknown): MoodleCourse[] | null {
  return mapAll(raw, (c) =>
    typeof c.id === 'number' && typeof c.fullname === 'string' && typeof c.shortname === 'string'
      ? { id: c.id, fullName: c.fullname, shortName: c.shortname }
      : null,
  );
}

/** Enrolled users with the role `student` only. */
export function parseStudents(raw: unknown): MoodleStudent[] | null {
  const users = mapAll(raw, (u) => {
    if (typeof u.id !== 'number' || typeof u.firstname !== 'string' || typeof u.lastname !== 'string') return null;
    const roles = Array.isArray(u.roles) ? (u.roles as unknown[]) : [];
    const isStudent = roles.some((r) => isRecord(r) && r.shortname === 'student');
    return { student: { id: u.id, firstName: u.firstname, lastName: u.lastname }, isStudent };
  });
  return users === null ? null : users.filter((u) => u.isStudent).map((u) => u.student);
}

export function parseAssignments(raw: unknown): MoodleAssignment[] | null {
  if (!isRecord(raw)) return null;
  return flatMapAll(raw.courses, (course) =>
    mapAll(course.assignments, (a) =>
      typeof a.id === 'number' && typeof a.cmid === 'number' && typeof a.name === 'string' && typeof a.grade === 'number'
        ? { id: a.id, cmid: a.cmid, name: a.name, grade: a.grade, markingWorkflow: a.markingworkflow === 1 || a.markingworkflow === true }
        : null,
    ),
  );
}

/** The grade items of all assignments for all users in the answer of `gradereport_user_get_grade_items`. */
export function parseGradeItems(raw: unknown): GradeItem[] | null {
  if (!isRecord(raw)) return null;
  return flatMapAll(raw.usergrades, (usergrade) => {
    const userId = usergrade.userid;
    if (typeof userId !== 'number') return null;
    const items = mapAll(usergrade.gradeitems, (item) => {
      if (item.itemmodule !== 'assign') return { skip: true } as const;
      const { iteminstance, grademin, grademax } = item;
      if (typeof iteminstance !== 'number' || typeof grademin !== 'number' || typeof grademax !== 'number') return null;
      return {
        skip: false,
        item: {
          userId,
          assignmentId: iteminstance,
          graderaw: typeof item.graderaw === 'number' ? item.graderaw : null,
          gradeformatted: typeof item.gradeformatted === 'string' ? item.gradeformatted : '',
          grademin,
          grademax,
        },
      } as const;
    });
    if (items === null) return null;
    return items.flatMap((i) => (i.skip ? [] : [i.item]));
  });
}
