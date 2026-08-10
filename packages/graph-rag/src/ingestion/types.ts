import type { GraphEdge, GraphNode } from "../graph/types.js";

/** What every ingestor produces — plain data, not a `GraphStore` write, so results from independent ingestors can be merged and de-duplicated before anything touches a store (see ingest.ts). */
export interface IngestResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function emptyResult(): IngestResult {
  return { nodes: [], edges: [] };
}

export function mergeResults(results: IngestResult[]): IngestResult {
  return {
    nodes: results.flatMap((r) => r.nodes),
    edges: results.flatMap((r) => r.edges),
  };
}
