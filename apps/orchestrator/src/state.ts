import { Annotation } from "@langchain/langgraph";
import type { HealCandidate, LocatorDescriptor } from "@qaf/core";
import type { AutoPrResult, CiFailurePayload, RepairProposal } from "@qaf/engine-contracts";
import type { AnalyzeImpactResult, RootCauseAnalysis } from "@qaf/graph-rag";
import type { GenerationResult } from "@qaf/synth-data";

/** What `nodes/test-execution.ts`'s `TestRunner` reports back — a broken locator is only present when the failure looks locator-shaped, which is what routes the graph into `healing`. */
export interface TestExecutionResult {
  testId: string;
  passed: boolean;
  durationMs: number;
  failureReason?: string;
  brokenLocator?: {
    descriptor: LocatorDescriptor;
    domSnapshot: string;
    screenshot: Buffer;
    candidates: HealCandidate[];
  };
}

/**
 * The orchestrator's LangGraph state — every field a node either reads
 * (`payload`, `runId`) or fills in as the run progresses. Fields default to
 * `undefined`/`[]` and are simply overwritten by whichever node sets them
 * (no merge semantics needed: exactly one node owns each field, except
 * `repairProposals`, which concatenates in case a future graph revision
 * calls `healing` more than once per run).
 */
export const QAWorkflowState = Annotation.Root({
  payload: Annotation<CiFailurePayload>(),
  runId: Annotation<string>(),
  impact: Annotation<AnalyzeImpactResult | undefined>({ default: () => undefined, reducer: (_prev, next) => next }),
  generatedData: Annotation<GenerationResult | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  execution: Annotation<TestExecutionResult | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  repairProposals: Annotation<RepairProposal[]>({
    default: () => [],
    reducer: (prev, next) => prev.concat(next),
  }),
  autoPr: Annotation<AutoPrResult | undefined>({ default: () => undefined, reducer: (_prev, next) => next }),
  rootCause: Annotation<RootCauseAnalysis | undefined>({ default: () => undefined, reducer: (_prev, next) => next }),
});

export type QAWorkflowStateType = typeof QAWorkflowState.State;
