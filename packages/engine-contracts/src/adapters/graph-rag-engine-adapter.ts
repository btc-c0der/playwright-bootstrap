import { analyzeImpact, diagnoseRootCause } from "@qaf/graph-rag";
import type { AnalyzeImpactResult, GraphStore, LocalIncidentStore, RootCauseAnalysis } from "@qaf/graph-rag";
import type { EmbeddingProvider } from "@qaf/rag-core";
import type { GraphRagEngine, ImpactAnalysisRequest, RootCauseRequest } from "../graph-rag-engine.js";
import type { EngineContext } from "../types.js";

export interface GraphRagEngineOptions {
  store: GraphStore;
  incidentStore: LocalIncidentStore;
  embeddingProvider: EmbeddingProvider;
  /** Blast-radius hop count used when a request doesn't override it. */
  defaultMaxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 3;

/** `GraphRagEngine` implemented directly against `@qaf/graph-rag` — no new logic here, just the seam. */
export class GraphRagEngineAdapter implements GraphRagEngine {
  constructor(private readonly options: GraphRagEngineOptions) {}

  async analyzeImpact(request: ImpactAnalysisRequest, _context: EngineContext): Promise<AnalyzeImpactResult> {
    return analyzeImpact(this.options.store, request.changedRefs, {
      maxDepth: request.maxDepth ?? this.options.defaultMaxDepth ?? DEFAULT_MAX_DEPTH,
    });
  }

  async diagnoseRootCause(request: RootCauseRequest, _context: EngineContext): Promise<RootCauseAnalysis> {
    return diagnoseRootCause(
      {
        failingNodeId: request.failingNodeId,
        stackTrace: request.stackTrace,
        timestamp: request.timestamp,
        serviceLogs: request.serviceLogs,
      },
      {
        store: this.options.store,
        incidentStore: this.options.incidentStore,
        embeddingProvider: this.options.embeddingProvider,
      },
    );
  }
}
