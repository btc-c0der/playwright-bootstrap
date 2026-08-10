import { createIsolationContext, generateSyntheticPayload } from "@qaf/synth-data";
import type {
  ConstraintVectorStore,
  EntitySchema,
  GenerationResult,
  LLMProvider,
  SeedTarget,
  SeededRecord,
  SeedTeardownFailure,
} from "@qaf/synth-data";
import type { EmbeddingProvider } from "@qaf/rag-core";
import type { GenerateDataRequest, SyntheticDataEngine } from "../synthetic-data-engine.js";
import type { EngineContext } from "../types.js";

export interface SynthDataEngineOptions {
  entitySchemas: EntitySchema[];
  llmProvider: LLMProvider;
  embeddingProvider: EmbeddingProvider;
  constraintStore: ConstraintVectorStore;
  /** Omit to run generation-only (no `seed()`/live `teardown()`). */
  seedTarget?: SeedTarget;
  maxRetries?: number;
  topK?: number;
}

/** `SyntheticDataEngine` implemented directly against `@qaf/synth-data` — no new logic here, just the seam. */
export class SynthDataEngineAdapter implements SyntheticDataEngine {
  constructor(private readonly options: SynthDataEngineOptions) {}

  async generate(request: GenerateDataRequest, _context: EngineContext): Promise<GenerationResult> {
    const isolation = createIsolationContext({ workerId: request.workerId, runId: request.runId });
    return generateSyntheticPayload({
      request: request.request,
      primaryEntity: request.primaryEntity,
      entitySchemas: this.options.entitySchemas,
      llmProvider: this.options.llmProvider,
      embeddingProvider: this.options.embeddingProvider,
      constraintStore: this.options.constraintStore,
      isolationKey: isolation.isolationKey,
      maxRetries: request.maxRetries ?? this.options.maxRetries,
      topK: this.options.topK,
    });
  }

  async seed(result: GenerationResult, _context: EngineContext): Promise<SeededRecord[]> {
    if (!this.options.seedTarget) {
      throw new Error(
        "No SeedTarget configured — this engine was built generation-only (see docs/synthetic-data-engine.md).",
      );
    }
    return this.options.seedTarget.seed(result, this.options.entitySchemas);
  }

  async teardown(isolationKey: string, _context: EngineContext): Promise<SeedTeardownFailure[]> {
    if (!this.options.seedTarget) return [];
    return this.options.seedTarget.teardown(isolationKey);
  }
}
