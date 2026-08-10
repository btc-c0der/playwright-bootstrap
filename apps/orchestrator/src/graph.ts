import { END, START, StateGraph } from "@langchain/langgraph";
import type { QAOrchestratorEngines } from "./engines.js";
import { dataGenerationNode } from "./nodes/data-generation.js";
import { healingNode } from "./nodes/healing.js";
import { impactAnalysisNode } from "./nodes/impact-analysis.js";
import { rootCauseAnalysisNode } from "./nodes/root-cause-analysis.js";
import { StubTestRunner, testExecutionNode } from "./nodes/test-execution.js";
import type { TestRunner } from "./nodes/test-execution.js";
import { QAWorkflowState } from "./state.js";

/**
 * The graph itself — Layer 2's dynamic routing requirement: every run walks
 * Impact Analysis -> Data Generation -> Test Execution, then the edge out of
 * `testExecution` branches on the result instead of always continuing
 * linearly. A passing run ends there (nothing broke, nothing to heal or
 * diagnose); a failing run continues into Healing, then Root Cause
 * Analysis. `healingNode` itself further no-ops if the failure isn't
 * locator-shaped, so "healing ran but proposed nothing" and "healing was
 * skipped" are both normal, distinguishable outcomes in `ExecutionStore`.
 */
export function buildQaWorkflowGraph(engines: QAOrchestratorEngines, testRunner: TestRunner = new StubTestRunner()) {
  const graph = new StateGraph(QAWorkflowState)
    .addNode("impactAnalysis", impactAnalysisNode(engines))
    .addNode("dataGeneration", dataGenerationNode(engines))
    .addNode("testExecution", testExecutionNode(engines, testRunner))
    .addNode("healing", healingNode(engines))
    .addNode("rootCauseAnalysis", rootCauseAnalysisNode(engines))
    .addEdge(START, "impactAnalysis")
    .addEdge("impactAnalysis", "dataGeneration")
    .addEdge("dataGeneration", "testExecution")
    .addConditionalEdges("testExecution", (state) => (state.execution?.passed ? "passed" : "failed"), {
      passed: END,
      failed: "healing",
    })
    .addEdge("healing", "rootCauseAnalysis")
    .addEdge("rootCauseAnalysis", END);

  return graph.compile();
}
