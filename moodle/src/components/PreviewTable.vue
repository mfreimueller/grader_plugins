<script setup lang="ts">
import type { DiffRow, RowStatus } from '../core/buildDiff';
import type { MoodleStudent } from '../core/types';

defineProps<{ rows: DiffRow[]; unused: MoodleStudent[]; confirmed: ReadonlySet<string>; zeroHint: string }>();
const emit = defineEmits<{ assign: [graderId: string, moodleUserId: number | null]; confirm: [graderId: string, confirmed: boolean] }>();

const STATUS_TEXT: Record<RowStatus, string> = {
  new: 'neu',
  changed: 'geändert',
  same: 'gleich',
  skipped: 'übersprungen (keine Bewertung)',
  unmatched: 'nicht zugeordnet',
};

function onPick(graderId: string, event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  emit('assign', graderId, value === '' ? null : Number(value));
}
</script>

<template>
  <table>
    <thead>
      <tr><th>Schüler/in</th><th>Grader</th><th>→ Moodle</th><th>Aktuell in Moodle</th><th>Notiz (Feedback)</th><th>Status</th></tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.graderStudent.id" :class="{ muted: row.status === 'skipped' || row.status === 'same' }">
        <td>{{ row.graderStudent.lastName }} {{ row.graderStudent.firstName }}</td>
        <td>{{ row.sourceText }}</td>
        <td>{{ row.targetLabel ?? '' }}</td>
        <td>{{ row.currentLabel ?? '–' }}</td>
        <td>{{ row.note ?? '' }}</td>
        <td>
          <span :class="{ error: row.status === 'unmatched' }">{{ STATUS_TEXT[row.status] }}</span>
          <label v-if="row.needsConfirmation">
            <input type="checkbox" :checked="confirmed.has(row.graderStudent.id)" @change="emit('confirm', row.graderStudent.id, ($event.target as HTMLInputElement).checked)" />
            {{ zeroHint }}
          </label>
          <select
            v-if="row.status === 'unmatched'"
            :value="''"
            :aria-label="`Moodle-Nutzer für ${row.graderStudent.lastName} ${row.graderStudent.firstName}`"
            @change="onPick(row.graderStudent.id, $event)"
          >
            <option value="">Moodle-Nutzer wählen …</option>
            <option v-for="m in unused" :key="m.id" :value="m.id">{{ m.lastName }} {{ m.firstName }}</option>
          </select>
        </td>
      </tr>
    </tbody>
  </table>
</template>
