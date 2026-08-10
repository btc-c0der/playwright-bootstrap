import { createHash } from "node:crypto";
import type { EmbeddingProvider } from "../embedding/types.js";
import type { VectorRecord, VectorStore } from "../vector-store/types.js";
import { symbolizeFailure } from "./symbolize.js";
import type { ClusterSummary, FailureRecord } from "./types.js";

export interface ClusterOptions {
  vectorStore: VectorStore;
  embeddingProvider: EmbeddingProvider;
  /**
   * Similarity floor to consider two failures the same root cause. Stricter
   * than spec-to-test's default — a false-positive "seen before" link
   * misdirects triage, so this errs toward precision over recall.
   */
  minScore?: number;
  topK?: number;
}

export interface ClusterResult {
  clusterId: string;
  isNewCluster: boolean;
  similarOccurrences: Array<{ id: string; score: number }>;
  linkedIssue?: string;
  rootCauseLabel?: string;
}

const DEFAULT_MIN_SCORE = 0.85;
const DEFAULT_TOP_K = 5;

/**
 * Symbolizes + embeds one new CI failure, matches it against the
 * `ci-failure` namespace's history, and records it under an existing
 * cluster (carrying forward any `linkedIssue`/`rootCauseLabel` a human
 * already attached) or as a new cluster's reference occurrence. Every call
 * both queries *and* upserts — each occurrence becomes part of the history
 * the next occurrence is matched against.
 */
export async function clusterFailure(
  record: FailureRecord,
  options: ClusterOptions,
): Promise<ClusterResult> {
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const topK = options.topK ?? DEFAULT_TOP_K;

  const signature = symbolizeFailure(record);
  const [vector] = await options.embeddingProvider.embed([signature]);
  if (!vector) {
    throw new Error(
      `EmbeddingProvider "${options.embeddingProvider.id}" returned no vector for a failure signature`,
    );
  }

  const matches = await options.vectorStore.query(vector, {
    namespace: "ci-failure",
    topK,
    minScore,
  });
  const bestMatch = matches[0];
  const clusterId = bestMatch
    ? (readString(bestMatch.metadata.clusterId) ?? bestMatch.id)
    : record.id;
  const linkedIssue = bestMatch ? readString(bestMatch.metadata.linkedIssue) : undefined;
  const rootCauseLabel = bestMatch ? readString(bestMatch.metadata.rootCauseLabel) : undefined;

  const vectorRecord: VectorRecord = {
    id: record.id,
    namespace: "ci-failure",
    vector,
    metadata: {
      clusterId,
      signature,
      testId: record.testId,
      file: record.file,
      project: record.project,
      commitSha: record.commitSha,
      linkedIssue,
      rootCauseLabel,
    },
    contentHash: hashText(signature),
    embeddingId: options.embeddingProvider.id,
    indexedAt: new Date().toISOString(),
  };
  await options.vectorStore.upsert([vectorRecord]);

  return {
    clusterId,
    isNewCluster: !bestMatch,
    similarOccurrences: matches.map((m) => ({ id: m.id, score: m.score })),
    linkedIssue,
    rootCauseLabel,
  };
}

/**
 * Aggregates every indexed `ci-failure` occurrence by `clusterId` — the
 * input `reporters/root-cause-report.ts` and the `audit` skill's "recurring
 * root-cause clusters" section render from. Clusters spanning multiple
 * *distinct* tests point at an infra-level cause rather than one test's own
 * flakiness (complementary to `analyzeFlakiness` in `@qaf/core`, which looks
 * per-test).
 */
export function summarizeClusters(records: VectorRecord[]): ClusterSummary[] {
  const byCluster = new Map<string, VectorRecord[]>();
  for (const record of records) {
    const clusterId = readString(record.metadata.clusterId) ?? record.id;
    const list = byCluster.get(clusterId) ?? [];
    list.push(record);
    byCluster.set(clusterId, list);
  }

  const summaries: ClusterSummary[] = [];
  for (const [clusterId, occurrences] of byCluster) {
    const distinctTestIds = [
      ...new Set(occurrences.map((o) => readString(o.metadata.testId)).filter(isDefined)),
    ];
    const lastSeen =
      occurrences
        .map((o) => o.indexedAt)
        .sort()
        .at(-1) ??
      occurrences[0]?.indexedAt ??
      "";
    const labeled = occurrences.find((o) => readString(o.metadata.rootCauseLabel));
    summaries.push({
      clusterId,
      occurrenceCount: occurrences.length,
      distinctTestIds,
      rootCauseLabel: labeled ? readString(labeled.metadata.rootCauseLabel) : undefined,
      linkedIssue: labeled ? readString(labeled.metadata.linkedIssue) : undefined,
      lastSeen,
    });
  }
  return summaries.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function hashText(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}
