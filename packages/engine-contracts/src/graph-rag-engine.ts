import type { AnalyzeImpactResult, RootCauseAnalysis } from "@qaf/graph-rag";
import type { EngineContext } from "./types.js";

export interface ImpactAnalysisRequest {
  /** PR-changed endpoint/service refs or file paths — see `@qaf/graph-rag`'s `pr-diff.ts`. */
  changedRefs: string[];
  /** Blast-radius hop count. Omit to use the engine's configured default. */
  maxDepth?: number;
}

export interface RootCauseRequest {
  /** The node the failure surfaced on. */
  failingNodeId: string;
  stackTrace: string;
  timestamp: string;
  /** Recent log/error text per candidate node, if the caller has it — improves ranking but isn't required. */
  serviceLogs?: Record<string, string>;
}

/**
 * Engine 3 — GraphRAG Impact & Root Cause Engine: upstream/downstream system
 * topology graph traversal (`@qaf/graph-rag`) for PR-impact test selection
 * and embedding-assisted cascading-failure root-cause diagnosis.
 */
export interface GraphRagEngine {
  analyzeImpact(request: ImpactAnalysisRequest, context: EngineContext): Promise<AnalyzeImpactResult>;
  diagnoseRootCause(request: RootCauseRequest, context: EngineContext): Promise<RootCauseAnalysis>;
}
