import type { GraphStore } from "../graph/graph-store.js";
import type { EdgeType, GraphNode } from "../graph/types.js";

export interface UpstreamCandidate {
  nodeId: string;
  /** Hop count from the failing node — closer candidates get a small preference in diagnose.ts's ranking, see its `distanceDecay`. */
  depth: number;
  via: EdgeType;
}

/**
 * BFS "upstream" from the node a failure surfaced on — the mirror image of
 * `impact/traversal.ts`'s rules, walked forward instead of reversed:
 *
 * - `:DEPENDS_ON` forward — what the failing node itself depends on. If a
 *   dependency broke its contract, the failure surfaces downstream but the
 *   fault is upstream (requirement #3's worked example: fails in C, root
 *   cause in A, with C→B→A a `DEPENDS_ON` chain).
 * - `:CONSUMES_EVENT` forward to the queue, then `:PRODUCES_EVENT` reversed
 *   from the queue — the failing node's event producer is upstream of it
 *   even with no direct `DEPENDS_ON` edge.
 *
 * Deliberately does *not* walk `:WRITES_TO` — a co-writer of the same table
 * is a peer, not something the failing node depends on to function, so it's
 * an `impact` relationship, not a `root-cause` one.
 */
export async function findUpstreamCandidates(
  store: GraphStore,
  failingNodeId: string,
  maxDepth: number,
): Promise<UpstreamCandidate[]> {
  const visited = new Map<string, UpstreamCandidate>();
  let frontier = [failingNodeId];
  const seen = new Set([failingNodeId]);

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const nodeId of frontier) {
      const node = await store.getNode(nodeId);
      if (!node) continue;
      for (const candidate of await upstreamSuccessors(store, node)) {
        if (seen.has(candidate.nodeId)) continue;
        seen.add(candidate.nodeId);
        visited.set(candidate.nodeId, { nodeId: candidate.nodeId, depth, via: candidate.via });
        next.push(candidate.nodeId);
      }
    }
    frontier = next;
  }

  return [...visited.values()];
}

async function upstreamSuccessors(
  store: GraphStore,
  node: GraphNode,
): Promise<Array<{ nodeId: string; via: EdgeType }>> {
  const successors: Array<{ nodeId: string; via: EdgeType }> = [];

  const dependencies = await store.neighbors(node.id, { edgeTypes: ["DEPENDS_ON"], direction: "out" });
  successors.push(...dependencies.map((e) => ({ nodeId: e.to, via: "DEPENDS_ON" as const })));

  if (node.type === "Microservice") {
    const consumed = await store.neighbors(node.id, { edgeTypes: ["CONSUMES_EVENT"], direction: "out" });
    for (const consumesEdge of consumed) {
      const producers = await store.neighbors(consumesEdge.to, {
        edgeTypes: ["PRODUCES_EVENT"],
        direction: "in",
      });
      successors.push(...producers.map((e) => ({ nodeId: e.from, via: "PRODUCES_EVENT" as const })));
    }
  }

  return successors;
}
