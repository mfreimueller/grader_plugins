import type { DateRange } from './range';
import { fetchAllRepoTotals, type GithubClient } from './github';
import { lookupRepos } from './classroomRemote';
import {
  gradeClassroom,
  reposToLookUp,
  reposToRead,
  type ClassroomGradingInput,
  type ClassroomGradingResult,
} from './classroomGrading';

export type CheckInput = Omit<ClassroomGradingInput, 'presence' | 'outcomes'>;

/**
 * Reads what grading one assignment needs: which of the students' repositories exist (exact names), then the
 * commit totals of those with content within `range`. `range.to` is the deadline, so later commits never count.
 */
export async function checkAssignment(
  client: GithubClient,
  owner: string,
  input: CheckInput,
  range: DateRange,
  onProgress?: (message: string) => void,
): Promise<ClassroomGradingResult> {
  onProgress?.('Suche Repositories …');
  const presence = await lookupRepos(client, owner, reposToLookUp(input));
  const toRead = reposToRead({ ...input, presence });
  const outcomes = await fetchAllRepoTotals(client, owner, toRead, range.from, range.to, {
    onProgress: (done, total) => onProgress?.(`Lese Commits … ${done} von ${total}`),
  });
  return gradeClassroom({ ...input, presence, outcomes });
}
