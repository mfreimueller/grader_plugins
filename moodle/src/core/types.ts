/** A student of the Grader course. */
export interface GraderStudent {
  id: string;
  firstName: string;
  lastName: string;
}

/** A student enrolled in the Moodle course. */
export interface MoodleStudent {
  id: number;
  firstName: string;
  lastName: string;
}

export interface MoodleCourse {
  id: number;
  fullName: string;
  shortName: string;
}

export interface SiteInfo {
  sitename: string;
  userId: number;
  fullName: string;
}

export interface MoodleAssignment {
  id: number;
  cmid: number;
  name: string;
  /** Below 0: scale id is `-grade`; above 0: maximum points; 0: not graded. */
  grade: number;
  markingWorkflow: boolean;
}

/** The grade of one user for one assignment, as the user grade report shows it. */
export interface GradeItem {
  userId: number;
  assignmentId: number;
  /** Null while the assignment is not graded for the user. */
  graderaw: number | null;
  /** Label as displayed; an ungraded item shows "-", so never decide on this text whether it is graded. */
  gradeformatted: string;
  grademin: number;
  grademax: number;
}

/** The part of a Grader assessment result the sync needs. */
export interface AssessmentResultInput {
  studentId: string;
  symbol: string | null;
  /** Points reached; null for symbol columns. */
  score: number | null;
  /** Grade 1..5 Grader computed from the points; null otherwise (or when Grader does not provide it). */
  grade: number | null;
  note: string | null;
}
