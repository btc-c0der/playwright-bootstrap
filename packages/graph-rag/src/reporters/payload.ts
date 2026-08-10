import type { AnalyzeImpactResult } from "../impact/select-tests.js";
import type { RootCauseAnalysis } from "../root-cause/diagnose.js";

/**
 * Requirement #4's CI/CD export shape exactly: `selected_tests`,
 * `impact_radius_score`, `root_cause_analysis`. `root_cause_analysis` is
 * `null` for a pre-merge impact-analysis run (no failure has happened yet —
 * `qaf-graph-impact` produces this shape) and populated once a SIT failure
 * has actually been diagnosed (`qaf-graph-diagnose`, or a caller that runs
 * both in one CI step and merges them via `buildCiPayload`).
 */
export interface CiPayload {
  selected_tests: string[];
  impact_radius_score: number;
  root_cause_analysis: {
    origin_node: string;
    root_cause_node: string;
    confidence: number;
    recommended_action: string;
  } | null;
}

export function buildCiPayload(
  impact: AnalyzeImpactResult,
  rootCause?: RootCauseAnalysis,
): CiPayload {
  return {
    selected_tests: impact.selectedTests,
    impact_radius_score: impact.impactRadiusScore,
    root_cause_analysis: rootCause
      ? {
          origin_node: rootCause.origin_node,
          root_cause_node: rootCause.root_cause_node,
          confidence: rootCause.confidence,
          recommended_action: rootCause.recommended_action,
        }
      : null,
  };
}
