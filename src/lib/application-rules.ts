import type { JobApplicationStatus } from "./types";

/** Maximum number of concurrent active applications per candidate. */
export const MAX_ACTIVE_APPLICATIONS = 3;

/**
 * Statuses that count toward the active-application limit.
 * A candidate cannot open a new application once this limit is reached.
 */
export const ACTIVE_APPLICATION_STATUSES: JobApplicationStatus[] = [
  "submitted",
  "tes_kepribadian",
  "screening",
  "verification",
  "document_submission",
  "interview",
  "offered",
];

/** Returns true if the given status counts as an active application. */
export function isApplicationActive(status: JobApplicationStatus): boolean {
  return ACTIVE_APPLICATION_STATUSES.includes(status);
}
