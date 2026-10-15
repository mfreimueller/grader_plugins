<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { PluginContext } from '../window';
import type { ClassroomData } from '../core/classroomRemote';
import type { GithubUsers } from '../core/classroomStore';
import { errorText } from '../core/bridge';
import { effectiveMapping } from '../core/nameMatch';

const props = defineProps<{
  context: PluginContext;
  data: ClassroomData | null;
  loading: boolean;
  error: string;
  githubUsers: GithubUsers;
  save: (users: GithubUsers) => Promise<void>;
  reload: () => void;
}>();

const students = computed(() => props.context.courseStudents);
const roster = computed(() => props.data?.roster ?? []);
// The draft starts with the stored mapping plus the name matches; saving confirms all of it.
const draft = ref<GithubUsers>({});
const message = ref('');
const saveError = ref('');

watch(
  [roster, students, () => props.githubUsers],
  () => (draft.value = effectiveMapping(roster.value, students.value, props.githubUsers)),
  { immediate: true },
);

const takenElsewhere = (username: string): Set<string> =>
  new Set(Object.entries(draft.value).filter(([u]) => u !== username).map(([, id]) => id));
const optionsFor = (username: string) => students.value.filter((s) => !takenElsewhere(username).has(s.id));
const unmatchedUsers = computed(() => roster.value.filter((r) => !(r.username in draft.value)));
const unmatchedStudents = computed(() => {
  const taken = new Set(Object.values(draft.value));
  return students.value.filter((s) => !taken.has(s.id));
});
const fullName = (first: string, last: string): string => `${first} ${last}`.trim();

function assign(username: string, event: Event): void {
  const id = (event.target as HTMLSelectElement).value;
  const next = { ...draft.value };
  if (id === '') delete next[username];
  else next[username] = id;
  draft.value = next;
  message.value = '';
}

async function save(): Promise<void> {
  message.value = '';
  saveError.value = '';
  try {
    await props.save({ ...draft.value });
    message.value = 'Zuordnung gespeichert.';
  } catch (e) {
    saveError.value = errorText(e);
  }
}
</script>

<template>
  <section>
    <h2>Zuordnung der GitHub-Benutzer</h2>
    <p class="muted">
      Die Schüler/innen der Klassenliste (Rolle „student“) werden nach dem Namen den Schüler/innen dieses Kurses
      zugeordnet. Prüfen Sie die Zuordnung, ändern Sie sie bei Bedarf und speichern Sie sie. Gespeichert wird nur
      „Benutzername → Schüler/in“.
    </p>
    <div class="actions">
      <button :disabled="loading" @click="reload">{{ loading ? 'Lade …' : 'Klassenliste neu laden' }}</button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="!data && !loading" class="muted">Bitte zuerst unter „Einstellungen“ eine Klasse wählen.</p>

    <template v-if="data">
      <p v-if="roster.length === 0" class="muted">Die Klassenliste enthält keine Schüler/innen.</p>
      <table v-else>
        <thead>
          <tr><th>GitHub-Benutzer</th><th>Name in der Klassenliste</th><th>Schüler/in in Grader</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in roster" :key="r.username">
            <td>{{ r.username }}</td>
            <td>{{ fullName(r.firstName, r.lastName) }}</td>
            <td>
              <select :aria-label="`Schüler/in für ${r.username}`" :value="draft[r.username] ?? ''" @change="assign(r.username, $event)">
                <option value="">Nicht zugeordnet</option>
                <option v-for="s in optionsFor(r.username)" :key="s.id" :value="s.id">{{ s.firstName }} {{ s.lastName }}</option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="actions"><button @click="save">Zuordnung speichern</button></div>
      <p v-if="message" class="success">{{ message }}</p>
      <p v-if="saveError" class="error">{{ saveError }}</p>

      <div class="row">
        <div>
          <h3>Benutzer ohne Schüler/in ({{ unmatchedUsers.length }})</h3>
          <p v-if="unmatchedUsers.length === 0" class="muted">Alle zugeordnet.</p>
          <ul v-else><li v-for="r in unmatchedUsers" :key="r.username">{{ r.username }} ({{ fullName(r.firstName, r.lastName) }})</li></ul>
        </div>
        <div>
          <h3>Schüler/innen ohne Benutzer ({{ unmatchedStudents.length }})</h3>
          <p v-if="unmatchedStudents.length === 0" class="muted">Alle haben einen Benutzer.</p>
          <ul v-else><li v-for="s in unmatchedStudents" :key="s.id">{{ s.firstName }} {{ s.lastName }}</li></ul>
        </div>
      </div>
    </template>
  </section>
</template>
