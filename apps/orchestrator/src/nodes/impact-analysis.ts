import type { QAOrchestratorEngines } from "../engines.js";
import type { QAWorkflowStateType } from "../state.js";
import { recordStage } from "./record-stage.js";

/** Stage 1: Impact Analysis — `GraphRagEngine.analyzeImpact` over the CI payload's changed refs. */
export function impactAnalysisNode(engines: QAOrchestratorEngines) {
  return async (state: QAWorkflowStateType): Promise<Partial<QAWorkflowStateType>> => {
    return recordStage(engines, state.runId, "impact-analysis", async () => {
      const impact = await engines.graphRag.analyzeImpact(
        { changedRefs: state.payload.changedRefs },
        { runId: state.runId, startedAt: new Date().toISOString() },
      );
      return { impact };
    });
  };
}
