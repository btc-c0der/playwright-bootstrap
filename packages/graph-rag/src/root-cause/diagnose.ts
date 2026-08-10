import { cosineSimilarity } from "@qaf/rag-core";
import type { EmbeddingProvider } from "@qaf/rag-core";
import type { GraphStore } from "../graph/graph-store.js";
import type { LocalIncidentStore } from "./incident-store.js";
import { findUpstreamCandidates } from "./upstream.js";
import type { UpstreamCandidate } from "./upstream.js";

export interface DiagnoseInput {
  /** The node the failure surfaced on — requirement #3's "Serviço C". */
  failingNodeId: string;
  stackTrace: string;
  timestamp: string;
  /**
   * Recent log/error text per node, caller-supplied (this package has no log
   * pipeline of its own — same "shape, not a data source" posture as
   * `@qaf/rag-core`'s `sources/jira.ts`). Missing an entry for a candidate is
   * not an error — it just means that candidate is ranked on historical
   * incident similarity alone.
   */
  serviceLogs?: Record<string, string>;
}

export interface DiagnoseOptions {
  store: GraphStore;
  incidentStore: LocalIncidentStore;
  embeddingProvider: EmbeddingProvider;
  /** How many hops upstream to consider candidates from — see `root-cause/upstream.ts`. */
  maxDepth?: number;
  /** Below this combined score (0-100), `recommended_action` says so explicitly instead of asserting a confident-sounding root cause off weak evidence. */
  minConfidence?: number;
}

export interface RootCauseEvidence {
  nodeId: string;
  similarity: number;
  matchedIncidentId?: string;
}

export interface RootCauseAnalysis {
  origin_node: string;
  root_cause_node: string;
  /** 0-100, requirement #3's "taxa de confiança (%)". */
  confidence: number;
  recommended_action: string;
  evidence: RootCauseEvidence[];
}

const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_MIN_CONFIDENCE = 40;
const LOG_SIMILARITY_WEIGHT = 0.5;
const INCIDENT_SIMILARITY_WEIGHT = 0.5;
/** Per-hop penalty applied to a candidate's score — a tie-breaker favoring closer nodes, not a hard cutoff; a distant node with genuinely stronger evidence still wins. Tune per system. */
const DEPTH_PENALTY_PER_HOP = 0.05;
const MIN_DEPTH_MULTIPLIER = 0.5;

interface ScoredCandidate {
  nodeId: string;
  depth: number;
  finalScore: number;
  matchedIncidentId?: string;
}

/**
 * Ranks the failing node plus every upstream candidate (see
 * `findUpstreamCandidates`) by how well each one's evidence explains the
 * failure, and returns the top-ranked node as the diagnosed root cause.
 * "Evidence" is a 50/50 blend of two cosine similarities against the
 * failure's embedded signature: the candidate's own recent logs (if
 * supplied) and the nearest historical incident previously attributed to
 * that candidate. Both are advisory, not proof — same posture as
 * `@qaf/rag-core`'s CI failure clustering (docs/rag-coverage.md's "Risks").
 * The failing node itself is always a candidate at depth 0, so "no upstream
 * node scored higher" is a normal, correctly-reported outcome, not a
 * fallback path.
 */
export async function diagnoseRootCause(
  input: DiagnoseInput,
  options: DiagnoseOptions,
): Promise<RootCauseAnalysis> {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;

  const upstream = await findUpstreamCandidates(options.store, input.failingNodeId, maxDepth);
  const candidates: Array<{ nodeId: string; depth: number }> = [
    { nodeId: input.failingNodeId, depth: 0 },
    ...upstream.map((c: UpstreamCandidate) => ({ nodeId: c.nodeId, depth: c.depth })),
  ];

  const signature = buildFailureSignature(input);
  const logVectors = await embedCandidateLogs(candidates, input.serviceLogs, options.embeddingProvider);
  const signatureVector = await embedOne(signature, options.embeddingProvider);

  const scored = await Promise.all(
    candidates.map((candidate) =>
      scoreCandidate(candidate, signatureVector, logVectors.get(candidate.nodeId), options),
    ),
  );
  scored.sort((a, b) => b.finalScore - a.finalScore);

  const top = scored[0]!;
  const confidence = Math.round(Math.max(0, Math.min(1, top.finalScore)) * 100);

  return {
    origin_node: input.failingNodeId,
    root_cause_node: top.nodeId,
    confidence,
    recommended_action: await buildRecommendedAction(
      options.store,
      top,
      input.failingNodeId,
      confidence,
      minConfidence,
    ),
    evidence: scored.slice(0, 3).map((s) => ({
      nodeId: s.nodeId,
      similarity: round(s.finalScore),
      matchedIncidentId: s.matchedIncidentId,
    })),
  };
}

/** One batched `embed()` call across every candidate that has log text, rather than one call per candidate — same cost-consciousness as `@qaf/rag-core`'s `indexDocuments()`. */
async function embedCandidateLogs(
  candidates: Array<{ nodeId: string }>,
  serviceLogs: Record<string, string> | undefined,
  embeddingProvider: EmbeddingProvider,
): Promise<Map<string, number[]>> {
  const withLogs = candidates.filter((c) => serviceLogs?.[c.nodeId]);
  if (withLogs.length === 0) return new Map();

  const texts = withLogs.map((c) => serviceLogs![c.nodeId]!);
  const vectors = await embeddingProvider.embed(texts);
  const byNodeId = new Map<string, number[]>();
  withLogs.forEach((c, i) => {
    const vector = vectors[i];
    if (vector) byNodeId.set(c.nodeId, vector);
  });
  return byNodeId;
}

async function embedOne(text: string, embeddingProvider: EmbeddingProvider): Promise<number[]> {
  const [vector] = await embeddingProvider.embed([text]);
  if (!vector) {
    throw new Error(`EmbeddingProvider "${embeddingProvider.id}" returned no vector for a failure signature`);
  }
  return vector;
}

async function scoreCandidate(
  candidate: { nodeId: string; depth: number },
  signatureVector: number[],
  logVector: number[] | undefined,
  options: DiagnoseOptions,
): Promise<ScoredCandidate> {
  const logSimilarity = logVector ? cosineSimilarity(signatureVector, logVector) : 0;

  const incidentMatches = await options.incidentStore.query(signatureVector, {
    topK: 1,
    nodeId: candidate.nodeId,
  });
  const incidentSimilarity = incidentMatches[0]?.score ?? 0;

  const combined = LOG_SIMILARITY_WEIGHT * logSimilarity + INCIDENT_SIMILARITY_WEIGHT * incidentSimilarity;
  const decay = Math.max(MIN_DEPTH_MULTIPLIER, 1 - candidate.depth * DEPTH_PENALTY_PER_HOP);

  return {
    nodeId: candidate.nodeId,
    depth: candidate.depth,
    finalScore: combined * decay,
    matchedIncidentId: incidentMatches[0]?.id,
  };
}

function buildFailureSignature(input: DiagnoseInput): string {
  return normalizeWhitespace(`${input.stackTrace}\n${input.timestamp}`);
}

function normalizeWhitespace(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

async function buildRecommendedAction(
  store: GraphStore,
  top: ScoredCandidate,
  originNode: string,
  confidence: number,
  minConfidence: number,
): Promise<string> {
  const node = await store.getNode(top.nodeId);
  const origin = await store.getNode(originNode);
  const label = node?.label ?? top.nodeId;
  const originLabel = origin?.label ?? originNode;

  if (confidence < minConfidence) {
    return (
      `Insufficient evidence to isolate a root cause with confidence (${confidence}%). ` +
      `Investigate "${originLabel}" directly, and backfill service logs / historical incidents ` +
      `for the nodes upstream of it so future runs can diagnose automatically.`
    );
  }

  if (top.nodeId === originNode) {
    return `No upstream node scored meaningfully higher than the origin — investigate "${originLabel}" directly.`;
  }

  switch (node?.type) {
    case "MessageQueue":
      return (
        `Likely event schema drift on "${label}" — the failure surfaced in "${originLabel}" but the ` +
        `strongest match is this queue's producer contract. Check its latest event payload change.`
      );
    case "DBTable":
      return (
        `Likely schema/migration drift on "${label}", shared by multiple services — the failure ` +
        `surfaced in "${originLabel}" but the strongest match points at this table's latest migration.`
      );
    default:
      return (
        `Contract/behavior regression suspected in "${label}" (upstream dependency of "${originLabel}"); ` +
        `verify its latest deploy or contract change before treating "${originLabel}" as the faulty service.`
      );
  }
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
