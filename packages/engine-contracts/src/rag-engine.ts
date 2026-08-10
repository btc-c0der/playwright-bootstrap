import type { ClusterResult, CoverageResult, FailureRecord } from "@qaf/rag-core";
import type { EngineContext } from "./types.js";

/**
 * Engine 1 — RAG Engine: spec-to-test coverage mapping and CI failure/log
 * triage via semantic search. Backed by `@qaf/rag-core`'s
 * `computeSpecToTestMapping`/`clusterFailure` — see `adapters/rag-core-engine.ts`
 * for the concrete wiring.
 */
export interface RAGEngine {
  /** Which indexed specs (internal docs/Jira/Confluence/Zephyr) are covered, partially covered, or gaps against the indexed test suite — also flags orphan tests that matched nothing. */
  mapSpecsToTests(context: EngineContext): Promise<CoverageResult>;
  /** Symbolizes + embeds one CI failure and matches it against prior occurrences, returning the cluster it belongs to (new or recurring) — the orchestrator's root-cause step starts from this instead of a cold search. */
  triageFailureLog(failure: FailureRecord, context: EngineContext): Promise<ClusterResult>;
}
