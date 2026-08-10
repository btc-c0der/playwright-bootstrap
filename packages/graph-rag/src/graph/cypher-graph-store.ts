import type { GraphStore, NeighborOptions, TraversalHop, TraverseOptions } from "./graph-store.js";
import type { EdgeType, GraphEdge, GraphNode, NodeType } from "./types.js";

/**
 * The minimal shape this adapter needs from a driver — deliberately loose
 * enough that a `neo4j-driver` `Session`/`Transaction` (`.run(cypher, params)`
 * returning `{ records }`, each with `.get(key)`) satisfies it after a
 * one-line wrap, and so does a hand-rolled HTTP client against Memgraph's
 * Bolt-compatible endpoint. No `neo4j-driver` dependency is added to this
 * package — same opt-in posture as `@qaf/rag-core`'s `EmbeddingProvider`
 * (wire a real backend yourself; nothing here forces the dependency on a repo
 * that only wants `LocalGraphStore`).
 */
export interface CypherDriver {
  run(cypher: string, params?: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
}

/**
 * `GraphStore` implemented as generated Cypher over an injected `CypherDriver`
 * — works against Neo4j *and* Memgraph unchanged, since both speak Cypher and
 * this adapter never uses a vendor-specific procedure. Every node/edge is
 * tagged with a single `:GraphRagNode`/`:GraphRagEdge`-style label
 * (`n.__qafType`/`r.__qafType` property, not a Neo4j label per `NodeType`) so
 * this store can share a database with other data without a label collision
 * — trade a small amount of query verbosity for that isolation.
 */
export class Neo4jCompatibleGraphStore implements GraphStore {
  constructor(private readonly driver: CypherDriver) {}

  async addNode(node: GraphNode): Promise<void> {
    await this.driver.run(
      `MERGE (n:GraphRagNode {id: $id})
       SET n.__qafType = $type, n.label = $label, n.metadata = $metadata`,
      { id: node.id, type: node.type, label: node.label, metadata: JSON.stringify(node.metadata) },
    );
  }

  async addEdge(edge: GraphEdge): Promise<void> {
    await this.driver.run(
      `MATCH (a:GraphRagNode {id: $from}), (b:GraphRagNode {id: $to})
       MERGE (a)-[r:GraphRagEdge {__qafType: $type}]->(b)
       SET r.metadata = $metadata`,
      { from: edge.from, to: edge.to, type: edge.type, metadata: JSON.stringify(edge.metadata ?? {}) },
    );
  }

  async getNode(id: string): Promise<GraphNode | undefined> {
    const rows = await this.driver.run(`MATCH (n:GraphRagNode {id: $id}) RETURN n LIMIT 1`, { id });
    return rows[0] ? toGraphNode(rows[0].n) : undefined;
  }

  async nodes(type?: NodeType): Promise<GraphNode[]> {
    const rows = type
      ? await this.driver.run(`MATCH (n:GraphRagNode {__qafType: $type}) RETURN n`, { type })
      : await this.driver.run(`MATCH (n:GraphRagNode) RETURN n`);
    return rows.map((r) => toGraphNode(r.n));
  }

  async neighbors(nodeId: string, options: NeighborOptions = {}): Promise<GraphEdge[]> {
    const direction = options.direction ?? "out";
    const pattern =
      direction === "out"
        ? "(a:GraphRagNode {id: $id})-[r]->(b:GraphRagNode)"
        : "(b:GraphRagNode)-[r]->(a:GraphRagNode {id: $id})";
    const typeFilter = options.edgeTypes?.length ? "WHERE r.__qafType IN $edgeTypes" : "";
    const rows = await this.driver.run(
      `MATCH ${pattern} ${typeFilter} RETURN a.id AS a, b.id AS b, r`,
      { id: nodeId, edgeTypes: options.edgeTypes },
    );
    return rows.map((row) => toGraphEdge(row, direction));
  }

  /**
   * The Cypher this package's whole traversal story is named for:
   * `MATCH (seed)-[:TYPE*1..N]->(m)` (or `<-` for `direction: "in"`), one
   * variable-length path query instead of `maxDepth` round trips —
   * `LocalGraphStore.traverse()` gets the same result via `maxDepth` BFS
   * steps in-process because there's no query planner to hand a
   * variable-length pattern to.
   */
  async traverse(seedIds: string[], options: TraverseOptions): Promise<TraversalHop[]> {
    const direction = options.direction ?? "out";
    const relPattern = options.edgeTypes?.length
      ? `:${options.edgeTypes.join("|")}`
      : "";
    const arrow =
      direction === "out"
        ? `-[r${relPattern}*1..${options.maxDepth}]->`
        : `<-[r${relPattern}*1..${options.maxDepth}]-`;
    const rows = await this.driver.run(
      `MATCH (seed:GraphRagNode) WHERE seed.id IN $seedIds
       MATCH (seed)${arrow}(m:GraphRagNode)
       RETURN m.id AS nodeId, length(r) AS depth, r[-1] AS lastEdge, m AS m`,
      { seedIds },
    );
    // Real Neo4j/Memgraph rows already carry the shortest-path length; a
    // hand-rolled CypherDriver test double may return multiple paths of
    // different lengths to the same node, so keep the minimum depth seen —
    // this mirrors LocalGraphStore.traverse()'s "shortest path per node" contract.
    const best = new Map<string, TraversalHop>();
    for (const row of rows) {
      const id = row.nodeId as string;
      const depth = row.depth as number;
      const existing = best.get(id);
      if (!existing || depth < existing.depth) {
        best.set(id, { nodeId: id, depth, via: toGraphEdge({ a: "", b: id, r: row.lastEdge }, direction) });
      }
    }
    return [...best.values()];
  }
}

function toGraphNode(raw: unknown): GraphNode {
  const props = raw as { id: string; __qafType: NodeType; label: string; metadata: string };
  return {
    id: props.id,
    type: props.__qafType,
    label: props.label,
    metadata: JSON.parse(props.metadata || "{}"),
  };
}

function toGraphEdge(row: Record<string, unknown>, direction: "out" | "in"): GraphEdge {
  const r = row.r as { __qafType: EdgeType; metadata?: string };
  const a = row.a as string;
  const b = row.b as string;
  return {
    from: direction === "out" ? a : b,
    to: direction === "out" ? b : a,
    type: r.__qafType,
    metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
  };
}
