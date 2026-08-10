import type { EdgeType, GraphEdge, GraphNode, NodeType } from "./types.js";

export type Direction = "out" | "in";

export interface NeighborOptions {
  edgeTypes?: EdgeType[];
  direction?: Direction;
}

export interface TraverseOptions {
  edgeTypes?: EdgeType[];
  direction?: Direction;
  /** Cypher's `*1..N` — how many hops out from the seeds to walk. */
  maxDepth: number;
}

export interface TraversalHop {
  nodeId: string;
  /** Hop count from the nearest seed (seeds themselves are depth 0 and are not included in the result). */
  depth: number;
  /** The edge that reached this node on its shortest path from a seed. */
  via: GraphEdge;
}

/**
 * Pluggable, opt-in graph backend — same shape as `@qaf/rag-core`'s
 * `EmbeddingProvider`/`VectorStore`. This package ships `LocalGraphStore`
 * (dependency-free, fine at single-team scale — see local-graph-store.ts) and
 * `Neo4jCompatibleGraphStore` (translates the same interface into Cypher
 * against any driver-shaped object, so it works against Neo4j *or* Memgraph
 * without this package depending on either driver — see
 * cypher-graph-store.ts). A consuming repo picks the backend; nothing here
 * hard-codes one.
 */
export interface GraphStore {
  /** Upsert by id — merges `metadata` into any existing node rather than replacing it (re-running an ingestor is safe). */
  addNode(node: GraphNode): Promise<void>;
  /** Upsert by (from, to, type) — merges `metadata`. */
  addEdge(edge: GraphEdge): Promise<void>;
  getNode(id: string): Promise<GraphNode | undefined>;
  nodes(type?: NodeType): Promise<GraphNode[]>;
  /** Cypher's `MATCH (n)-[:TYPE]->(m)` / `<-[:TYPE]-` for one hop from `nodeId`. */
  neighbors(nodeId: string, options?: NeighborOptions): Promise<GraphEdge[]>;
  /** Cypher's `MATCH (n)-[:TYPE*1..maxDepth]->(m)` from any of `seedIds` — a uniform single-rule BFS primitive; domain-specific multi-rule walks (impact, upstream root cause) compose `neighbors()` calls directly instead, see impact/traversal.ts and root-cause/upstream.ts. */
  traverse(seedIds: string[], options: TraverseOptions): Promise<TraversalHop[]>;
}
