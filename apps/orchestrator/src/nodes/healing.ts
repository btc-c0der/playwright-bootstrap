import type { QAOrchestratorEngines } from "../engines.js";
import type { QAWorkflowStateType } from "../state.js";
import { recordStage } from "./record-stage.js";

/**
 * Stage 4: Healing — only reachable when `testExecutionNode` reports a
 * failure with a `brokenLocator` (see `graph.ts`'s conditional edge out of
 * `testExecution`). Proposes a repair via both `@qaf/core` strategies and,
 * if either fired, opens the auto-PR.
 */
export function healingNode(engines: QAOrchestratorEngines) {
  return async (state: QAWorkflowStateType): Promise<Partial<QAWorkflowStateType>> => {
    const broken = state.execution?.brokenLocator;
    if (!broken) return { repairProposals: [] };

    return recordStage(engines, state.runId, "healing", async () => {
      const context = { runId: state.runId, startedAt: new Date().toISOString() };
      const proposal = await engines.selfHealing.proposeRepair(
        { ...broken, file: state.payload.failure.file, testTitle: state.payload.failure.testId },
        context,
      );
      const autoPr = await engines.selfHealing.openAutoPr([proposal], context);
      return { repairProposals: [proposal], autoPr };
    });
  };
}
