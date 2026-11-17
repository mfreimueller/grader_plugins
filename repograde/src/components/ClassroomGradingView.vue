<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { PluginContext } from '../window';
import { errorText } from '../core/bridge';
import { sortAssignments } from '../core/classroom50';
import { deriveAssignmentRange, resolveOverride, toLocalInput } from '../core/assignmentRange';
import { enterAssignment, undoAssignment } from '../core/classroomAssess';
import type { ClassroomGradingResult, RowStatus } from '../core/classroomGrading';
import { checkAssignment } from '../core/classroomRun';
import type { ClassroomData } from '../core/classroomRemote';
import { alreadyEntered, type AssignmentRuns, type GithubUsers } from '../core/classroomStore';
import { createGithubClient } from '../core/github';
import { withoutAbsent } from '../core/grading';
import { sessionTarget, type DateRange } from '../core/range';
import { effectiveMapping } from '../core/nameMatch';
import { loadToken, type Settings } from '../core/store';

const props = defineProps<{
  context: PluginContext;
  settings: Settings;
  data: ClassroomData | null;
  loading: boolean;
  error: string;
  githubUsers: GithubUsers;
  runs: AssignmentRuns;
  saveRuns: (runs: AssignmentRuns) => Promise<void>;
  reload: () => void;
}>();
const emit = defineEmits<{ useManual: [] }>();

const assignments = computed(() => sortAssignments(props.data?.assignments ?? []));
const slug = ref('');
const fromInput = ref('');
const toInput = ref('');
const busy = ref(false);
const progress = ref('');
const error = ref('');
const message = ref('');
const warnings = ref<string[]>([]);
const confirming = ref(false);
const preview = ref<{ result: ClassroomGradingResult; range: DateRange; slug: string; title: string } | null>(null);
// Students marked absent get no assessment. Kept across checks, so re-checking does not lose the marks.
const absent = ref(new Set<string>());
const grades = computed(() => withoutAbsent(preview.value?.result.grades ?? [], absent.value));

function toggleAbsent(studentId: string): void {
  const next = new Set(absent.value);
  if (!next.delete(studentId)) next.add(studentId);
  absent.value = next;
}

const selected = computed(() => assignments.value.find((a) => a.slug === slug.value) ?? null);
const isGroup = computed(() => selected.value !== null && selected.value.mode !== 'individual');
const mapping = computed(() => effectiveMapping(props.data?.roster ?? [], props.context.courseStudents, props.githubUsers));
const entered = computed(() => alreadyEntered(props.runs, slug.value));

const fmt = (d: Date): string => d.toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' });
const label = (a: { name: string; due: Date | null }): string =>
  `${a.name} (${a.due ? `fällig ${fmt(a.due)}` : 'kein Fälligkeitsdatum'})`;
const statusText: Record<RowStatus, string> = {
  graded: '',
  'no-repo': 'Kein Repository (nicht angenommen)',
  empty: 'Repository leer',
  error: 'Fehler',
};

// Pick the latest assignment whose deadline has passed (else the first) when the list arrives.
watch(
  assignments,
  (list) => {
    if (list.some((a) => a.slug === slug.value)) return;
    const now = Date.now();
    const past = list.filter((a) => a.due !== null && a.due.getTime() <= now);
    slug.value = (past[past.length - 1] ?? list[0])?.slug ?? '';
  },
  { immediate: true },
);

// Choosing an assignment fills the date fields, which stay editable.
watch(
  [selected, assignments],
  () => {
    preview.value = null;
    confirming.value = false;
    if (selected.value === null) return;
    const range = deriveAssignmentRange(selected.value, assignments.value, new Date());
    fromInput.value = toLocalInput(range.from);
    toInput.value = toLocalInput(range.to);
  },
  { immediate: true },
);
watch([fromInput, toInput], () => {
  preview.value = null;
  confirming.value = false;
});

function reset(): void {
  error.value = '';
  message.value = '';
  warnings.value = [];
}

async function check(): Promise<void> {
  reset();
  preview.value = null;
  const assignment = selected.value;
  const data = props.data;
  if (assignment === null || data === null) return;
  if (props.settings.categoryId === '') {
    error.value = 'Bitte zuerst unter „Einstellungen“ eine Kategorie wählen.';
    return;
  }
  const range = resolveOverride(fromInput.value, toInput.value, new Date());
  if (!range.ok) {
    error.value = range.error;
    return;
  }
  busy.value = true;
  try {
    const token = await loadToken(window.grader);
    if (token === null) {
      error.value = 'Bitte zuerst unter „Einstellungen“ ein GitHub-Token speichern.';
      return;
    }
    const result = await checkAssignment(
      createGithubClient({ token }),
      data.classroom.org ?? props.settings.organization,
      {
        shortName: data.classroom.shortName,
        slug: assignment.slug,
        roster: data.roster,
        mapping: mapping.value,
        students: props.context.courseStudents,
        minimumCommitSize: props.settings.minimumCommitSize,
      },
      range.value,
      (text) => (progress.value = text),
    );
    preview.value = { result, range: range.value, slug: assignment.slug, title: assignment.name };
  } catch (e) {
    error.value = errorText(e);
  } finally {
    busy.value = false;
    progress.value = '';
  }
}

const nameOf = (id: string): string => {
  const s = props.context.courseStudents.find((x) => x.id === id);
  return s ? `${s.firstName} ${s.lastName}` : id;
};

async function commit(confirmed: boolean): Promise<void> {
  const current = preview.value;
  if (!current) return;
  reset();
  busy.value = true;
  try {
    const outcome = await enterAssignment(
      window.grader,
      props.runs,
      {
        slug: current.slug,
        title: current.title,
        grades: grades.value,
        categoryId: props.settings.categoryId,
        session: sessionTarget(props.settings.sessionMode, current.range),
        from: current.range.from,
        to: current.range.to,
        confirmedReentry: confirmed,
      },
      props.saveRuns,
    );
    if (outcome.status === 'needs-confirmation') {
      confirming.value = true;
      return;
    }
    confirming.value = false;
    message.value = `${outcome.commit.assessmentIds.length} Beurteilungen eingetragen.`;
    warnings.value = [
      ...outcome.commit.failures.map((f) => `${nameOf(f.studentId)}: ${f.message}`),
      ...current.result.rows.filter((r) => r.status === 'error').map((r) => `Repository ${r.repo} übersprungen (${r.error ?? 'Fehler'}).`),
      ...(outcome.notDeleted > 0 ? [`${outcome.notDeleted} frühere Beurteilungen konnten nicht gelöscht werden.`] : []),
    ];
    preview.value = null;
  } catch (e) {
    error.value = errorText(e);
  } finally {
    busy.value = false;
  }
}

async function undo(): Promise<void> {
  reset();
  busy.value = true;
  try {
    const result = await undoAssignment(window.grader, props.runs, slug.value, props.saveRuns);
    if (result.notDeleted > 0) error.value = `${result.notDeleted} Beurteilungen konnten nicht gelöscht werden.`;
    else message.value = 'Eintragung rückgängig gemacht.';
  } catch (e) {
    error.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section>
    <h2>Aufgabe</h2>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="loading" class="muted">Lade Klassenliste …</p>
    <p v-else-if="!data" class="muted">Bitte zuerst unter „Einstellungen“ eine Klasse wählen.</p>
    <template v-else>
      <div class="field">
        <label for="assignment">Aufgabe</label>
        <select id="assignment" v-model="slug">
          <option v-for="a in assignments" :key="a.slug" :value="a.slug">{{ label(a) }}</option>
        </select>
        <span v-if="entered" class="muted">Bereits eingetragen.</span>
      </div>
      <p v-if="isGroup" class="error">
        Gruppenaufgaben werden noch nicht unterstützt (die Namen der Repositories sind unbekannt).
        <button class="secondary" @click="emit('useManual')">Auf „Manuell (Präfix + Zuordnung)“ umstellen</button>
      </p>
      <template v-else>
        <div class="row">
          <div class="field">
            <label for="from">Von</label>
            <input id="from" v-model="fromInput" type="datetime-local" />
          </div>
          <div class="field">
            <label for="to">Bis (Abgabefrist; spätere Commits zählen nicht)</label>
            <input id="to" v-model="toInput" type="datetime-local" />
          </div>
        </div>
        <div class="actions">
          <button :disabled="busy || !selected" @click="check">Prüfen</button>
          <button v-if="preview" :disabled="busy || grades.length === 0" @click="commit(false)">Eintragen</button>
          <button v-if="entered" class="secondary" :disabled="busy" @click="undo">Rückgängig</button>
          <span v-if="progress" class="muted">{{ progress }}</span>
        </div>
        <p v-if="confirming" class="error">
          Bereits eingetragen – erneut eintragen? Die früheren Beurteilungen dieser Aufgabe werden dabei ersetzt.
          <button :disabled="busy" @click="commit(true)">Ja, erneut eintragen</button>
          <button class="secondary" @click="confirming = false">Abbrechen</button>
        </p>
      </template>
      <p v-if="message" class="success">{{ message }}</p>
      <ul v-if="warnings.length > 0" class="error">
        <li v-for="w in warnings" :key="w">{{ w }}</li>
      </ul>

      <template v-if="preview">
        <h2>Vorschau: {{ preview.title }}</h2>
        <p v-if="preview.result.rows.length === 0" class="muted">Keine zugeordneten Schüler/innen. Siehe Tab „Zuordnung“.</p>
        <template v-else>
          <p class="muted">Abwesende Schüler/innen ankreuzen: Sie erhalten keine Beurteilung.</p>
          <table>
            <thead>
              <tr>
                <th>Schüler/in (abwesend)</th><th>Repository</th>
                <th class="num">Hinzugefügt</th><th class="num">Entfernt</th><th class="num">Gesamt</th>
                <th>Ergebnis</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in preview.result.rows" :key="row.username" :class="{ absent: absent.has(row.studentId) }">
                <td>
                  <label class="absent-toggle">
                    <input type="checkbox" :checked="absent.has(row.studentId)" @change="toggleAbsent(row.studentId)" />
                    {{ row.studentName }}
                  </label>
                </td>
                <td>{{ row.repo }}</td>
                <td class="num">{{ row.added }}</td>
                <td class="num">{{ row.removed }}</td>
                <td class="num">{{ row.total }}</td>
                <td>
                  <span v-if="row.status === 'error'" class="error">Fehler: {{ row.error }} (übersprungen)</span>
                  <template v-else-if="row.status !== 'graded'">
                    <span class="fail">MINUS</span> <span class="muted">{{ statusText[row.status] }}</span>
                  </template>
                  <span v-else-if="row.passes" class="pass">PASS</span>
                  <span v-else class="fail">FAIL</span>
                </td>
              </tr>
            </tbody>
          </table>
        </template>
        <p>
          Es werden {{ grades.length }} Beurteilungen eingetragen
          ({{ grades.filter((g) => g.symbol === 'PLUS').length }} × +,
          {{ grades.filter((g) => g.symbol === 'MINUS').length }} × −).
        </p>
        <p v-if="preview.result.unmappedUsers.length > 0" class="muted">
          Nicht zugeordnete Benutzer (nicht bewertet): {{ preview.result.unmappedUsers.map((u) => u.username).join(', ') }}
        </p>
        <p v-if="preview.result.studentsWithoutUser.length > 0" class="muted">
          Ohne GitHub-Benutzer: {{ preview.result.studentsWithoutUser.map((s) => `${s.firstName} ${s.lastName}`).join(', ') }}
        </p>
      </template>
    </template>
  </section>
</template>
