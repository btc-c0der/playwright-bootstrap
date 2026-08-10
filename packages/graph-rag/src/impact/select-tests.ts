import type { GraphStore } from "../graph/graph-store.js";
import { resolveChangedRefs } from "./pr-diff.js";
import { computeImpact, computeImpactRadiusScore } from "./traversal.js";
import type { ImpactResult } from "./traversal.js";

export interface AnalyzeImpactOptions {
  /** Cypher's `*1..N` — how many hops of blast radius to walk before stopping. Deeper systems need a larger N to avoid false negatives (a real dependent missed because it's N+1 hops away); shallower/well-isolated systems can use a smaller N to keep the selected test set tight. No universal default — pick per system, start conservative (larger N) and tighten once false-negative rate is known. */
  maxDepth: number;
}

export interface AnalyzeImpactResult {
  seeds: string[];
  impact: ImpactResult;
  /** Every `TestCase` id whose `:COVERS_TEST` edge reaches a seed or an impacted node — the "strictly necessary" regression subset from requirement #2. */
  selectedTests: string[];
  impactRadiusScore: number;
  /** Changed refs from the PR that resolved to nothing in the graph — the graph may be stale for these; don't read a small `selectedTests` as "safe" without checking this is empty. */
  unresolvedRefs: string[];
}

/**
 * The full PR-impact pipeline: resolve the PR's changed endpoints/services/
 * file paths into graph seeds, walk the blast radius, and collect the
 * regression test subset that actually covers something in that radius.
 * `changedRefs` accepts either kind requirement #2 describes — an explicit
 * node ref or a changed file path — see `pr-diff.ts`.
 */
export async function analyzeImpact(
  store: GraphStore,
  changedRefs: string[],
  options: AnalyzeImpactOptions,
): Promise<AnalyzeImpactResult> {
  const allNodes = await store.nodes();
  const { nodeIds: seeds, unresolved } = resolveChangedRefs(allNodes, changedRefs);

  const impact = await computeImpact(store, seeds, { maxDepth: options.maxDepth });
  const impactRadiusScore = computeImpactRadiusScore(impact, allNodes);

  const candidateNodeIds = [...seeds, ...impact.impacted.map((n) => n.nodeId)];
  const selectedTests = new Set<string>();
  for (const nodeId of candidateNodeIds) {
    const coveringTests = await store.neighbors(nodeId, { edgeTypes: ["COVERS_TEST"], direction: "in" });
    for (const edge of coveringTests) selectedTests.add(edge.from);
  }

  return {
    seeds,
    impact,
    selectedTests: [...selectedTests],
    impactRadiusScore,
    unresolvedRefs: unresolved,
  };
}
