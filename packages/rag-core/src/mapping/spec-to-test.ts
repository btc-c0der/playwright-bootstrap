import type { ScoredRecord, VectorNamespace, VectorStore } from "../vector-store/types.js";
import type { CoverageMapping, CoverageResult, CoverageStatus, OrphanTest } from "./types.js";

export interface SpecToTestMappingOptions {
  vectorStore: VectorStore;
  /** Which namespaces count as "specs" to map against tests. */
  specNamespaces?: VectorNamespace[];
  topK?: number;
  /**
   * Retrieval floor — matches below this cosine score aren't considered a
   * match at all. Jira/Confluence phrasing diverges from Playwright test
   * titles more than test-to-test phrasing does, so this is deliberately
   * lower than a typical dedup threshold — tune per corpus (see
   * docs/rag-coverage-plan.md's Risks: threshold tuning needs a labeled set).
   */
  minScore?: number;
  /** Score at/above which the best match qualifies a spec as "covered" rather than merely "partial". */
  coveredScore?: number;
}

const DEFAULT_SPEC_NAMESPACES: VectorNamespace[] = ["spec", "jira", "confluence", "zephyr"];
const DEFAULT_TOP_K = 5;
const DEFAULT_MIN_SCORE = 0.6;
const DEFAULT_COVERED_SCORE = 0.8;

/**
 * For every indexed "spec" (internal doc, Jira issue, Confluence page,
 * Zephyr test case), finds the nearest indexed tests and classifies coverage.
 * Also flags tests that matched no spec above `minScore` anywhere as orphans —
 * a governance signal, not an automatic deletion trigger (see plan's Risks:
 * semantic similarity is advisory, human-reviewed output).
 */
export async function computeSpecToTestMapping(
  options: SpecToTestMappingOptions,
): Promise<CoverageResult> {
  const specNamespaces = options.specNamespaces ?? DEFAULT_SPEC_NAMESPACES;
  const topK = options.topK ?? DEFAULT_TOP_K;
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const coveredScore = options.coveredScore ?? DEFAULT_COVERED_SCORE;

  const specLists = await Promise.all(specNamespaces.map((ns) => options.vectorStore.all(ns)));
  const specs = specLists.flat();
  const tests = await options.vectorStore.all("test");

  const matchedTestIds = new Set<string>();
  const mappings: CoverageMapping[] = [];

  for (const spec of specs) {
    const results = await options.vectorStore.query(spec.vector, {
      namespace: "test",
      topK,
      minScore,
    });
    for (const result of results) matchedTestIds.add(result.id);
    mappings.push({
      specId: spec.id,
      specTitle: titleOf(spec.metadata, spec.id),
      specNamespace: spec.namespace,
      matchedTests: results.map((r) => ({ testId: r.id, score: r.score })),
      status: classify(results, coveredScore),
    });
  }

  const orphans: OrphanTest[] = tests
    .filter((t) => !matchedTestIds.has(t.id))
    .map((t) => ({ testId: t.id, testTitle: titleOf(t.metadata, t.id) }));

  return { mappings, orphans };
}

function classify(results: ScoredRecord[], coveredScore: number): CoverageStatus {
  const best = results[0]?.score;
  if (best === undefined) return "gap";
  return best >= coveredScore ? "covered" : "partial";
}

function titleOf(metadata: Record<string, unknown>, fallback: string): string {
  return typeof metadata.title === "string" ? metadata.title : fallback;
}
