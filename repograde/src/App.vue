<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { PluginContext } from './window';
import { errorText, unwrap } from './core/bridge';
import type { LastRun } from './core/range';
import {
  DEFAULT_SETTINGS,
  loadLastRun,
  loadRepoMapping,
  loadSettings,
  loadToken,
  saveLastRun,
  saveRepoMapping,
  saveSettings,
  type RepoMapping,
  type Settings,
} from './core/store';
import { createGithubClient } from './core/github';
import { loadClassroomData, type ClassroomData } from './core/classroomRemote';
import {
  loadAssignmentRuns,
  loadGithubUsers,
  saveAssignmentRuns,
  saveGithubUsers,
  type AssignmentRuns,
  type GithubUsers,
} from './core/classroomStore';
import ClassroomGradingView from './components/ClassroomGradingView.vue';
import ClassroomMappingView from './components/ClassroomMappingView.vue';
import GradingView from './components/GradingView.vue';
import MappingView from './components/MappingView.vue';
import SettingsView from './components/SettingsView.vue';

type Tab = 'settings' | 'mapping' | 'grading';

const tab = ref<Tab>('grading');
const context = ref<PluginContext | null>(null);
const settings = ref<Settings>({ ...DEFAULT_SETTINGS });
const mapping = ref<RepoMapping>({});
const lastRun = ref<LastRun | null>(null);
const loadError = ref('');
const githubUsers = ref<GithubUsers>({});
const runs = ref<AssignmentRuns>({});
const classroom = ref<ClassroomData | null>(null);
const classroomLoading = ref(false);
const classroomError = ref('');

/** classroom.json, assignments.json and roster.csv of the chosen classroom. */
async function loadClassroom(): Promise<void> {
  classroom.value = null;
  classroomError.value = '';
  const { organization, stateRepo, classroomDir, classroom: chosen } = settings.value;
  if (settings.value.mode !== 'classroom50' || organization === '' || chosen === '' || classroomDir === '') return;
  classroomLoading.value = true;
  try {
    const token = await loadToken(window.grader);
    if (token === null) {
      classroomError.value = 'Bitte zuerst unter „Einstellungen“ ein GitHub-Token speichern.';
      return;
    }
    const data = await loadClassroomData(createGithubClient({ token }), organization, stateRepo, classroomDir);
    if (data.classroom.shortName !== chosen) {
      classroomError.value = `Im Ordner „${classroomDir}“ liegt jetzt die Klasse „${data.classroom.shortName}“. Bitte in den Einstellungen neu wählen.`;
      return;
    }
    classroom.value = data;
  } catch (error) {
    classroomError.value = errorText(error);
  } finally {
    classroomLoading.value = false;
  }
}

async function reloadContext(): Promise<void> {
  context.value = unwrap(await window.grader.context());
}

async function load(): Promise<void> {
  try {
    await reloadContext();
    [settings.value, mapping.value, lastRun.value, githubUsers.value, runs.value] = await Promise.all([
      loadSettings(window.grader),
      loadRepoMapping(window.grader),
      loadLastRun(window.grader),
      loadGithubUsers(window.grader),
      loadAssignmentRuns(window.grader),
    ]);
    const s = settings.value;
    if (s.organization === '' || (s.mode === 'classroom50' && s.classroom === '')) tab.value = 'settings';
    else void loadClassroom();
  } catch (error) {
    loadError.value = errorText(error);
  }
}

async function onSaveSettings(next: Settings): Promise<void> {
  await saveSettings(window.grader, next);
  const changed = next.classroom !== settings.value.classroom || next.stateRepo !== settings.value.stateRepo ||
    next.organization !== settings.value.organization || next.mode !== settings.value.mode;
  settings.value = next;
  if (changed) void loadClassroom();
}

async function onSaveGithubUsers(next: GithubUsers): Promise<void> {
  await saveGithubUsers(window.grader, next);
  githubUsers.value = next;
}

async function onSaveRuns(next: AssignmentRuns): Promise<void> {
  await saveAssignmentRuns(window.grader, next);
  runs.value = next;
}

async function useManual(): Promise<void> {
  await onSaveSettings({ ...settings.value, mode: 'manual' });
}

async function onSaveMapping(next: RepoMapping): Promise<void> {
  await saveRepoMapping(window.grader, next);
  mapping.value = next;
}

async function onSaveLastRun(next: LastRun): Promise<void> {
  await saveLastRun(window.grader, next);
  lastRun.value = next;
}

// Students and categories may change in Grader while this window is open.
const onFocus = (): void => {
  void reloadContext().catch(() => undefined);
};

onMounted(() => {
  void load();
  window.addEventListener('focus', onFocus);
});
onBeforeUnmount(() => window.removeEventListener('focus', onFocus));
</script>

<template>
  <header class="tabs">
    <button :class="{ active: tab === 'settings' }" @click="tab = 'settings'">Einstellungen</button>
    <button :class="{ active: tab === 'mapping' }" @click="tab = 'mapping'">Zuordnung</button>
    <button :class="{ active: tab === 'grading' }" @click="tab = 'grading'">Bewertung</button>
  </header>
  <main>
    <p v-if="loadError" class="error">{{ loadError }}</p>
    <p v-else-if="!context" class="muted">Lade …</p>
    <template v-else>
      <h1>{{ context.course.title }} <span class="muted">({{ context.schoolClass.name }})</span></h1>
      <SettingsView v-if="tab === 'settings'" :context="context" :settings="settings" :save="onSaveSettings" />
      <ClassroomMappingView
        v-else-if="tab === 'mapping' && settings.mode === 'classroom50'"
        :context="context"
        :data="classroom"
        :loading="classroomLoading"
        :error="classroomError"
        :github-users="githubUsers"
        :save="onSaveGithubUsers"
        :reload="loadClassroom"
      />
      <MappingView
        v-else-if="tab === 'mapping'"
        :context="context"
        :settings="settings"
        :mapping="mapping"
        :save="onSaveMapping"
      />
      <ClassroomGradingView
        v-else-if="settings.mode === 'classroom50'"
        :context="context"
        :settings="settings"
        :data="classroom"
        :loading="classroomLoading"
        :error="classroomError"
        :github-users="githubUsers"
        :runs="runs"
        :save-runs="onSaveRuns"
        :reload="loadClassroom"
        @use-manual="useManual"
      />
      <GradingView
        v-else
        :context="context"
        :settings="settings"
        :mapping="mapping"
        :last-run="lastRun"
        :save-last-run="onSaveLastRun"
      />
    </template>
  </main>
</template>
