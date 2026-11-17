<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { PluginAssessment, PluginContext } from '../window';
import { errorText, unwrap } from '../core/bridge';
import { classifyAssignments, type AssignmentChoice } from '../core/assignments';
import { assessmentLabel, pickCandidates } from '../core/assessments';
import { buildDiff, pendingConfirmations, rowsToSend } from '../core/buildDiff';
import { matchStudents } from '../core/matchStudents';
import type { MoodleClient } from '../core/moodleClient';
import { deleteLink, loadLink, loadStudentMap, saveLink, saveStudentMap } from '../core/store';
import { prepareSync, runSync, type SyncState } from '../core/syncFlow';
import type { TransferKind } from '../core/kinds';
import type { MoodleAssignment } from '../core/types';
import type { VerifyReport } from '../core/verifyAfterSave';
import PreviewTable from './PreviewTable.vue';

const props = defineProps<{ client: MoodleClient | null; courseId: number | null; context: PluginContext }>();

const assessments = ref<PluginAssessment[]>([]);
const assignments = ref<MoodleAssignment[]>([]);
const studentMap = ref<Record<string, number>>({});
const assessmentId = ref('');
const assignmentId = ref<number | null>(null);
const state = ref<SyncState | null>(null);
const loading = ref(false);
const busy = ref(false);
const error = ref('');
const report = ref<VerifyReport | null>(null);
const sentCount = ref(0);

const assessment = computed(() => assessments.value.find((a) => a.id === assessmentId.value) ?? null);
const choices = computed<AssignmentChoice[]>(() => (assessment.value === null ? [] : classifyAssignments(assignments.value, assessment.value)));
const kind = computed<TransferKind | null>(() => (state.value?.kind.ok ? state.value.kind.value.kind : null));
const unverified = computed(() => (state.value?.kind.ok ? state.value.kind.value.unverified : false));
const scaleConfirmed = ref(false);
const confirmedZero = ref<ReadonlySet<string>>(new Set());
const SCALE_NAMES: Record<string, string> = {
  symbols5: 'Symbol-Skala (-- - ~ + ++)',
  symbols3: '3-stufige Symbol-Skala (- ~ +)',
  grades: 'Notenskala (5 4 3 2 1)',
};
const scaleName = computed(() => (kind.value === null ? '' : (SCALE_NAMES[kind.value.id] ?? '')));
const zeroHint = computed(() => (kind.value?.id === 'grades' ? '0 Punkte – wirklich Nicht genügend?' : '0 Punkte – wirklich 0 eintragen?'));
const pending = computed(() => pendingConfirmations(rows.value, confirmedZero.value));
const canTransfer = computed(() => kind.value !== null && (!unverified.value || scaleConfirmed.value));
const match = computed(() => (state.value === null ? null : matchStudents(props.context.courseStudents, state.value.moodleStudents, studentMap.value)));
const mapping = computed(() => Object.fromEntries((match.value?.matched ?? []).map((p) => [p.grader.id, p.moodle.id])));
const rows = computed(() =>
  assessment.value === null || state.value === null || kind.value === null
    ? []
    : buildDiff({ kind: kind.value, students: props.context.courseStudents, results: assessment.value.results, mapping: mapping.value, current: state.value.items }),
);
const toSend = computed(() => rowsToSend(rows.value, confirmedZero.value));
const blocked = computed(() => (state.value !== null && !state.value.kind.ok ? state.value.kind.error : ''));

async function init(): Promise<void> {
  error.value = '';
  if (props.client === null || props.courseId === null) return;
  loading.value = true;
  try {
    assessments.value = pickCandidates(unwrap(await window.grader.assessment.list()));
    studentMap.value = await loadStudentMap(window.grader);
    const result = await props.client.getAssignments(props.courseId);
    if (result.ok) assignments.value = result.value;
    else error.value = result.error;
  } catch (e) {
    error.value = errorText(e);
  } finally {
    loading.value = false;
  }
}

async function loadPreview(): Promise<void> {
  state.value = null;
  report.value = null;
  error.value = '';
  confirmedZero.value = new Set();
  const assignment = assignments.value.find((a) => a.id === assignmentId.value);
  if (props.client === null || props.courseId === null || assignment === undefined || assessment.value === null) return;
  loading.value = true;
  const result = await prepareSync(props.client, props.courseId, assignment, assessment.value);
  loading.value = false;
  if (result.ok) state.value = result.value;
  else error.value = result.error;
}

async function onAssessmentChange(): Promise<void> {
  assignmentId.value = null;
  state.value = null;
  report.value = null;
  scaleConfirmed.value = false;
  confirmedZero.value = new Set();
  if (assessmentId.value === '') return;
  try {
    const linked = await loadLink(window.grader, assessmentId.value);
    if (linked !== null && choices.value.some((c) => c.selectable && c.assignment.id === linked)) assignmentId.value = linked;
  } catch (e) {
    error.value = errorText(e);
  }
  // A remembered assignment is set programmatically, which fires no @change: load its preview here.
  if (assignmentId.value !== null) await loadPreview();
}

async function onAssignmentChange(): Promise<void> {
  scaleConfirmed.value = false;
  try {
    if (assignmentId.value === null) await deleteLink(window.grader, assessmentId.value);
    else await saveLink(window.grader, assessmentId.value, assignmentId.value);
  } catch (e) {
    error.value = errorText(e);
  }
  await loadPreview();
}

function onConfirmZero(graderId: string, confirmed: boolean): void {
  const next = new Set(confirmedZero.value);
  if (confirmed) next.add(graderId);
  else next.delete(graderId);
  confirmedZero.value = next;
}

async function onAssign(graderId: string, moodleUserId: number | null): Promise<void> {
  if (moodleUserId === null) return;
  const next = { ...studentMap.value, [graderId]: moodleUserId };
  try {
    await saveStudentMap(window.grader, next);
    studentMap.value = next;
  } catch (e) {
    error.value = errorText(e);
  }
}

async function transfer(): Promise<void> {
  if (props.client === null || props.courseId === null || assignmentId.value === null || kind.value === null || !canTransfer.value) return;
  const send = toSend.value;
  const name = choices.value.find((c) => c.assignment.id === assignmentId.value)?.assignment.name ?? '';
  if (!window.confirm(`${send.length} Bewertungen in die Moodle-Aufgabe „${name}“ übertragen? Bestehende Bewertungen der betroffenen Schüler werden überschrieben.`)) return;
  busy.value = true;
  error.value = '';
  report.value = null;
  const result = await runSync(props.client, props.courseId, assignmentId.value, kind.value, send);
  busy.value = false;
  if (!result.ok) {
    error.value = result.error;
    return;
  }
  sentCount.value = send.length;
  // Refresh the preview (it clears the report), then show the verification.
  await loadPreview();
  report.value = result.value;
}

onMounted(init);
watch(() => [props.client, props.courseId], init);
</script>

<template>
  <section>
    <h2>Übertragen</h2>
    <p v-if="client === null || courseId === null" class="muted">Bitte zuerst Verbindung und Moodle-Kurs einrichten.</p>
    <template v-else>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="loading" class="muted">Lade …</p>
      <div class="row">
        <div class="field">
          <label for="assessment">Grader-Bewertung</label>
          <select id="assessment" v-model="assessmentId" @change="onAssessmentChange">
            <option value="">Bitte wählen …</option>
            <option v-for="a in assessments" :key="a.id" :value="a.id">{{ assessmentLabel(a) }}</option>
          </select>
          <span v-if="assessments.length === 0 && !loading" class="muted">Keine passende Bewertung (Symbole oder Punkte) gefunden.</span>
        </div>
        <div class="field">
          <label for="assignment">Moodle-Aufgabe</label>
          <select id="assignment" v-model.number="assignmentId" :disabled="assessmentId === ''" @change="onAssignmentChange">
            <option :value="null">Bitte wählen …</option>
            <option v-for="c in choices" :key="c.assignment.id" :value="c.assignment.id" :disabled="!c.selectable">
              {{ c.assignment.name }}{{ c.reason ? ` – ${c.reason}` : '' }}
            </option>
          </select>
        </div>
      </div>

      <p v-if="blocked" class="error"><strong>Übertragung gesperrt:</strong> {{ blocked }}</p>

      <template v-if="state && assessment && kind">
        <h2>Vorschau<span v-if="kind" class="muted"> – {{ kind.title }}</span></h2>
        <p v-if="kind?.hint" class="muted">{{ kind.hint }}</p>
        <div v-if="unverified" class="error">
          <p>
            <strong>Die Skala dieser Aufgabe konnte nicht geprüft werden (noch keine Bewertungen in Moodle).</strong>
            Ist das eine {{ scaleName }}?
          </p>
          <label><input v-model="scaleConfirmed" type="checkbox" /> Ja, die Skala passt</label>
        </div>
        <p v-if="pending > 0" class="error">{{ pending }} Zeilen mit 0 Punkten warten auf Bestätigung.</p>
        <PreviewTable :rows="rows" :unused="match?.unusedMoodle ?? []" :confirmed="confirmedZero" :zero-hint="zeroHint" @assign="onAssign" @confirm="onConfirmZero" />
        <div class="actions">
          <button :disabled="busy || !canTransfer || toSend.length === 0" @click="transfer">
            {{ toSend.length }} Bewertungen nach Moodle übertragen
          </button>
          <span v-if="busy" class="muted">Übertrage …</span>
        </div>
        <p class="muted">Gleiche Bewertungen ohne Notiz werden nicht gesendet; fehlende Bewertungen löschen nie etwas in Moodle.</p>
      </template>

      <template v-if="report">
        <p v-if="report.ok" class="success">{{ sentCount }} Bewertungen übertragen, Kontrolle in Moodle: alles stimmt.</p>
        <template v-else>
          <p v-if="report.scaleMessage" class="error"><strong>{{ report.scaleMessage }}</strong></p>
          <p class="error">Kontrolle: {{ report.mismatches.length }} von {{ report.checked }} Bewertungen stimmen nicht.</p>
          <ul>
            <li v-for="m in report.mismatches" :key="m.row.graderStudent.id" class="error">
              {{ m.row.graderStudent.lastName }} {{ m.row.graderStudent.firstName }}: gesendet {{ m.row.targetLabel }}, in Moodle {{ kind?.checksLabel ? 'Stufe ' : '' }}{{ m.actualValue ?? 'keine' }}{{ m.actualLabel ? ` („${m.actualLabel}“)` : '' }}
            </li>
          </ul>
        </template>
      </template>
    </template>
  </section>
</template>
