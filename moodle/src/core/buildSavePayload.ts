import type { ParamValue } from './moodleClient';
import type { SendRow } from './buildDiff';

/** The note as feedback comment HTML: escaped, line breaks as `<br>`. */
export function escapeNote(note: string): string {
  return note
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\r\n|\r|\n/g, '<br>');
}

/**
 * `mod_assign_save_grades` params. `plugindata` is only present for students with a note, so an existing
 * Moodle comment stays untouched otherwise.
 */
export function buildSavePayload(assignmentId: number, rows: readonly SendRow[]): { [key: string]: ParamValue } {
  return {
    assignmentid: assignmentId,
    applytoall: 0,
    grades: rows.map((row) => ({
      userid: row.moodleUserId,
      grade: row.targetValue,
      attemptnumber: -1,
      addattempt: 0,
      workflowstate: '',
      ...(row.note === null ? {} : { plugindata: { assignfeedbackcomments_editor: { text: escapeNote(row.note), format: 1 } } }),
    })),
  };
}
