<script setup lang="ts">
import { ref } from 'vue';
import type { SiteInfo } from '../core/types';

defineProps<{ hasToken: boolean; site: SiteInfo | null; busy: boolean; error: string }>();
const emit = defineEmits<{ save: [token: string]; remove: []; test: [] }>();

const tokenInput = ref('');

function onSave(): void {
  emit('save', tokenInput.value.trim());
  tokenInput.value = '';
}
</script>

<template>
  <section>
    <h2>Verbindung zu Moodle</h2>
    <p v-if="site" class="success">Verbunden mit {{ site.sitename }} als {{ site.fullName }}.</p>
    <p v-else-if="hasToken" class="muted">Ein Token ist gespeichert.</p>
    <p v-else class="muted">Es ist noch kein Token gespeichert.</p>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="field">
      <label for="token">{{ hasToken ? 'Token ersetzen' : 'Token' }}</label>
      <input id="token" v-model="tokenInput" type="password" autocomplete="off" placeholder="Webservice-Token (Dienst grade_import)" />
    </div>
    <div class="actions">
      <button :disabled="busy || tokenInput.trim() === ''" @click="onSave">Token speichern und prüfen</button>
      <button class="secondary" :disabled="busy || !hasToken" @click="emit('test')">Verbindung testen</button>
      <button class="secondary" :disabled="busy || !hasToken" @click="emit('remove')">Token löschen</button>
    </div>
    <p class="muted">
      Das Token wird verschlüsselt im Schlüsselspeicher des Betriebssystems abgelegt (pro Computer und Benutzerkonto).
    </p>
  </section>
</template>
