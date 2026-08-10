import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GraphStore, NeighborOptions, TraversalHop, TraverseOptions } from "./graph-store.js";
import type { GraphEdge, GraphNode, NodeType } from "./types.js";

interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Default `GraphStore` backend: an in-memory adjacency-list graph (the same
 * role NetworkX plays in a Python stack), snapshotted to one JSON file
 * (`<baseDir>/graph.json` by convention) rather than a database — matches
 * this framework's existing file-based state convention
 * (`LocalJsonlVectorStore`, `test-run-history.jsonl`). Fine at single-team
 * scale (a system's service topology is hundreds, not millions, of nodes);
 * swap in `Neo4jCompatibleGraphStore` (or any other `GraphStore`) once/if a
 * team wants Cypher query access, multi-writer concurrency, or a graph too
 * large to load into memory.
 *
 * Unlike `LocalJsonlVectorStore`, this store keeps everything in memory from
 * construction — a service graph is small enough that lazy per-namespace
 * loading isn't worth the complexity. `load()`/`save()` are explicit so
 * ingestion can batch many `addNode`/`addEdge` calls and persist once.
 */
export class LocalGraphStore implements GraphStore {
  private readonly filePath: string;
  private nodesById = new Map<string, GraphNode>();
  /** `from -> edges` and `to -> edges`, kept in sync on every `addEdge` — trades write-time bookkeeping for O(1) neighbor lookups instead of a full edge scan per traversal step. */
  private outEdges = new Map<string, GraphEdge[]>();
  private inEdges = new Map<string, GraphEdge[]>();

  constructor(baseDir = ".qaf/graph-index") {
    this.filePath = path.join(baseDir, "graph.json");
  }

  async addNode(node: GraphNode): Promise<void> {
    const existing = this.nodesById.get(node.id);
    this.nodesById.set(node.id, existing
      ? { ...existing, ...node, metadata: { ...existing.metadata, ...node.metadata } }
      : node);
  }

  async addEdge(edge: GraphEdge): Promise<void> {
    const out = this.outEdges.get(edge.from) ?? [];
    const existing = out.find((e) => e.to === edge.to && e.type === edge.type);
    if (existing) {
      existing.metadata = { ...existing.metadata, ...edge.metadata };
      return;
    }
    const stored: GraphEdge = { ...edge };
    out.push(stored);
    this.outEdges.set(edge.from, out);
    const inList = this.inEdges.get(edge.to) ?? [];
    inList.push(stored);
    this.inEdges.set(edge.to, inList);
  }

  async getNode(id: string): Promise<GraphNode | undefined> {
    return this.nodesById.get(id);
  }

  async nodes(type?: NodeType): Promise<GraphNode[]> {
    const all = [...this.nodesById.values()];
    return type ? all.filter((n) => n.type === type) : all;
  }

  async neighbors(nodeId: string, options: NeighborOptions = {}): Promise<GraphEdge[]> {
    const direction = options.direction ?? "out";
    const edges = direction === "out" ? this.outEdges.get(nodeId) : this.inEdges.get(nodeId);
    if (!edges) return [];
    return options.edgeTypes ? edges.filter((e) => options.edgeTypes!.includes(e.type)) : [...edges];
  }

  /**
   * Single-rule BFS: from every seed, repeatedly expand via `neighbors()` up
   * to `maxDepth` hops, recording each node's shortest-path depth and the
   * edge that reached it. `impact/traversal.ts` and `root-cause/upstream.ts`
   * don't use this directly (their rules mix edge types/directions per node
   * type) but it's the primitive a simpler single-rule query — or a
   * hand-rolled Cypher equivalent against `Neo4jCompatibleGraphStore` — maps
   * onto directly.
   */
  async traverse(seedIds: string[], options: TraverseOptions): Promise<TraversalHop[]> {
    const seen = new Map<string, TraversalHop>();
    let frontier = new Set(seedIds);
    const visitedIds = new Set(seedIds);

    for (let depth = 1; depth <= options.maxDepth && frontier.size > 0; depth++) {
      const next = new Set<string>();
      for (const id of frontier) {
        const edges = await this.neighbors(id, {
          edgeTypes: options.edgeTypes,
          direction: options.direction,
        });
        for (const edge of edges) {
          const target = options.direction === "in" ? edge.from : edge.to;
          if (visitedIds.has(target)) continue;
          visitedIds.add(target);
          next.add(target);
          seen.set(target, { nodeId: target, depth, via: edge });
        }
      }
      frontier = next;
    }
    return [...seen.values()];
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const snapshot = JSON.parse(raw) as GraphSnapshot;
      this.nodesById = new Map(snapshot.nodes.map((n) => [n.id, n]));
      this.outEdges = new Map();
      this.inEdges = new Map();
      for (const edge of snapshot.edges) await this.addEdge(edge);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }

  async save(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.toJSON(), null, 2), "utf-8");
  }

  toJSON(): GraphSnapshot {
    return {
      nodes: [...this.nodesById.values()],
      edges: [...this.outEdges.values()].flat(),
    };
  }

  static fromJSON(snapshot: GraphSnapshot, baseDir = ".qaf/graph-index"): LocalGraphStore {
    const store = new LocalGraphStore(baseDir);
    for (const node of snapshot.nodes) store.nodesById.set(node.id, node);
    for (const edge of snapshot.edges) {
      const out = store.outEdges.get(edge.from) ?? [];
      out.push(edge);
      store.outEdges.set(edge.from, out);
      const inList = store.inEdges.get(edge.to) ?? [];
      inList.push(edge);
      store.inEdges.set(edge.to, inList);
    }
    return store;
  }
}
