import type { GraphStore } from "../graph/graph-store.js";
import type { EdgeType, GraphNode } from "../graph/types.js";

export interface ImpactedNode {
  nodeId: string;
  /** Hop count from the nearest changed seed. */
  depth: number;
  /** The edge type this node was reached through — `"seed"` for the changed nodes themselves. */
  via: EdgeType | "seed";
}

export interface ImpactResult {
  seeds: string[];
  /** Excludes the seeds — see `seeds` for those. */
  impacted: ImpactedNode[];
}

/**
 * BFS outward from `seedIds` (the changed nodes) up to `maxDepth` hops,
 * following this package's fixed per-edge-type "who gets impacted when this
 * node changes" rules rather than a single uniform direction — this is the
 * one traversal in the package that can't be expressed as one
 * `GraphStore.traverse()` call, so it composes `neighbors()` directly:
 *
 * - `:DEPENDS_ON` reversed — anything that declares a dependency on the
 *   changed node is impacted (this is also how an `Endpoint` inherits its
 *   owning `Microservice`'s impact, since ownership is itself a `DEPENDS_ON`
 *   edge — see ingestion/openapi.ts).
 * - `:PRODUCES_EVENT` forward, then `:CONSUMES_EVENT` reversed from the
 *   queue — a producer's contract change can break its consumers even though
 *   no `DEPENDS_ON` edge connects them directly.
 * - `:WRITES_TO` forward, then `:WRITES_TO` reversed from the table — a
 *   schema/migration change on a shared table can break every other writer
 *   of that table.
 *
 * These rules are a starting model, not a law — a team may find its own
 * topology needs `:CONSUMES_EVENT` treated as bidirectional too, or a decay
 * on cross-queue impact. Tune here first before tuning `impact_radius_score`.
 */
export async function computeImpact(
  store: GraphStore,
  seedIds: string[],
  options: { maxDepth: number },
): Promise<ImpactResult> {
  const visited = new Map<string, ImpactedNode>();
  for (const seed of seedIds) visited.set(seed, { nodeId: seed, depth: 0, via: "seed" });

  let frontier = seedIds;
  for (let depth = 1; depth <= options.maxDepth && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const nodeId of frontier) {
      const node = await store.getNode(nodeId);
      if (!node) continue;
      for (const successor of await impactSuccessors(store, node)) {
        if (visited.has(successor.nodeId)) continue;
        visited.set(successor.nodeId, { nodeId: successor.nodeId, depth, via: successor.via });
        next.push(successor.nodeId);
      }
    }
    frontier = next;
  }

  const impacted = [...visited.values()].filter((n) => n.via !== "seed");
  return { seeds: seedIds, impacted };
}

async function impactSuccessors(
  store: GraphStore,
  node: GraphNode,
): Promise<Array<{ nodeId: string; via: EdgeType }>> {
  const successors: Array<{ nodeId: string; via: EdgeType }> = [];

  const dependents = await store.neighbors(node.id, { edgeTypes: ["DEPENDS_ON"], direction: "in" });
  successors.push(...dependents.map((e) => ({ nodeId: e.from, via: "DEPENDS_ON" as const })));

  if (node.type === "Microservice") {
    const produced = await store.neighbors(node.id, { edgeTypes: ["PRODUCES_EVENT"], direction: "out" });
    for (const producesEdge of produced) {
      successors.push({ nodeId: producesEdge.to, via: "PRODUCES_EVENT" });
      const consumers = await store.neighbors(producesEdge.to, {
        edgeTypes: ["CONSUMES_EVENT"],
        direction: "in",
      });
      successors.push(...consumers.map((e) => ({ nodeId: e.from, via: "CONSUMES_EVENT" as const })));
    }

    const written = await store.neighbors(node.id, { edgeTypes: ["WRITES_TO"], direction: "out" });
    for (const writesEdge of written) {
      successors.push({ nodeId: writesEdge.to, via: "WRITES_TO" });
      const coWriters = await store.neighbors(writesEdge.to, {
        edgeTypes: ["WRITES_TO"],
        direction: "in",
      });
      successors.push(
        ...coWriters.filter((e) => e.from !== node.id).map((e) => ({ nodeId: e.from, via: "WRITES_TO" as const })),
      );
    }
  }

  return successors;
}

/**
 * `selected_tests`'s `impact_radius_score`: the fraction of *system* nodes
 * (everything except `TestCase`/`UserStory` — those are downstream
 * artifacts, not topology) that ended up impacted. 0 means the change is
 * fully isolated; 1 means every service/endpoint/queue/table in the graph is
 * reachable from the change. A simple, auditable metric on purpose — this is
 * a CI gating input, not a place for an opaque score.
 */
export function computeImpactRadiusScore(impact: ImpactResult, allNodes: GraphNode[]): number {
  const systemNodeIds = new Set(
    allNodes.filter((n) => n.type !== "TestCase" && n.type !== "UserStory").map((n) => n.id),
  );
  if (systemNodeIds.size === 0) return 0;

  const impactedSystemNodeIds = new Set(
    [...impact.seeds, ...impact.impacted.map((n) => n.nodeId)].filter((id) => systemNodeIds.has(id)),
  );
  return round(impactedSystemNodeIds.size / systemNodeIds.size);
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
