import type { GraphRagEngine, RAGEngine, SelfHealingEngine, SyntheticDataEngine } from "@qaf/engine-contracts";
import type { LLMGateway } from "@qaf/llm-gateway";
import type { ExecutionStore } from "@qaf/storage-core";

/**
 * Everything `QAAgentOrchestrator` depends on, injected — one bundle so
 * `buildQaWorkflowGraph`/every node function takes a single argument instead
 * of four. `@qaf/gateway-api` is what actually picks concrete
 * implementations (`RagCoreEngine`, `GraphRagEngineAdapter`, ...) and their
 * backends (local JSONL vs. Qdrant/Neo4j/Postgres); this orchestrator never
 * imports a concrete engine or storage class directly.
 */
export interface QAOrchestratorEngines {
  rag: RAGEngine;
  selfHealing: SelfHealingEngine;
  graphRag: GraphRagEngine;
  syntheticData: SyntheticDataEngine;
  /** Optional — engine adapters that need LLM access already hold their own `LLMProvider`/`AiRepairProvider`; this is for orchestrator-level calls (none yet), kept here so it's threaded through once if a future node needs it. */
  llmGateway?: LLMGateway;
  /** Omit to run without execution-history bookkeeping (every node's `recordStage` call becomes a no-op). */
  executionStore?: ExecutionStore;
}
