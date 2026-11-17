<script setup lang="ts">
import { ref } from 'vue';
import { errorText } from '../core/bridge';
import { parseMoodleCourseId } from '../core/courseId';
import type { MoodleClient } from '../core/moodleClient';
import type { MoodleCourse, SiteInfo } from '../core/types';

const props = defineProps<{ client: MoodleClient | null; site: SiteInfo | null; courseId: number | null; save: (id: number) => Promise<void> }>();

const input = ref(props.courseId === null ? '' : String(props.courseId));
const courses = ref<MoodleCourse[]>([]);
const loading = ref(false);
const error = ref('');
const message = ref('');

async function apply(id: number): Promise<void> {
  try {
    await props.save(id);
    input.value = String(id);
    message.value = `Moodle-Kurs ${id} gespeichert.`;
  } catch (e) {
    error.value = errorText(e);
  }
}

async function onSaveInput(): Promise<void> {
  error.value = '';
  message.value = '';
  const parsed = parseMoodleCourseId(input.value);
  if (!parsed.ok) error.value = parsed.error;
  else await apply(parsed.value);
}

async function loadCourses(): Promise<void> {
  error.value = '';
  if (props.client === null || props.site === null) {
    error.value = 'Bitte zuerst unter „Verbindung“ ein Token speichern.';
    return;
  }
  loading.value = true;
  const result = await props.client.getUserCourses(props.site.userId);
  loading.value = false;
  if (result.ok) courses.value = result.value;
  else error.value = result.error;
}
</script>

<template>
  <section>
    <h2>Moodle-Kurs</h2>
    <p class="muted">Der Kurs wird pro Grader-Kurs gespeichert.</p>
    <div class="field">
      <label for="course">Kurs-ID oder Kurs-Link</label>
      <input id="course" v-model="input" placeholder="12706 oder https://moodle.spengergasse.at/course/view.php?id=12706" />
    </div>
    <div class="actions">
      <button :disabled="input.trim() === ''" @click="onSaveInput">Speichern</button>
      <button class="secondary" :disabled="loading" @click="loadCourses">Meine Kurse laden</button>
    </div>
    <p v-if="message" class="success">{{ message }}</p>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="loading" class="muted">Lade …</p>
    <table v-if="courses.length > 0">
      <thead><tr><th>Kurs</th><th>Kurzname</th><th>ID</th><th></th></tr></thead>
      <tbody>
        <tr v-for="course in courses" :key="course.id">
          <td>{{ course.fullName }}</td>
          <td>{{ course.shortName }}</td>
          <td class="num">{{ course.id }}</td>
          <td><button class="secondary" @click="apply(course.id)">{{ course.id === courseId ? 'Gewählt' : 'Wählen' }}</button></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
