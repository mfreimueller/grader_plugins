# Repograde plugin for Grader

A plugin for [Grader](https://github.com/mfreimueller/grader) that grades GitHub Classroom repositories by commit
size, like `repograde.py`, and enters the result as a `PLUS` / `MINUS` assessment per student: `PLUS` when the lines
added + removed in the date range reach the configured minimum commit size, `MINUS` otherwise. Everyone assigned to a
repository (team projects) gets the repository's grade.

With [Classroom 50](https://github.com/foundation50/classroom50) the teacher picks an **assignment** (one per week or
two weeks) instead of typing an organization prefix and a date range: the plugin reads the classroom's state from the
`classroom50` repository of the organization and looks up each student's repository by its exact name. The old manual
flow (prefix + hand-made mapping, team projects) stays available as *„Manuell (Präfix + Zuordnung)“*.

It reads the commit history through the GitHub GraphQL API (all branches, merge commits skipped, commits counted once).

## Build

Requires Node.js 22+.

```sh
cd plugin
npm install
npm test          # unit tests (Vitest, no network)
npm run build     # type check + build
```

`npm run build` writes `plugin/dist/at.mfreimueller.repograde/` (`plugin.json`, `index.html`, `assets/`).

## Install

1. In Grader open *Einstellungen → Plugins → „Plugin-Ordner öffnen“*.
2. Copy the folder `plugin/dist/at.mfreimueller.repograde` into that plugin folder.
3. Click *„Neu laden“*. A plugin you add yourself starts switched off.
4. Switch it on. Grader lists what the plugin may do; accept it with *„Erlauben und einschalten“*:
   - connect to `api.github.com`,
   - store credentials (the token) encrypted,
   - read the course and its students,
   - create and delete impromptu assessments.
5. Start it in a course via *„Werkzeuge“* at the top right.

Updating works the same way (copy over the old folder, *„Neu laden“*). If a new version asks for more permissions or
another server, Grader asks again.

## GitHub token

Create a **fine-grained personal access token** at <https://github.com/settings/personal-access-tokens>:

- Resource owner: the organization that owns the student repositories (an organization admin may have to approve it).
- Repository access: all repositories, or at least the students' repositories **and the `classroom50` repository** (the
  state repository of Classroom 50; it is private).
- Repository permissions: **Contents: read-only** and **Metadata: read-only**.

Paste it under *Einstellungen → GitHub-Token* in the plugin and use *„Verbindung testen“*; in Classroom 50 mode it also
checks that the `classroom50` repository is readable. A 403/404 on that repository means the token lacks access to it. The token is stored with
Grader's `secrets` API: encrypted with the operating system's key store, **per machine and per user account**. It is
shared by all courses. A Grader backup restored on another computer cannot decrypt it, so paste the token again there.

## Use

### Classroom 50 (default once a classroom is chosen)

1. **Einstellungen:** organization, name of the state repository (default `classroom50`), then *„Klassen laden“* and
   choose the classroom (every directory of the state repository with a `classroom.json`; the choice is stored as its
   `short_name`). Also the minimum commit size, the target category (a `+ ~ −` category) and the target session.
2. **Zuordnung:** roster rows with role `student` are matched to the course's students by name (ignoring case,
   whitespace, diacritics and swapped order; ambiguous names stay unmatched). Fix the rest with the dropdowns and press
   *„Zuordnung speichern“*. Only `username → student` is stored; no names or emails from the roster.
3. **Bewertung:** choose the assignment (sorted by due date, undated last). The range is `available_from` (else the
   previous assignment's due date, else 14 days before the end) to `due` (else now), capped at now, and editable.
   **Commits after the deadline do not count.** *Prüfen* shows per student: repository, added, removed, total and
   PASS/FAIL. No repository (never accepted) or an empty one gives MINUS; a repository that cannot be read is skipped
   and listed. Tick the checkbox next to an absent student's name: the row is greyed out and that student gets no
   assessment at all (no `−`). *Eintragen* creates one `+`/`−` per matched student, titled like the assignment, in the session chosen in
   the settings (the due date if it has passed, else today). An assignment entered before asks
   *„Bereits eingetragen – erneut eintragen?“* and replaces its earlier assessments; *„Rückgängig“* deletes them.
   Group assignments (mode other than `individual`) are not supported yet; the view offers to switch to manual mode.

Student repositories are named `<short_name>-<slug>-<github username>`; each is looked up by that exact name, so
assignments whose slug starts with another slug cannot be confused.

### Manuell (Präfix + Zuordnung)

1. **Einstellungen:** organization, repository prefix, minimum commit size, category and target session.
2. **Zuordnung:** assign students to each repository. The project name is the repository name without the prefix.
3. **Bewertung:** choose *Seit dem letzten Lauf* (first run: last 7 days) or a date range, press *Prüfen* for a
   preview (nothing is written), tick absent students (greyed out, no assessment), then *Eintragen*. *Letzten Lauf rückgängig* deletes the assessments of the last run.

## Layout

- `src/core/github.ts`: GraphQL queries, pagination, deduplication (`fetch` injected).
- `src/core/grading.ts`: commit totals to `PLUS` / `MINUS` per student.
- `src/core/range.ts`: date range rules of the manual mode.
- `src/core/classroom50.ts`: parsing of `classroom.json`, `assignments.json`, `roster.csv`; repository names.
- `src/core/classroomRemote.ts`: discovery of classrooms, reading the state files, exact repository lookups (GraphQL aliases).
- `src/core/nameMatch.ts`, `assignmentRange.ts`, `classroomGrading.ts`, `classroomRun.ts`: name matching, range per
  assignment, grading rows, the check of one assignment.
- `src/core/classroomStore.ts`, `classroomAssess.ts`: `githubUsers` and per-assignment records; entering and undoing.
- `src/window.d.ts`: copy of Grader's plugin API types (API version 1); update by hand if the API changes.
