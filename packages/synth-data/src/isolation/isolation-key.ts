import { randomUUID } from "node:crypto";

export interface IsolationScope {
  /** Playwright `workerIndex`, a CI job id, or any other caller-supplied worker identifier — this package has no Playwright dependency of its own (see `@qaf/core`'s `buildWorkerNamespace` for the Playwright-fixture equivalent), so it's a plain string here. */
  workerId: string;
  /** CI run/shard id, if the caller has one — keeps two parallel pipeline runs from colliding even if `workerId` repeats (worker indices reset per shard, same rationale as `@qaf/core`'s `namespace.ts`). */
  runId?: string;
}

export interface IsolationContext {
  /** The `isolation_key` returned to callers — a real UUID (requirement 5), not a composite string, so it drops straight into a `uuid` column or an API response with no further formatting. */
  isolationKey: string;
  workerId: string;
  runId?: string;
  createdAt: string;
}

/**
 * One `IsolationContext` per generation request (or per test, if a caller
 * wants one bundle per test rather than per worker) — its `isolationKey` is
 * what `scopeUniqueValue` folds into generated unique fields, what
 * `seeding/teardown.ts` tags every inserted row with, and what a REST caller
 * gets back to correlate a bundle with later teardown. Ephemeral by design:
 * nothing here is persisted beyond what the caller chooses to track.
 */
export function createIsolationContext(scope: IsolationScope): IsolationContext {
  return {
    isolationKey: randomUUID(),
    workerId: scope.workerId,
    runId: scope.runId,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Folds an isolation key into a base value so generated unique fields (email,
 * username, external-reference id) can't collide across parallel workers —
 * same purpose as `@qaf/core`'s `buildTestNamespace`, generalized to work
 * outside a Playwright fixture. Uses the first 8 hex chars only (matching
 * `buildWorkerNamespace`'s own truncation) since the full 36-char UUID would
 * blow past realistic field length limits (e.g. a `VARCHAR(64)` email column).
 */
export function scopeUniqueValue(isolationKey: string, base: string): string {
  return `${base}.${isolationKey.slice(0, 8)}`;
}
