# Moodle-Sync plugin for Grader

A plugin for [Grader](https://github.com/mfreimueller/grader) that pushes the results of **one Grader assessment** (a
shared column) plus the per-student notes into **one Moodle assignment**. One way only: Grader → Moodle. Nothing is
ever read back into Grader, and a student without a result never clears an existing Moodle grade.

## Kinds of transfer

The Grader column decides the kind; it is checked against the Moodle assignment once the assignment's grade items are
loaded (only they tell how many items a scale has).

| Grader column | Moodle assignment | Kind |
|---|---|---|
| Symbols (`+ ~ −`) | scale with 5 items | Symbols, 5-item scale |
| Symbols | scale with 3 items | Symbols, 3-item scale (lossy) |
| Points (`maxPoints`) | points, same maximum | Points |
| Points shown as grade (`displayAsGrade`) | points, same maximum, **or** scale with 5 items | Points, or Grades 1–5 |

In the assignment picker only fitting assignments are selectable; the others are disabled with the reason.

### Symbols, 5-item scale

Moodle scale items run low to high:

| Grader | Moodle item | Scale index |
|---|---|---|
| `−` | `--` | 1 |
| `−~` | `-` | 2 |
| `~` | `~` | 3 |
| `+~` | `+` | 4 |
| `+` | `++` | 5 |

### Symbols, 3-item scale

The mapping is lossy, the preview shows the target label and the legend „3-stufige Skala: +~ → +, −~ → −“:

| Grader | Moodle item | Scale index |
|---|---|---|
| `−`, `−~` | `-` | 1 |
| `~` | `~` | 2 |
| `+`, `+~` | `+` | 3 |

### Points

The score is sent as grade. A student without a score is skipped. Refused unless the assignment's maximum equals
Grader's `maxPoints`: „Höchstpunkte stimmen nicht überein: Grader X, Moodle Y – bitte die Aufgabe in Moodle anpassen.“
Status new/changed/same compares the current points with the score numerically. After saving, the points read back
from Moodle must equal the ones sent (no label check).

### Grades 1–5

For a points column that Grader shows as a grade (1–5, computed by Grader from the points) and a scale assignment with
5 items whose labels are the plain digits: scale index = 6 − grade, label = the grade:

| Grade | Moodle item | Scale index |
|---|---|---|
| 1 | `1` | 5 |
| 2 | `2` | 4 |
| 3 | `3` | 3 |
| 4 | `4` | 2 |
| 5 | `5` | 1 |

A student without a grade is skipped.

### Refusal rules and safety net

- Symbols need a scale with exactly 3 or 5 items; points need an assignment with points; grades need a 5-item scale.
- Labels may carry a suffix in parentheses (`-- (mm)`); it is ignored when comparing.
- **Before every sync** all grades already entered for the assignment are checked against the label mapping of the
  kind (not for points). If one contradicts it (e.g. a symbol scale chosen for grades: „Diese Skala sieht nicht nach
  Noten 1–5 aus …“), the transfer is blocked with a message. Whether a student is graded is decided on the raw grade
  (`graderaw`), never on the label (an ungraded item also shows `-`).
- **After every sync** the grades are read back and compared with what was sent (value, and the label for scales).

### Confirmations

- **Unverified scale.** If a scale kind (symbols or grades) is chosen for an assignment that has no graded item yet,
  the labels cannot be compared (a 5-item symbol scale and a 5-item grade scale look the same). The preview then
  warns „Die Skala dieser Aufgabe konnte nicht geprüft werden …“ and the transfer button stays disabled until
  *„Ja, die Skala passt“* is ticked. The tick is reset whenever the assessment or assignment changes. Points are never
  unverified.
- **Zero points.** For points and grades, a result with a score of exactly 0 may be a typed 0 or a blank that was
  stored as 0. Such rows (new or changed) are **not sent** until their checkbox („0 Punkte – wirklich 0 eintragen?“ /
  „… wirklich Nicht genügend?“) is ticked; a summary line shows how many rows are waiting. Detected on the score, not
  on the grade (Grader gives grade 5 for 0 points).

Notes are written as the assignment's feedback comment (HTML-escaped, line breaks as `<br>`). Students without a note
keep whatever comment they have in Moodle.

What is sent: rows that are *new* or *changed*, and rows with an *unchanged* grade only if they carry a note (the note
is then written as feedback). Unchanged rows without a note are not sent.

## Build

Requires Node.js 22+.

```sh
npm install
npm test               # unit tests (Vitest, no network)
npm run test:coverage  # with branch coverage of src/core (100% enforced)
npm run build          # type check + build
```

`npm run build` writes `dist/at.mfreimueller.moodle/` (`plugin.json`, `index.html`, `assets/`).

## Install

Needs a Grader version with the `assessment:read` plugin permission (the `grader.assessment.list()` bridge call). Transferring points as grades 1–5 additionally needs the `grade` and `displayAsGrade` fields of that call; with an older Grader they count as missing, so only symbols and points are offered.

1. In Grader open *Einstellungen → Plugins → „Plugin-Ordner öffnen“*.
2. Copy the folder `dist/at.mfreimueller.moodle` into that plugin folder.
3. Click *„Neu laden“*. A plugin you add yourself starts switched off.
4. Switch it on and accept what it may do with *„Erlauben und einschalten“*: connect to `moodle.spengergasse.at`,
   store credentials (the token) encrypted, read the course and its students, read the course's assessments.
5. Start it in a course via *„Werkzeuge“*.

Updating works the same way (copy over the old folder, *„Neu laden“*).

## Moodle token

In Moodle open *Profil → Einstellungen → Sicherheitsschlüssel* and create (or copy) the token of the web service
`grade_import`. Paste it under *Verbindung*; the plugin tests it and shows „Verbunden mit … als …“. The token is stored
with Grader's `secrets` API (encrypted by the operating system, per computer and user account, shared by all courses),
sent only in the request body, and never logged.

The service needs these functions: `core_webservice_get_site_info`, `core_enrol_get_users_courses`,
`core_enrol_get_enrolled_users`, `mod_assign_get_assignments`, `gradereport_user_get_grade_items`,
`mod_assign_save_grades`.

## Use

1. **Verbindung:** save the token.
2. **Kurs:** enter the Moodle course id or paste the course link, or load *„Meine Kurse“* and pick one. Stored per Grader
   course.
3. **Übertragen:** choose the Grader assessment (shared symbol or point columns of any category; the list shows the type: Symbole, Punkte (max.), Noten) and the Moodle assignment (only fitting assignments are selectable; others are listed with the reason). The link is remembered.
4. **Vorschau:** per student the Grader value, the target and current Moodle item, the note and the status (neu,
   geändert, gleich, übersprungen, nicht zugeordnet). Students are matched by name (ignoring case, diacritics, word
   order; only unique hits). Pick the Moodle user for unmatched students from the dropdown; the choice is stored.
5. **Übertragen:** *„N Bewertungen nach Moodle übertragen“*, confirm. Afterwards the grades are read back from Moodle
   and compared with what was sent.

## Storage

| What | API | Key |
|---|---|---|
| Moodle token | `grader.secrets` | `moodle.token` |
| Moodle course id | `grader.storage` (per course) | `moodleCourseId` |
| Assessment → assignment | `grader.storage` | `link:<assessmentId>` |
| Student mapping (manual choices) | `grader.storage` | `studentMap` |

## Layout

- `src/core/moodleClient.ts`, `moodleParse.ts`: REST client (`fetch` injected), PHP-style param flattening, error mapping.
- `src/core/kinds.ts` (the transfer kinds and `decideKind`), `scale.ts`, `matchStudents.ts`, `buildDiff.ts`, `buildSavePayload.ts`, `verifyAfterSave.ts`: the sync logic.
- `src/core/assignments.ts`, `assessments.ts`, `courseId.ts`: choosing the sync partners.
- `src/core/syncFlow.ts`: read state for the preview; save, read back, verify.
- `src/core/store.ts`, `bridge.ts`: Grader storage/secrets helpers.
- `src/components/`: Vue views. `src/window.d.ts`: copy of Grader's plugin API types (API version 1); update by hand.
