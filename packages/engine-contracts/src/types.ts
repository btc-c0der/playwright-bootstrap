/**
 * The seam `@qaf/orchestrator` (Layer 2) is allowed to depend on for every
 * one of the four pillars. Each pillar's own package
 * (`@qaf/rag-core`/`@qaf/graph-rag`/`@qaf/synth-data`/`@qaf/core`) keeps its
 * richer, engine-specific types — these interfaces exist only so Layer 2
 * doesn't change shape when a pillar's internals do, and so every pillar is
 * substitutable in orchestrator tests without a real vector/graph/LLM
 * backend behind it.
 */
export interface EngineContext {
  /** Correlates every engine call for one orchestrator run — see `@qaf/storage-core`'s `ExecutionStore`. */
  runId: string;
  /** ISO 8601 — when the orchestrator run that's calling this engine started. */
  startedAt: string;
}
