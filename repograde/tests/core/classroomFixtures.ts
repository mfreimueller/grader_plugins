/** Anonymised files in the shapes Classroom 50 writes. Names, usernames and the organization are made up. */

export const classroomJson = (shortName = 'sj2627-pos-3abc', extra: Record<string, unknown> = {}): string =>
  JSON.stringify({
    schema: 'classroom50/classroom/v1',
    name: shortName,
    short_name: shortName,
    term: 'FRM',
    org: 'Beispiel-Schule',
    team: { id: 1, slug: `classroom50-${shortName}` },
    teams: { teacher: { id: 2, slug: `classroom50-${shortName}-teacher` } },
    ...extra,
  });

const assignment = (slug: string, name: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  slug,
  name,
  mode: 'individual',
  autograder: 'default',
  feedback_pr: true,
  no_autograder: true,
  template: { owner: 'Beispiel-Schule', repo: `sj2627-pos-3abc-${slug}`, branch: 'main' },
  grading: { mode: 'off' },
  ...extra,
});

export const assignmentsJson = (): string =>
  JSON.stringify({
    schema: 'classroom50/assignments/v1',
    assignments: [
      assignment('00-task-board', '00-Task-Board', {
        due: '2026-10-01T07:55:00Z',
        due_meta: { input: '2026-10-01T09:55:00', zone: 'Europe/Vienna' },
        available_from: '2026-09-21T06:00:00Z',
      }),
      assignment('01-movie-archive', '01-Movie-Archive', { due: '2026-10-19T05:59:00Z', available_from: '2026-10-08T09:00:00Z' }),
      assignment('03-bowling-kata', '03-Bowling-Kata'),
      assignment('02-space-mission', '02-Space-Mission', { mode: 'group' }),
    ],
  });

export const rosterCsv = (): string =>
  [
    'username,first_name,last_name,email,section,github_id,role',
    'lehrer-beispiel,Lena,Lehrerin,,,100,teacher',
    'maxMuster,Max,Mustermann,max@example.org,,101,student',
    'erika-m,Erika,Musterfrau,,,102,student',
    '"jose-g","José","García-Müller",,,103,student',
    'hilfe-ta,Tom,Assistent,,,104,ta',
  ].join('\r\n') + '\r\n';
