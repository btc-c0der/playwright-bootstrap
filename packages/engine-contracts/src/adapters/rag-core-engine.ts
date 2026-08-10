import { clusterFailure, computeSpecToTestMapping } from "@qaf/rag-core";
import type {
  ClusterOptions,
  ClusterResult,
  CoverageResult,
  EmbeddingProvider,
  FailureRecord,
  SpecToTestMappingOptions,
  VectorStore,
} from "@qaf/rag-core";
import type { RAGEngine } from "../rag-engine.js";
import type { EngineContext } from "../types.js";

export interface RagCoreEngineOptions {
  vectorStore: VectorStore;
  embeddingProvider: EmbeddingProvider;
  mapping?: Omit<SpecToTestMappingOptions, "vectorStore">;
  clustering?: Omit<ClusterOptions, "vectorStore" | "embeddingProvider">;
}

/**
 * `RAGEngine` implemented directly against `@qaf/rag-core` — no new logic
 * here, just the seam. Swap `vectorStore`/`embeddingProvider` for a
 * production backend (see `@qaf/storage-core`) without the orchestrator
 * noticing.
 */
export class RagCoreEngine implements RAGEngine {
  constructor(private readonly options: RagCoreEngineOptions) {}

  async mapSpecsToTests(_context: EngineContext): Promise<CoverageResult> {
    return computeSpecToTestMapping({ vectorStore: this.options.vectorStore, ...this.options.mapping });
  }

  async triageFailureLog(failure: FailureRecord, _context: EngineContext): Promise<ClusterResult> {
    return clusterFailure(failure, {
      vectorStore: this.options.vectorStore,
      embeddingProvider: this.options.embeddingProvider,
      ...this.options.clustering,
    });
  }
}
