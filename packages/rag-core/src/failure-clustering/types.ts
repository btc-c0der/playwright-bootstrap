/** One CI test-failure occurrence, captured by a Playwright reporter (mirrors HistoryReporter's shape). */
export interface FailureRecord {
  /** Unique per occurrence — e.g. `${testId}@${commitSha}@${timestamp}`. */
  id: string;
  testId: string;
  file: string;
  project: string;
  errorMessage: string;
  stackTrace: string;
  logExcerpt?: string;
  commitSha?: string;
  timestamp: string;
}

/**
 * Aggregated view over all occurrences sharing a `clusterId` — what
 * `reporters/root-cause-report.ts` and the `audit` skill's "recurring
 * root-cause clusters" section render from.
 */
export interface ClusterSummary {
  clusterId: string;
  occurrenceCount: number;
  distinctTestIds: string[];
  /** Set once a human labels the cluster after triage — absent for a freshly-formed cluster. */
  rootCauseLabel?: string;
  linkedIssue?: string;
  lastSeen: string;
}
