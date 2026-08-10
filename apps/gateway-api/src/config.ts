import { NoopAiRepairProvider, NoopVectorHealingProvider } from "@qaf/core";
import {
  CoreSelfHealingEngine,
  GatewayAiRepairProvider,
  GatewayEmbeddingProvider,
  GatewayLLMProvider,
  GraphRagEngineAdapter,
  NoopGitAutoPrProvider,
  RagCoreEngine,
  SynthDataEngineAdapter,
} from "@qaf/engine-contracts";
import { LocalGraphStore, LocalIncidentStore } from "@qaf/graph-rag";
import type { EmbeddingGateway, LLMGateway } from "@qaf/llm-gateway";
import type { QAOrchestratorEngines } from "@qaf/orchestrator";
import { LocalJsonlVectorStore, NoopEmbeddingProvider } from "@qaf/rag-core";
import { LocalJsonlExecutionStore } from "@qaf/storage-core";
import type { EntitySchema } from "@qaf/synth-data";
import { LocalConstraintStore, NoopLLMProvider } from "@qaf/synth-data";

/**
 * Zero-config default engine wiring — every backend is the local/no-op
 * default each pillar package ships, same "works with nothing configured"
 * posture as running this monorepo's own test suite (`bin/rest-server.ts`
 * and `bin/mcp-server.ts` both start from this). Swap any of these for a
 * production backend — `@qaf/storage-core`'s `QdrantVectorStore`/
 * `PgVectorStore`/`Neo4jCompatibleGraphStore`/`PostgresExecutionStore`,
 * `@qaf/llm-gateway`'s real `LLMGatewayProvider`s — by constructing your own
 * `QAOrchestratorEngines` instead of calling this function. See
 * docs/gateway-api.md.
 */
export function buildDefaultEngines(): QAOrchestratorEngines {
  const embeddingProvider = new NoopEmbeddingProvider();
  const vectorStore = new LocalJsonlVectorStore();
  const graphStore = new LocalGraphStore();
  const incidentStore = new LocalIncidentStore();

  return {
    rag: new RagCoreEngine({ vectorStore, embeddingProvider }),
    graphRag: new GraphRagEngineAdapter({ store: graphStore, incidentStore, embeddingProvider }),
    syntheticData: new SynthDataEngineAdapter({
      entitySchemas: [],
      llmProvider: new NoopLLMProvider(),
      embeddingProvider,
      constraintStore: new LocalConstraintStore(),
    }),
    selfHealing: new CoreSelfHealingEngine({
      aiRepairProvider: new NoopAiRepairProvider(),
      vectorHealingProvider: new NoopVectorHealingProvider(),
      gitAutoPrProvider: new NoopGitAutoPrProvider(),
    }),
    executionStore: new LocalJsonlExecutionStore(),
  };
}

export interface GatewayEngineOptions {
  /** A `GatewayClient` from `@qaf/llm-gateway`'s `createGatewayClient()` — the one place PII redaction + token audit are configured. */
  gateway: { llm: LLMGateway; embeddings: EmbeddingGateway };
  /** `"<prefix>:<model-name>"`, registered with an `EmbeddingGatewayProvider` on `gateway.embeddings`. */
  embeddingModel: string;
  embeddingDimensions: number;
  /** `"<prefix>:<model-name>"`, registered with an `LLMGatewayProvider` on `gateway.llm`. */
  llmModel: string;
  /** Defaults to `llmModel` — override if your text model isn't vision-capable (the self-healing engine's `AiRepairProvider` attaches a screenshot). */
  visionModel?: string;
  entitySchemas?: EntitySchema[];
  requestedBy?: string;
  runId?: string;
}

/**
 * The production counterpart to `buildDefaultEngines()`: every pillar that
 * needs an LLM or an embedding model gets one implemented over the *same*
 * `gateway`, instead of each pillar holding its own unaudited provider —
 * `GatewayEmbeddingProvider`/`GatewayLLMProvider`/`GatewayAiRepairProvider`
 * (all from `@qaf/engine-contracts`) are the bridges that make this
 * possible. The result: one `TokenUsageSink` ends up recording every
 * pillar's LLM *and* embedding spend, and one `PiiRedactionMiddleware`
 * covers every payload any pillar sends out, because there's exactly one
 * gateway underneath all of them. `selfHealing.vectorHealingProvider` and
 * `gitAutoPrProvider` aren't LLM calls, so they're unaffected — still local/
 * no-op unless you override them yourself.
 */
export function buildEnginesWithGateway(options: GatewayEngineOptions): QAOrchestratorEngines {
  const embeddingProvider = new GatewayEmbeddingProvider({
    gateway: options.gateway.embeddings,
    model: options.embeddingModel,
    dimensions: options.embeddingDimensions,
    requestedBy: options.requestedBy,
    runId: options.runId,
  });
  const vectorStore = new LocalJsonlVectorStore();
  const graphStore = new LocalGraphStore();
  const incidentStore = new LocalIncidentStore();

  return {
    rag: new RagCoreEngine({ vectorStore, embeddingProvider }),
    graphRag: new GraphRagEngineAdapter({ store: graphStore, incidentStore, embeddingProvider }),
    syntheticData: new SynthDataEngineAdapter({
      entitySchemas: options.entitySchemas ?? [],
      llmProvider: new GatewayLLMProvider({
        gateway: options.gateway.llm,
        model: options.llmModel,
        requestedBy: options.requestedBy,
        runId: options.runId,
      }),
      embeddingProvider,
      constraintStore: new LocalConstraintStore(),
    }),
    selfHealing: new CoreSelfHealingEngine({
      aiRepairProvider: new GatewayAiRepairProvider({
        gateway: options.gateway.llm,
        model: options.visionModel ?? options.llmModel,
        requestedBy: options.requestedBy,
        runId: options.runId,
      }),
      vectorHealingProvider: new NoopVectorHealingProvider(),
      gitAutoPrProvider: new NoopGitAutoPrProvider(),
    }),
    executionStore: new LocalJsonlExecutionStore(),
  };
}
