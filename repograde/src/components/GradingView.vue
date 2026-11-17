<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { PluginContext } from '../window';
import { commitGrades, deleteAssessments } from '../core/assess';
import { errorText } from '../core/bridge';
import { createGithubClient, fetchAllRepoTotals, listOrgRepos } from '../core/github';
import { gradeRepos, withoutAbsent, type GradingResult } from '../core/grading';
import {
  formatRangeTitle,
  resolveRange,
  sessionTarget,
  type DateRange,
  type LastRun,
  type RangeMode,
} from '../core/range';
import { loadToken, type RepoMapping, type Settings } from '../core/store';

const props = defineProps<{
  context: PluginContext;
  settings: Settings;
  mapping: RepoMapping;
  lastRun: LastRun | null;
  saveLastRun: (run: LastRun) => Promise<void>;
}>();

const mode = ref<RangeMode>('sinceLastRun');
const manualFrom = ref(props.context.today);
const manualTo = ref(props.context.today);

const busy = ref(false);
const progress = ref('');
const error = ref('');
const message = ref('');
const warnings = ref<string[]>([]);
const preview = ref<{ result: GradingResult; range: DateRange } | null>(null);
// Students marked absent get no assessment. Kept across checks, so re-checking does not lose the marks.
const absent = ref(new Set<string>());
const grades = computed(() => withoutAbsent(preview.value?.result.grades ?? [], absent.value));

function toggleAbsent(studentId: string): void {
  const next = new Set(absent.value);
  if (!next.delete(studentId)) next.add(studentId);
  absent.value = next;
}

const students = computed(() => props.context.courseStudents);
const nameOf = (id: string): string => {
  const s = students.value.find((x) => x.id === id);
  return s ? `${s.firstName} ${s.lastName}` : id;
};
const fmt = (d: Date): string => d.toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' });
const lastRunText = computed(() =>
  props.lastRun ? `${fmt(new Date(props.lastRun.from))} – ${fmt(new Date(props.lastRun.to))}` : 'noch keiner',
);
const canUndo = computed(() => (props.lastRun?.assessmentIds.length ?? 0) > 0);

// A preview belongs to the range it was made for: changing the range invalidates it.
watch([mode, manualFrom, manualTo], () => {
  preview.value = null;
});

function reset(): void {
  error.value = '';
  message.value = '';
  warnings.value = [];
}

function requireSetup(): string | null {
  if (props.settings.organization === '') return 'Bitte zuerst unter „Einstellungen“ die Organisation eintragen.';
  if (props.settings.categoryId === '') return 'Bitte zuerst unter „Einstellungen“ eine Kategorie wählen.';
  return null;
}

async function check(): Promise<void> {
  reset();
  preview.value = null;
  const missing = requireSetup();
  if (missing) {
    error.value = missing;
    return;
  }
  const range = resolveRange({
    mode: mode.value,
    lastRun: props.lastRun,
    now: new Date(),
    today: props.context.today,
    manualFrom: manualFrom.value,
    manualTo: manualTo.value,
  });
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
    const client = createGithubClient({ token });
    progress.value = 'Lese Repositories …';
    const repos = await listOrgRepos(client, props.settings.organization, props.settings.prefix);
    const outcomes = await fetchAllRepoTotals(client, props.settings.organization, repos, range.value.from, range.value.to, {
      onProgress: (done, total) => (progress.value = `Lese Commits … ${done} von ${total}`),
    });
    const result = gradeRepos({
      outcomes,
      repoMapping: props.mapping,
      minimumCommitSize: props.settings.minimumCommitSize,
      prefix: props.settings.prefix,
      students: students.value,
    });
    preview.value = { result, range: range.value };
  } catch (e) {
    error.value = errorText(e);
  } finally {
    busy.value = false;
    progress.value = '';
  }
}

async function commit(): Promise<void> {
  const current = preview.value;
  if (!current) return;
  reset();
  busy.value = true;
  try {
    const { range, result } = current;
    const done = await commitGrades(
      window.grader,
      grades.value,
      props.settings.categoryId,
      sessionTarget(props.settings.sessionMode, range),
      formatRangeTitle(range),
    );
    if (done.assessmentIds.length > 0) {
      await props.saveLastRun({ from: range.from.toISOString(), to: range.to.toISOString(), assessmentIds: done.assessmentIds });
    }
    message.value = `${done.assessmentIds.length} Beurteilungen eingetragen.`;
    warnings.value = [
      ...done.failures.map((f) => `${nameOf(f.studentId)}: ${f.message}`),
      ...result.erroredRepos.map((r) => `Repository ${r} übersprungen (Fehler beim Lesen).`),
    ];
    preview.value = null;
  } catch (e) {
    error.value = errorText(e);
  } finally {
    busy.value = false;
  }
}

async function undo(): Promise<void> {
  const run = props.lastRun;
  if (!run) return;
  reset();
  busy.value = true;
  try {
    const remaining = await deleteAssessments(window.grader, run.assessmentIds);
    // The undone run no longer counts: the next run starts where it started.
    await props.saveLastRun({ from: run.from, to: remaining.length > 0 ? run.to : run.from, assessmentIds: remaining });
    if (remaining.length > 0) error.value = `${remaining.length} Beurteilungen konnten nicht gelöscht werden.`;
    else message.value = 'Letzter Lauf rückgängig gemacht.';
  } catch (e) {
    error.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section>
    <h2>Zeitraum</h2>
    <div class="field">
      <label><input v-model="mode" type="radio" value="sinceLastRun" /> Seit dem letzten Lauf</label>
      <span class="muted">Letzter Lauf: {{ lastRunText }}. Ohne früheren Lauf: die letzten 7 Tage.</span>
      <label><input v-model="mode" type="radio" value="manual" /> Zeitraum wählen</label>
    </div>
    <div v-if="mode === 'manual'" class="row">
      <div class="field">
        <label for="from">Von</label>
        <input id="from" v-model="manualFrom" type="date" :max="context.today" />
      </div>
      <div class="field">
        <label for="to">Bis (einschließlich)</label>
        <input id="to" v-model="manualTo" type="date" :max="context.today" />
      </div>
    </div>
    <div class="actions">
      <button :disabled="busy" @click="check">Prüfen</button>
      <button v-if="preview" :disabled="busy || grades.length === 0" @click="commit">Eintragen</button>
      <button v-if="canUndo" class="secondary" :disabled="busy" @click="undo">Letzten Lauf rückgängig</button>
      <span v-if="progress" class="muted">{{ progress }}</span>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="message" class="success">{{ message }}</p>
    <ul v-if="warnings.length > 0" class="error">
      <li v-for="w in warnings" :key="w">{{ w }}</li>
    </ul>

    <template v-if="preview">
      <h2>Vorschau: {{ formatRangeTitle(preview.range) }}</h2>
      <p v-if="preview.result.rows.length === 0" class="muted">Keine Repositories gefunden.</p>
      <template v-else>
        <p class="muted">Abwesende Schüler/innen ankreuzen: Sie erhalten keine Beurteilung.</p>
        <table>
          <thead>
            <tr>
              <th>Projekt</th><th>Schüler/innen (abwesend)</th>
              <th class="num">Hinzugefügt</th><th class="num">Entfernt</th><th class="num">Gesamt</th>
              <th>Ergebnis</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in preview.result.rows" :key="row.repo">
              <td>{{ row.projectName }}</td>
              <td>
                <label
                  v-for="(id, i) in row.studentIds"
                  :key="id"
                  class="absent-toggle"
                  :class="{ absent: absent.has(id) }"
                >
                  <input type="checkbox" :checked="absent.has(id)" @change="toggleAbsent(id)" />
                  {{ row.studentNames[i] }}
                </label>
                <span v-if="row.studentIds.length === 0" class="muted">nicht zugeordnet</span>
              </td>
              <td class="num">{{ row.added }}</td>
              <td class="num">{{ row.removed }}</td>
              <td class="num">{{ row.total }}</td>
              <td>
                <span v-if="row.error" class="error">Fehler: {{ row.error }}</span>
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
      <p v-if="preview.result.erroredRepos.length > 0" class="error">
        Mit Fehler übersprungen: {{ preview.result.erroredRepos.join(', ') }}
      </p>
      <p v-if="preview.result.studentsWithoutRepo.length > 0" class="muted">
        Ohne Repository: {{ preview.result.studentsWithoutRepo.map((s) => `${s.firstName} ${s.lastName}`).join(', ') }}
      </p>
    </template>
  </section>
</template>
