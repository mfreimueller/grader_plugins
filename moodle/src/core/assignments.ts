import type { AssessmentSpec } from './kinds';
import type { MoodleAssignment } from './types';

export interface AssignmentChoice {
  assignment: MoodleAssignment;
  selectable: boolean;
  /** Why the assignment cannot be used; null when it can. */
  reason: string | null;
}

const ok = (assignment: MoodleAssignment): AssignmentChoice => ({ assignment, selectable: true, reason: null });
const no = (assignment: MoodleAssignment, reason: string): AssignmentChoice => ({ assignment, selectable: false, reason });

/**
 * Which assignments fit the chosen Grader column. The item count of a scale is only known once the grade items
 * are loaded, so scale assignments are offered here and the final check follows in `decideKind`.
 *  - symbols: scale assignments;
 *  - points with a grade view: points assignments with equal maximum, and scales (as grades 1-5);
 *  - plain points: points assignments with equal maximum.
 */
export function classifyAssignments(assignments: readonly MoodleAssignment[], assessment: AssessmentSpec): AssignmentChoice[] {
  const symbols = assessment.gradingType === 'TERTIARY';
  const asGrade = assessment.displayAsGrade === true;
  return assignments.map((a) => {
    if (a.grade === 0) return no(a, 'Diese Aufgabe hat keine Bewertung');
    if (a.grade < 0) {
      return symbols || asGrade ? ok(a) : no(a, 'Skala – für Punkte wird eine Aufgabe mit Punkten benötigt');
    }
    if (symbols) return no(a, `Bewertung mit Punkten (max. ${a.grade}), keine Skala`);
    if (a.grade !== assessment.maxPoints) {
      return no(a, `Höchstpunkte stimmen nicht überein: Grader ${assessment.maxPoints}, Moodle ${a.grade}`);
    }
    return ok(a);
  });
}
