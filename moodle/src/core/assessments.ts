import type { PluginAssessment } from '../window';

/**
 * Shared columns (any category; single-student entries are left out) that can be transferred: symbol columns
 * with at least one symbol, point columns with a maximum and at least one score.
 */
export function pickCandidates(assessments: readonly PluginAssessment[]): PluginAssessment[] {
  return assessments.filter((a) => {
    if (a.isImpromptu) return false;
    if (a.gradingType === 'TERTIARY') return a.results.some((r) => r.symbol !== null);
    return a.gradingType === 'NUMERIC' && a.maxPoints !== null && a.maxPoints > 0 && a.results.some((r) => r.score !== null);
  });
}

function typeText(a: PluginAssessment): string {
  if (a.gradingType === 'TERTIARY') return 'Symbole';
  return a.displayAsGrade === true ? 'Noten' : `Punkte (${a.maxPoints})`;
}

/** `Übung 3 – 05.10. – Symbole`; the date is `YYYY-MM-DD` in Grader. */
export function assessmentLabel(a: PluginAssessment): string {
  const [, month, day] = a.date.split('-');
  return `${a.title} – ${day}.${month}. – ${typeText(a)}`;
}
