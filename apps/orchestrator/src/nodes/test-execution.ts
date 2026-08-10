import type { QAOrchestratorEngines } from "../engines.js";
import type { QAWorkflowStateType, TestExecutionResult } from "../state.js";
import { recordStage } from "./record-stage.js";

export interface TestRunRequest {
  testId: string;
  project: string;
  isolationKey?: string;
}

/**
 * The seam between Stage 3 and whatever actually drives a browser — this
 * orchestrator has no Playwright dependency of its own (it's a Node service,
 * not a test runner). `@qaf/gateway-api` wires a real `TestRunner` that
 * shells out to `npx playwright test` (or dispatches to a worker pool) and
 * parses the result into this shape.
 */
export interface TestRunner {
  run(request: TestRunRequest): Promise<TestExecutionResult>;
}

/**
 * Default `TestRunner` — reproduces whatever failure the CI payload
 * originally reported, framed as a locator-shaped failure, so a run with no
 * real `TestRunner` configured still exercises the `healing` branch (see
 * `apps/gateway-api/scripts/demo-e2e-flow.ts`). Never use this outside a
 * demo/test — it never actually re-executes anything.
 */
export class StubTestRunner implements TestRunner {
  async run(request: TestRunRequest): Promise<TestExecutionResult> {
    return {
      testId: request.testId,
      passed: false,
      durationMs: 1_200,
      failureReason: "Element not found — locator drift suspected (StubTestRunner, no live browser attached).",
      brokenLocator: {
        descriptor: { testId: "submit-button", fallbackLabel: "Submit button" },
        domSnapshot: '<button data-testid="submit-button-v2">Submit</button>',
        screenshot: Buffer.alloc(0),
        candidates: [],
      },
    };
  }
}

/** Stage 3: Test Execution — runs (or, by default, simulates) the affected test against the freshly generated data. */
export function testExecutionNode(engines: QAOrchestratorEngines, runner: TestRunner) {
  return async (state: QAWorkflowStateType): Promise<Partial<QAWorkflowStateType>> => {
    return recordStage(engines, state.runId, "test-execution", async () => {
      const execution = await runner.run({
        testId: state.payload.failure.testId,
        project: state.payload.failure.project,
        isolationKey: state.generatedData?.isolation_key,
      });
      return { execution };
    });
  };
}
