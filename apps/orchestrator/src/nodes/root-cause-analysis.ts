import type { QAOrchestratorEngines } from "../engines.js";
import type { QAWorkflowStateType } from "../state.js";
import { recordStage } from "./record-stage.js";

/** Stage 5: Root Cause Analysis — `GraphRagEngine.diagnoseRootCause`, only reached on the `testExecution` failure branch (see `graph.ts`). */
export function rootCauseAnalysisNode(engines: QAOrchestratorEngines) {
  return async (state: QAWorkflowStateType): Promise<Partial<QAWorkflowStateType>> => {
    return recordStage(engines, state.runId, "root-cause-analysis", async () => {
      const rootCause = await engines.graphRag.diagnoseRootCause(
        {
          failingNodeId: state.payload.failure.failingNodeId,
          stackTrace: state.payload.failure.stackTrace,
          timestamp: state.payload.failure.timestamp,
        },
        { runId: state.runId, startedAt: new Date().toISOString() },
      );
      return { rootCause };
    });
  };
}
