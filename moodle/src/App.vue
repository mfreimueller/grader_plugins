<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { PluginContext } from './window';
import { MOODLE_BASE_URL } from './config';
import { errorText, unwrap } from './core/bridge';
import { createMoodleClient, type MoodleClient } from './core/moodleClient';
import { clearToken, loadCourseId, loadToken, saveCourseId, saveToken } from './core/store';
import type { SiteInfo } from './core/types';
import ConnectionView from './components/ConnectionView.vue';
import CourseView from './components/CourseView.vue';
import SyncView from './components/SyncView.vue';

type Tab = 'connection' | 'course' | 'sync';

const tab = ref<Tab>('sync');
const context = ref<PluginContext | null>(null);
const token = ref<string | null>(null);
const site = ref<SiteInfo | null>(null);
const courseId = ref<number | null>(null);
const loadError = ref('');
const connectionError = ref('');
const connectionBusy = ref(false);

const client = computed<MoodleClient | null>(() =>
  token.value === null
    ? null
    : createMoodleClient({ baseUrl: MOODLE_BASE_URL, token: token.value, fetch: (url, init) => window.fetch(url, init) }),
);

async function testConnection(): Promise<void> {
  connectionError.value = '';
  site.value = null;
  if (client.value === null) return;
  connectionBusy.value = true;
  const result = await client.value.getSiteInfo();
  connectionBusy.value = false;
  if (result.ok) site.value = result.value;
  else connectionError.value = result.error;
}

async function onSaveToken(value: string): Promise<void> {
  try {
    await saveToken(window.grader, value);
    token.value = value;
    await testConnection();
  } catch (error) {
    connectionError.value = errorText(error);
  }
}

async function onRemoveToken(): Promise<void> {
  try {
    await clearToken(window.grader);
    token.value = null;
    site.value = null;
    connectionError.value = '';
  } catch (error) {
    connectionError.value = errorText(error);
  }
}

async function onSaveCourse(id: number): Promise<void> {
  await saveCourseId(window.grader, id);
  courseId.value = id;
}

async function load(): Promise<void> {
  try {
    context.value = unwrap(await window.grader.context());
    [token.value, courseId.value] = await Promise.all([loadToken(window.grader), loadCourseId(window.grader)]);
    if (token.value === null) tab.value = 'connection';
    else if (courseId.value === null) tab.value = 'course';
    void testConnection();
  } catch (error) {
    loadError.value = errorText(error);
  }
}

// Students may change in Grader while this window is open.
const onFocus = (): void => {
  void window.grader.context().then((r) => {
    if (r.ok) context.value = r.value;
  });
};

onMounted(() => {
  void load();
  window.addEventListener('focus', onFocus);
});
onBeforeUnmount(() => window.removeEventListener('focus', onFocus));
</script>

<template>
  <header class="tabs">
    <button :class="{ active: tab === 'connection' }" @click="tab = 'connection'">Verbindung</button>
    <button :class="{ active: tab === 'course' }" @click="tab = 'course'">Kurs</button>
    <button :class="{ active: tab === 'sync' }" @click="tab = 'sync'">Übertragen</button>
  </header>
  <main>
    <p v-if="loadError" class="error">{{ loadError }}</p>
    <p v-else-if="!context" class="muted">Lade …</p>
    <template v-else>
      <h1>{{ context.course.title }} <span class="muted">({{ context.schoolClass.name }})</span></h1>
      <ConnectionView
        v-if="tab === 'connection'"
        :has-token="token !== null"
        :site="site"
        :busy="connectionBusy"
        :error="connectionError"
        @save="onSaveToken"
        @remove="onRemoveToken"
        @test="testConnection"
      />
      <CourseView v-else-if="tab === 'course'" :client="client" :site="site" :course-id="courseId" :save="onSaveCourse" />
      <SyncView v-else :client="client" :course-id="courseId" :context="context" />
    </template>
  </main>
</template>
