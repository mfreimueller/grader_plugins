import { describe, expect, it } from 'vitest';
import { createMoodleClient, encodeParams } from '../../src/core/moodleClient';
import { fakeFetch } from './fakeMoodle';

const BASE = 'https://moodle.example';

describe('encodeParams', () => {
  it('flattens nested arrays and objects PHP-style', () => {
    const p = encodeParams({ courseids: [12706], grades: [{ userid: 5, plugindata: { a: { text: 'x y', format: 1 } } }], flag: true, off: false, empty: '' });
    expect(p.get('courseids[0]')).toBe('12706');
    expect(p.get('grades[0][userid]')).toBe('5');
    expect(p.get('grades[0][plugindata][a][text]')).toBe('x y');
    expect(p.get('grades[0][plugindata][a][format]')).toBe('1');
    expect(p.get('flag')).toBe('1');
    expect(p.get('off')).toBe('0');
    expect(p.get('empty')).toBe('');
  });

  it('skips null and undefined', () => {
    expect([...encodeParams({ a: null, b: undefined, c: 1 }).keys()]).toEqual(['c']);
  });
});

describe('request', () => {
  it('posts form-encoded with the token only in the body', async () => {
    const { fetch, calls } = fakeFetch(() => ({ sitename: 'S', userid: 3, fullname: 'Lehrer Eins' }));
    const result = await createMoodleClient({ baseUrl: BASE, token: 'sekret', fetch }).getSiteInfo();
    expect(result).toEqual({ ok: true, value: { sitename: 'S', userId: 3, fullName: 'Lehrer Eins' } });
    const call = calls[0];
    expect(call?.url).toBe(`${BASE}/webservice/rest/server.php`);
    expect(call?.url).not.toContain('sekret');
    expect(call?.method).toBe('POST');
    expect(call?.contentType).toBe('application/x-www-form-urlencoded');
    expect(call?.body.get('wstoken')).toBe('sekret');
    expect(call?.body.get('wsfunction')).toBe('core_webservice_get_site_info');
    expect(call?.body.get('moodlewsrestformat')).toBe('json');
  });

  it('maps a Moodle exception answer to a failure', async () => {
    const { fetch } = fakeFetch(() => ({ exception: 'x', errorcode: 'invalidtoken', message: 'Ungültiges Token' }));
    const result = await createMoodleClient({ baseUrl: BASE, token: 't', fetch }).getSiteInfo();
    expect(result).toEqual({ ok: false, error: 'Moodle: Ungültiges Token (invalidtoken)' });
  });

  it('maps an exception without message and code', async () => {
    const { fetch } = fakeFetch(() => ({ exception: 'x' }));
    const result = await createMoodleClient({ baseUrl: BASE, token: 't', fetch }).getSiteInfo();
    expect(result).toEqual({ ok: false, error: 'Moodle: Unbekannter Fehler' });
  });

  it('maps network errors, thrown non-errors, bad status and invalid json', async () => {
    const mk = (fetch: Parameters<typeof createMoodleClient>[0]['fetch']) => createMoodleClient({ baseUrl: BASE, token: 't', fetch }).getSiteInfo();
    expect(await mk(async () => { throw new Error('offline'); })).toEqual({ ok: false, error: 'Netzwerkfehler: offline' });
    expect(await mk(async () => { throw 'boom'; })).toEqual({ ok: false, error: 'Netzwerkfehler: unbekannt' });
    expect(await mk(async () => ({ ok: false, status: 503, json: async () => ({}) }))).toEqual({ ok: false, error: 'Moodle antwortet mit HTTP 503.' });
    expect(await mk(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } }))).toEqual({ ok: false, error: 'Moodle hat keine gültige JSON-Antwort geliefert.' });
  });

  it('strips a trailing slash from the base url', async () => {
    const { fetch, calls } = fakeFetch(() => ({ sitename: 'S', userid: 3, fullname: 'F' }));
    await createMoodleClient({ baseUrl: `${BASE}/`, token: 't', fetch }).getSiteInfo();
    expect(calls[0]?.url).toBe(`${BASE}/webservice/rest/server.php`);
  });
});

describe('typed methods', () => {
  const client = (answer: unknown) => {
    const { fetch, calls } = fakeFetch(() => answer);
    return { api: createMoodleClient({ baseUrl: BASE, token: 't', fetch }), calls };
  };

  it('getUserCourses', async () => {
    const { api, calls } = client([{ id: 1, fullname: 'Kurs', shortname: 'K', extra: true }]);
    expect(await api.getUserCourses(7)).toEqual({ ok: true, value: [{ id: 1, fullName: 'Kurs', shortName: 'K' }] });
    expect(calls[0]?.body.get('userid')).toBe('7');
    expect(calls[0]?.body.get('wsfunction')).toBe('core_enrol_get_users_courses');
  });

  it('getEnrolledStudents keeps students only', async () => {
    const { api, calls } = client([
      { id: 1, firstname: 'A', lastname: 'B', roles: [{ shortname: 'student' }] },
      { id: 2, firstname: 'T', lastname: 'T', roles: [{ shortname: 'editingteacher' }] },
      { id: 3, firstname: 'N', lastname: 'N' },
    ]);
    expect(await api.getEnrolledStudents(9)).toEqual({ ok: true, value: [{ id: 1, firstName: 'A', lastName: 'B' }] });
    expect(calls[0]?.body.get('courseid')).toBe('9');
  });

  it('getAssignments flattens the courses', async () => {
    const { api, calls } = client({ courses: [{ id: 1, assignments: [{ id: 5, cmid: 6, name: 'Ü1', grade: -7, markingworkflow: false }, { id: 8, cmid: 9, name: 'Ü2', grade: 100, markingworkflow: 1 }] }], warnings: [] });
    expect(await api.getAssignments(1)).toEqual({
      ok: true,
      value: [
        { id: 5, cmid: 6, name: 'Ü1', grade: -7, markingWorkflow: false },
        { id: 8, cmid: 9, name: 'Ü2', grade: 100, markingWorkflow: true },
      ],
    });
    expect(calls[0]?.body.get('courseids[0]')).toBe('1');
  });

  it('getGradeItems keeps assign items of all users', async () => {
    const { api, calls } = client({
      usergrades: [
        { userid: 5, gradeitems: [
          { itemmodule: 'assign', iteminstance: 9, graderaw: 4, gradeformatted: '+ (p)', grademin: 0, grademax: 5 },
          { itemmodule: 'quiz', iteminstance: 1, graderaw: 1, gradeformatted: '1', grademin: 0, grademax: 10 },
          { itemmodule: 'assign', iteminstance: 10, graderaw: null, grademin: 0, grademax: 5 },
          { itemmodule: 'assign', iteminstance: 11, graderaw: 'x', gradeformatted: '-', grademin: 0, grademax: 5 },
        ] },
      ],
    });
    expect(await api.getGradeItems(1)).toEqual({
      ok: true,
      value: [
        { userId: 5, assignmentId: 9, graderaw: 4, gradeformatted: '+ (p)', grademin: 0, grademax: 5 },
        { userId: 5, assignmentId: 10, graderaw: null, gradeformatted: '', grademin: 0, grademax: 5 },
        { userId: 5, assignmentId: 11, graderaw: null, gradeformatted: '-', grademin: 0, grademax: 5 },
      ],
    });
    expect(calls[0]?.body.get('courseid')).toBe('1');
    expect(calls[0]?.body.has('userid')).toBe(false);
  });

  it('saveGrades accepts null and empty warnings', async () => {
    for (const answer of [null, []]) {
      const { api, calls } = client(answer);
      expect(await api.saveGrades({ assignmentid: 3, grades: [{ userid: 1 }] })).toEqual({ ok: true, value: undefined });
      expect(calls[0]?.body.get('wsfunction')).toBe('mod_assign_save_grades');
      expect(calls[0]?.body.get('grades[0][userid]')).toBe('1');
    }
  });

  it('saveGrades fails on warnings', async () => {
    const { api } = client([{ item: 'x', message: 'Nicht erlaubt' }, { item: 'y' }]);
    expect(await api.saveGrades({})).toEqual({ ok: false, error: 'Moodle: Nicht erlaubt; Unbekannte Warnung' });
  });

  it('saveGrades fails on an unexpected answer', async () => {
    const { api } = client({ foo: 1 });
    expect((await api.saveGrades({})).ok).toBe(false);
  });

  it('fails on unexpected shapes', async () => {
    expect((await client({}).api.getSiteInfo()).ok).toBe(false);
    expect((await client('x').api.getSiteInfo()).ok).toBe(false);
    expect((await client('x').api.getAssignments(1)).ok).toBe(false);
    expect((await client('x').api.getGradeItems(1)).ok).toBe(false);
    expect((await client({ usergrades: [{ userid: 'x', gradeitems: [] }] }).api.getGradeItems(1)).ok).toBe(false);
    expect((await client({ usergrades: [{ userid: 1, gradeitems: [{ itemmodule: 'assign', iteminstance: 'x' }] }] }).api.getGradeItems(1)).ok).toBe(false);
    expect((await client('x').api.getUserCourses(1)).ok).toBe(false);
    expect((await client([{ id: 'x' }]).api.getUserCourses(1)).ok).toBe(false);
    expect((await client([{ id: 1 }]).api.getEnrolledStudents(1)).ok).toBe(false);
    expect((await client({}).api.getAssignments(1)).ok).toBe(false);
    expect((await client({ courses: [{ id: 1, assignments: 'x' }] }).api.getAssignments(1)).ok).toBe(false);
    expect((await client({ courses: ['x'] }).api.getAssignments(1)).ok).toBe(false);
    expect((await client({ courses: [{ assignments: [{ id: 1 }] }] }).api.getAssignments(1)).ok).toBe(false);
    expect((await client({}).api.getGradeItems(1)).ok).toBe(false);
    expect((await client({ usergrades: [{ userid: 1 }] }).api.getGradeItems(1)).ok).toBe(false);
    expect((await client({ usergrades: [{ userid: 1, gradeitems: [{ itemmodule: 'assign' }] }] }).api.getGradeItems(1)).ok).toBe(false);
  });

  it('passes network failures through', async () => {
    const api = createMoodleClient({ baseUrl: BASE, token: 't', fetch: async () => { throw new Error('offline'); } });
    expect((await api.getUserCourses(1)).ok).toBe(false);
    expect((await api.saveGrades({})).ok).toBe(false);
  });
});
