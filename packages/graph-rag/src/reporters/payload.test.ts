import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCiPayload } from "./payload.js";
import type { AnalyzeImpactResult } from "../impact/select-tests.js";
import type { RootCauseAnalysis } from "../root-cause/diagnose.js";

function impact(overrides: Partial<AnalyzeImpactResult> = {}): AnalyzeImpactResult {
  return {
    seeds: ["service:a"],
    impact: { seeds: ["service:a"], impacted: [] },
    selectedTests: ["test:a-suite"],
    impactRadiusScore: 0.25,
    unresolvedRefs: [],
    ...overrides,
  };
}

test("root_cause_analysis is null when no diagnosis was run", () => {
  const payload = buildCiPayload(impact());
  assert.deepEqual(payload, {
    selected_tests: ["test:a-suite"],
    impact_radius_score: 0.25,
    root_cause_analysis: null,
  });
});

test("root_cause_analysis carries the diagnosis's fields exactly, dropping internal evidence detail", () => {
  const rootCause: RootCauseAnalysis = {
    origin_node: "service:c",
    root_cause_node: "service:a",
    confidence: 87,
    recommended_action: "check the contract",
    evidence: [{ nodeId: "service:a", similarity: 0.9 }],
  };
  const payload = buildCiPayload(impact(), rootCause);
  assert.deepEqual(payload.root_cause_analysis, {
    origin_node: "service:c",
    root_cause_node: "service:a",
    confidence: 87,
    recommended_action: "check the contract",
  });
});
