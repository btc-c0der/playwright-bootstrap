export type ExecutionStatus = "started" | "succeeded" | "failed";

export interface ExecutionRecord {
  id: string;
  runId: string;
  /** Which orchestrator stage produced this record, e.g. `"impact-analysis"`, `"data-generation"`, `"test-execution"`, `"healing"`, `"root-cause-analysis"` — left as `string` (not a union) so a new stage never requires a change here. */
  stage: string;
  status: ExecutionStatus;
  startedAt: string;
  finishedAt?: string;
  /** Arbitrary stage-specific payload — e.g. an `AnalyzeImpactResult` or `GenerationResult`. Kept loose because every stage's real shape lives in its own engine package, not here. */
  detail?: Record<string, unknown>;
  error?: string;
}

export interface ExecutionQueryOptions {
  runId?: string;
  stage?: string;
  status?: ExecutionStatus;
  limit?: number;
}

/**
 * Layer 4's relational/document store for execution history — every
 * orchestrator stage transition, across every run, so "what happened during
 * run X" is always reconstructable after the fact. Same pluggable, opt-in
 * posture as `VectorStore`/`GraphStore`: ships `LocalJsonlExecutionStore`
 * (dependency-free); `PostgresExecutionStore` is the production path.
 */
export interface ExecutionStore {
  /** Upsert by `id` — a stage's "started" record and its later "succeeded"/"failed" record share one id, so this is one row's lifecycle, not two. */
  append(record: ExecutionRecord): Promise<void>;
  query(options?: ExecutionQueryOptions): Promise<ExecutionRecord[]>;
}
