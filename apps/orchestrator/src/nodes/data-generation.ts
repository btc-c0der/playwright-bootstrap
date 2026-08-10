import type { QAOrchestratorEngines } from "../engines.js";
import type { QAWorkflowStateType } from "../state.js";
import { recordStage } from "./record-stage.js";

/** Stage 2: Data Generation — `SyntheticDataEngine.generate` scoped to the failing test's entity, isolated per run. */
export function dataGenerationNode(engines: QAOrchestratorEngines) {
  return async (state: QAWorkflowStateType): Promise<Partial<QAWorkflowStateType>> => {
    return recordStage(engines, state.runId, "data-generation", async () => {
      const generatedData = await engines.syntheticData.generate(
        {
          request: `Fresh isolated data to reproduce and re-run "${state.payload.failure.testId}"`,
          primaryEntity: state.payload.failure.project,
          workerId: state.runId,
          runId: state.runId,
        },
        { runId: state.runId, startedAt: new Date().toISOString() },
      );
      return { generatedData };
    });
  };
}
