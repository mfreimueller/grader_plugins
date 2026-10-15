<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { PluginContext, PluginStudent } from '../window';
import { errorText } from '../core/bridge';
import { createGithubClient, listOrgRepos } from '../core/github';
import type { RepoMapping, Settings } from '../core/store';
import { loadToken } from '../core/store';

const props = defineProps<{
  context: PluginContext;
  settings: Settings;
  mapping: RepoMapping;
  save: (mapping: RepoMapping) => Promise<void>;
}>();

const repos = ref<string[] | null>(null);
const loading = ref(false);
const error = ref('');

const students = computed(() => props.context.courseStudents);
const byId = computed(() => new Map(students.value.map((s) => [s.id, s] as const)));
const fullName = (s: PluginStudent): string => `${s.firstName} ${s.lastName}`;
const projectName = (repo: string): string => (repo.startsWith(props.settings.prefix) ? repo.slice(props.settings.prefix.length) : repo);

const idsOf = (repo: string): string[] => (props.mapping[repo] ?? []).filter((id) => byId.value.has(id));
const unassignedRepos = computed(() => (repos.value ?? []).filter((r) => idsOf(r).length === 0));
const studentsWithoutRepo = computed(() => {
  const listed = new Set(repos.value ?? []);
  const assigned = new Set(Object.entries(props.mapping).filter(([r]) => listed.has(r)).flatMap(([, ids]) => ids));
  return students.value.filter((s) => !assigned.has(s.id));
});

async function loadRepos(): Promise<void> {
  error.value = '';
  if (props.settings.organization === '') {
    error.value = 'Bitte zuerst unter „Einstellungen“ die Organisation eintragen.';
    return;
  }
  loading.value = true;
  try {
    const token = await loadToken(window.grader);
    if (token === null) {
      error.value = 'Bitte zuerst unter „Einstellungen“ ein GitHub-Token speichern.';
      return;
    }
    repos.value = await listOrgRepos(createGithubClient({ token }), props.settings.organization, props.settings.prefix);
  } catch (e) {
    error.value = errorText(e);
  } finally {
    loading.value = false;
  }
}

async function update(repo: string, ids: string[]): Promise<void> {
  error.value = '';
  const next: RepoMapping = { ...props.mapping };
  if (ids.length === 0) delete next[repo];
  else next[repo] = ids;
  try {
    await props.save(next);
  } catch (e) {
    error.value = errorText(e);
  }
}

async function add(repo: string, event: Event): Promise<void> {
  const select = event.target as HTMLSelectElement;
  const id = select.value;
  select.value = '';
  if (id !== '') await update(repo, [...idsOf(repo), id]);
}

const remove = (repo: string, id: string): Promise<void> =>
  update(repo, idsOf(repo).filter((x) => x !== id));

onMounted(() => {
  if (props.settings.organization !== '') void loadRepos();
});
</script>

<template>
  <section>
    <h2>Zuordnung der Repositories</h2>
    <p class="muted">
      Weisen Sie jedem Repository seine Schüler/innen zu (bei Teamprojekten mehrere). Alle bekommen später die
      Beurteilung des Repositories.
    </p>
    <div class="actions">
      <button :disabled="loading" @click="loadRepos">{{ loading ? 'Lade …' : 'Repositories laden' }}</button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>

    <template v-if="repos">
      <p v-if="repos.length === 0" class="muted">Keine Repositories mit dem Präfix „{{ settings.prefix }}“ gefunden.</p>
      <table v-else>
        <thead>
          <tr><th>Projekt</th><th>Schüler/innen</th><th>Hinzufügen</th></tr>
        </thead>
        <tbody>
          <tr v-for="repo in repos" :key="repo">
            <td>{{ projectName(repo) }}</td>
            <td>
              <span v-for="id in idsOf(repo)" :key="id" class="chip">
                {{ fullName(byId.get(id) as PluginStudent) }}
                <button :aria-label="`Entfernen`" @click="remove(repo, id)">×</button>
              </span>
              <span v-if="idsOf(repo).length === 0" class="muted">Nicht zugeordnet</span>
            </td>
            <td>
              <select :aria-label="`Schüler/in zu ${projectName(repo)} hinzufügen`" @change="add(repo, $event)">
                <option value="">Wählen …</option>
                <option v-for="s in students.filter((x) => !idsOf(repo).includes(x.id))" :key="s.id" :value="s.id">
                  {{ fullName(s) }}
                </option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="row">
        <div>
          <h3>Repositories ohne Schüler/innen ({{ unassignedRepos.length }})</h3>
          <p v-if="unassignedRepos.length === 0" class="muted">Alle zugeordnet.</p>
          <ul v-else><li v-for="r in unassignedRepos" :key="r">{{ projectName(r) }}</li></ul>
        </div>
        <div>
          <h3>Schüler/innen ohne Repository ({{ studentsWithoutRepo.length }})</h3>
          <p v-if="studentsWithoutRepo.length === 0" class="muted">Alle haben ein Repository.</p>
          <ul v-else><li v-for="s in studentsWithoutRepo" :key="s.id">{{ fullName(s) }}</li></ul>
        </div>
      </div>
    </template>
  </section>
</template>
