<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { PluginContext } from '../window';
import { errorText, unwrap } from '../core/bridge';
import type { Classroom } from '../core/classroom50';
import { discoverClassrooms } from '../core/classroomRemote';
import { createGithubClient, verifyToken } from '../core/github';
import { SECRET_TOKEN, loadToken, type Settings } from '../core/store';

const props = defineProps<{ context: PluginContext; settings: Settings; save: (settings: Settings) => Promise<void> }>();

const form = ref<Settings>({ ...props.settings });
const categories = computed(() => props.context.categories.filter((c) => c.gradingType === 'TERTIARY'));
const settingsMessage = ref('');
const settingsError = ref('');

const classrooms = ref<Classroom[]>([]);
const classroomProblems = ref<string[]>([]);
const classroomsLoading = ref(false);
const classroomError = ref('');

const tokenInput = ref('');
const tokenStored = ref(false);
const tokenMessage = ref('');
const tokenError = ref('');
const testing = ref(false);

onMounted(async () => {
  try {
    tokenStored.value = (await loadToken(window.grader)) !== null;
  } catch (error) {
    tokenError.value = errorText(error);
  }
});

const classroomOptions = computed(() => {
  const known = classrooms.value.map((c) => ({ shortName: c.shortName, dir: c.dir, label: c.name }));
  const chosen = form.value.classroom;
  return chosen !== '' && !known.some((c) => c.shortName === chosen)
    ? [{ shortName: chosen, dir: form.value.classroomDir, label: chosen }, ...known]
    : known;
});

function chooseClassroom(shortName: string): void {
  form.value.classroom = shortName;
  form.value.classroomDir = classroomOptions.value.find((c) => c.shortName === shortName)?.dir ?? '';
}

async function currentToken(): Promise<string | null> {
  return tokenInput.value.trim() !== '' ? tokenInput.value.trim() : await loadToken(window.grader);
}

async function loadClassrooms(): Promise<void> {
  classroomError.value = '';
  classroomProblems.value = [];
  if (form.value.organization.trim() === '') {
    classroomError.value = 'Bitte zuerst die Organisation eintragen.';
    return;
  }
  classroomsLoading.value = true;
  try {
    const token = await currentToken();
    if (token === null) {
      classroomError.value = 'Es ist noch kein Token gespeichert.';
      return;
    }
    const found = await discoverClassrooms(createGithubClient({ token }), form.value.organization.trim(), form.value.stateRepo.trim() || 'classroom50');
    classrooms.value = found.classrooms;
    classroomProblems.value = found.problems;
    if (found.classrooms.length === 0) classroomError.value = 'Im Repository wurde keine Klasse (Ordner mit classroom.json) gefunden.';
    else if (form.value.classroom === '' && found.classrooms.length === 1 && found.classrooms[0]) chooseClassroom(found.classrooms[0].shortName);
  } catch (error) {
    classroomError.value = errorText(error);
  } finally {
    classroomsLoading.value = false;
  }
}

async function saveSettings(): Promise<void> {
  settingsMessage.value = '';
  settingsError.value = '';
  const size = Number(form.value.minimumCommitSize);
  if (!Number.isInteger(size) || size < 0) {
    settingsError.value = 'Die Mindestgröße muss eine ganze Zahl ab 0 sein.';
    return;
  }
  try {
    await props.save({
      ...form.value,
      organization: form.value.organization.trim(),
      stateRepo: form.value.stateRepo.trim() || 'classroom50',
      minimumCommitSize: size,
    });
    settingsMessage.value = 'Gespeichert.';
  } catch (error) {
    settingsError.value = errorText(error);
  }
}

async function saveToken(): Promise<void> {
  tokenMessage.value = '';
  tokenError.value = '';
  const value = tokenInput.value.trim();
  if (value === '') {
    tokenError.value = 'Bitte ein Token einfügen.';
    return;
  }
  try {
    unwrap(await window.grader.secrets.set(SECRET_TOKEN, value));
    tokenInput.value = '';
    tokenStored.value = true;
    tokenMessage.value = 'Token verschlüsselt auf diesem Computer gespeichert.';
  } catch (error) {
    tokenError.value = errorText(error);
  }
}

async function removeToken(): Promise<void> {
  tokenMessage.value = '';
  tokenError.value = '';
  try {
    unwrap(await window.grader.secrets.delete(SECRET_TOKEN));
    tokenStored.value = false;
    tokenMessage.value = 'Token gelöscht.';
  } catch (error) {
    tokenError.value = errorText(error);
  }
}

async function testConnection(): Promise<void> {
  tokenMessage.value = '';
  tokenError.value = '';
  testing.value = true;
  try {
    const token = await currentToken();
    if (token === null) {
      tokenError.value = 'Es ist noch kein Token gespeichert.';
      return;
    }
    const client = createGithubClient({ token });
    const login = await verifyToken(client);
    tokenMessage.value = `Verbunden als ${login}.`;
    const owner = form.value.organization.trim();
    if (form.value.mode === 'classroom50' && owner !== '') {
      const state = form.value.stateRepo.trim() || 'classroom50';
      const found = await discoverClassrooms(client, owner, state);
      tokenMessage.value += ` Das Repository „${state}“ ist lesbar (${found.classrooms.length} Klasse(n)).`;
    }
  } catch (error) {
    tokenError.value = errorText(error);
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <section>
    <h2>GitHub-Token</h2>
    <p class="muted">
      Ein „Fine-grained personal access token“ mit Lesezugriff (Contents, Metadata) auf die Schüler-Repositories
      <strong>und zusätzlich</strong> auf das Repository <code>classroom50</code> der Organisation. Es wird für alle Kurse gemeinsam und verschlüsselt auf diesem Computer gespeichert.
    </p>
    <div class="field">
      <label for="token">Token {{ tokenStored ? '(gespeichert, zum Ersetzen neu einfügen)' : '' }}</label>
      <input id="token" v-model="tokenInput" type="password" autocomplete="off" placeholder="github_pat_…" />
    </div>
    <div class="actions">
      <button :disabled="tokenInput.trim() === ''" @click="saveToken">Token speichern</button>
      <button class="secondary" :disabled="testing || (!tokenStored && tokenInput.trim() === '')" @click="testConnection">
        Verbindung testen
      </button>
      <button v-if="tokenStored" class="secondary" @click="removeToken">Token löschen</button>
    </div>
    <p v-if="tokenMessage" class="success">{{ tokenMessage }}</p>
    <p v-if="tokenError" class="error">{{ tokenError }}</p>

    <h2>Dieser Kurs</h2>
    <div class="field">
      <label for="org">Organisation (oder Benutzer)</label>
      <input id="org" v-model="form.organization" type="text" placeholder="meine-klasse-org" />
    </div>
    <div class="field">
      <label>Vorgehen</label>
      <label><input v-model="form.mode" type="radio" value="classroom50" /> Classroom 50 (Aufgabe wählen)</label>
      <label><input v-model="form.mode" type="radio" value="manual" /> Manuell (Präfix + Zuordnung)</label>
    </div>
    <template v-if="form.mode === 'classroom50'">
      <div class="field">
        <label for="state">Repository mit dem Classroom-50-Status</label>
        <input id="state" v-model="form.stateRepo" type="text" placeholder="classroom50" />
      </div>
      <div class="field">
        <label for="classroom">Klasse</label>
        <select id="classroom" :value="form.classroom" @change="chooseClassroom(($event.target as HTMLSelectElement).value)">
          <option value="">Bitte wählen</option>
          <option v-for="c in classroomOptions" :key="c.shortName" :value="c.shortName">{{ c.label }}</option>
        </select>
        <div class="actions">
          <button class="secondary" :disabled="classroomsLoading" @click="loadClassrooms">
            {{ classroomsLoading ? 'Lade …' : 'Klassen laden' }}
          </button>
        </div>
        <span v-if="classroomError" class="error">{{ classroomError }}</span>
        <ul v-if="classroomProblems.length > 0" class="error">
          <li v-for="p in classroomProblems" :key="p">{{ p }}</li>
        </ul>
      </div>
    </template>
    <div v-else class="field">
      <label for="prefix">Präfix der Repository-Namen</label>
      <input id="prefix" v-model="form.prefix" type="text" placeholder="team-project-" />
    </div>
    <div class="field">
      <label for="min">Mindestgröße (Zeilen hinzugefügt + entfernt)</label>
      <input id="min" v-model.number="form.minimumCommitSize" type="number" min="0" step="1" />
    </div>
    <div class="field">
      <label for="category">Kategorie für die Beurteilung (+ ~ −)</label>
      <select id="category" v-model="form.categoryId">
        <option value="">Bitte wählen</option>
        <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.title }}</option>
      </select>
      <span v-if="categories.length === 0" class="error">Dieser Kurs hat keine Kategorie mit + ~ −.</span>
    </div>
    <div class="field">
      <label for="session">Eintragen in die Sitzung</label>
      <select id="session" v-model="form.sessionMode">
        <option value="endOfRange">Enddatum des Zeitraums</option>
        <option value="today">Heute</option>
      </select>
    </div>
    <div class="actions">
      <button @click="saveSettings">Speichern</button>
    </div>
    <p v-if="settingsMessage" class="success">{{ settingsMessage }}</p>
    <p v-if="settingsError" class="error">{{ settingsError }}</p>
  </section>
</template>
