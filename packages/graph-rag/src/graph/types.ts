/**
 * The fixed topology schema this package models SIT systems with. Deliberately
 * closed (not an arbitrary property-graph API) — every ingestor, traversal
 * rule, and CLI in this package assumes exactly these node/edge kinds, which
 * is what lets impact analysis and root-cause diagnosis encode domain rules
 * per edge type (see impact/traversal.ts, root-cause/upstream.ts) instead of
 * a generic "walk everything" traversal.
 */
export type NodeType =
  | "Microservice"
  | "Endpoint"
  | "MessageQueue"
  | "DBTable"
  | "TestCase"
  | "UserStory";

/**
 * `:DEPENDS_ON` is the dependent→dependency direction throughout this package
 * (e.g. `Endpoint -DEPENDS_ON-> Microservice` for ownership, or
 * `Microservice -DEPENDS_ON-> Microservice` for a direct call) — "impact"
 * always walks it in reverse (who depends on the thing that changed) and
 * "root cause" always walks it forward (what does the failing thing depend
 * on). `:COVERS_TEST` is `TestCase -COVERS_TEST-> <anything>` — a test
 * verifies that node.
 */
export type EdgeType =
  | "DEPENDS_ON"
  | "PRODUCES_EVENT"
  | "CONSUMES_EVENT"
  | "WRITES_TO"
  | "COVERS_TEST";

export interface GraphNode {
  id: string;
  type: NodeType;
  /** Human-readable name, e.g. "orders-service" or "POST /orders". */
  label: string;
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: EdgeType;
  metadata?: Record<string, unknown>;
}

/**
 * Stable, deterministic id conventions (`<kind>:<name>`) so independent
 * ingestion passes (OpenAPI today, a different run tomorrow) address the same
 * node without a lookup table, and so `impact/pr-diff.ts` can resolve a
 * human-typed ref (`"service:orders-service"`) straight into a node id.
 */
export const nodeId = {
  service: (name: string): string => `service:${name}`,
  endpoint: (serviceName: string, method: string, pathTemplate: string): string =>
    `endpoint:${serviceName}:${method.toUpperCase()} ${pathTemplate}`,
  queue: (channelName: string): string => `queue:${channelName}`,
  table: (tableName: string): string => `table:${tableName}`,
  test: (file: string, title: string): string => `test:${file}::${title}`,
  story: (key: string): string => `story:${key}`,
};

const PREFIX_TO_TYPE: Record<string, NodeType> = {
  service: "Microservice",
  endpoint: "Endpoint",
  queue: "MessageQueue",
  table: "DBTable",
  test: "TestCase",
  story: "UserStory",
};

/** Infers a node's type from its id prefix — used to synthesize placeholder nodes for dangling edge endpoints (see ingestion/ingest.ts). */
export function nodeTypeFromId(id: string): NodeType | undefined {
  const prefix = id.slice(0, id.indexOf(":"));
  return PREFIX_TO_TYPE[prefix];
}

/**
 * Parses a human/annotation-supplied ref like `"service:orders-service"` or
 * `"endpoint:orders-service:POST /orders"` into `{ type, id }`. Returns
 * `undefined` for anything that doesn't match a known prefix — callers (e.g.
 * `impact/pr-diff.ts`) fall back to file-path matching in that case rather
 * than treating it as an error, since a PR diff mixes both kinds of refs.
 */
export function parseNodeRef(ref: string): { type: NodeType; id: string } | undefined {
  const prefix = ref.slice(0, ref.indexOf(":"));
  const type = PREFIX_TO_TYPE[prefix];
  if (!type) return undefined;
  return { type, id: ref };
}
