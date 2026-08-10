import { randomUUID } from "node:crypto";
import type { QAOrchestratorEngines } from "../engines.js";

/**
 * Wraps one orchestrator stage's work with `ExecutionStore` bookkeeping
 * (silently skipped if no store is configured) — every node in `nodes/`
 * uses this so "started"/"succeeded"/"failed" records are consistent
 * without each node re-deriving the pattern. Re-throws whatever `work()`
 * throws after recording the failure, so a stage's own error still
 * propagates to LangGraph's run.
 */
export async function recordStage<T extends Record<string, unknown>>(
  engines: QAOrchestratorEngines,
  runId: string,
  stage: string,
  work: () => Promise<T>,
): Promise<T> {
  const id = randomUUID();
  const startedAt = new Date().toISOString();
  await engines.executionStore?.append({ id, runId, stage, status: "started", startedAt });

  try {
    const result = await work();
    await engines.executionStore?.append({
      id,
      runId,
      stage,
      status: "succeeded",
      startedAt,
      finishedAt: new Date().toISOString(),
      detail: result,
    });
    return result;
  } catch (error) {
    await engines.executionStore?.append({
      id,
      runId,
      stage,
      status: "failed",
      startedAt,
      finishedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
