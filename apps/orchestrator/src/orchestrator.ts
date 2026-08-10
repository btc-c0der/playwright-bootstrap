import type { CiFailurePayload } from "@qaf/engine-contracts";
import type { QAOrchestratorEngines } from "./engines.js";
import { buildQaWorkflowGraph } from "./graph.js";
import type { TestRunner } from "./nodes/test-execution.js";
import type { QAWorkflowStateType } from "./state.js";

/**
 * Layer 2's `QAAgentOrchestrator` — the LangGraph.js StateGraph that routes
 * one CI/CD test-failure payload across the four Layer 3 pillars. This is
 * the one class `@qaf/gateway-api` (Layer 1) constructs; everything it needs
 * — which engines, which test runner — is injected, so this class never
 * picks a vector/graph/LLM backend or a way to run Playwright itself.
 */
export class QAAgentOrchestrator {
  private readonly graph: ReturnType<typeof buildQaWorkflowGraph>;

  constructor(engines: QAOrchestratorEngines, testRunner?: TestRunner) {
    this.graph = buildQaWorkflowGraph(engines, testRunner);
  }

  async run(payload: CiFailurePayload): Promise<QAWorkflowStateType> {
    return this.graph.invoke({ payload, runId: payload.runId });
  }
}
