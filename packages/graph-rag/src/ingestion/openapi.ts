import { nodeId } from "../graph/types.js";
import type { GraphEdge, GraphNode } from "../graph/types.js";
import { mergeResults } from "./types.js";
import type { IngestResult } from "./types.js";

/**
 * The slice of an OpenAPI/Swagger document this ingestor reads. Deliberately
 * minimal (not the full `openapi-types` surface) — same "shape, not an HTTP
 * client or a schema validator" posture as `@qaf/rag-core`'s `sources/jira.ts`.
 * A consuming repo parses its own YAML (`js-yaml`, `@apidevtools/swagger-parser`,
 * whatever it already uses) and passes the resulting object in; this package
 * adds no YAML dependency.
 *
 * Cross-service edges are contract-declared, not inferred from `$ref`/schema
 * shape — inferring "which service does this call" from an OpenAPI document
 * alone is unreliable (nothing in the spec says *who* calls it). The
 * `x-qaf-*` vendor extensions below are how a team declares that explicitly;
 * omit them and only the endpoint-ownership edges are produced.
 */
export interface OpenApiOperation {
  operationId?: string;
  tags?: string[];
  summary?: string;
  /** Other services this specific endpoint calls, e.g. `["payments-service"]`. */
  "x-qaf-depends-on"?: string[];
  /** DB tables this specific endpoint's handler writes to, e.g. `["orders"]`. */
  "x-qaf-writes-to"?: string[];
}

export interface OpenApiDocument {
  info?: { title?: string };
  /** Services this whole API depends on regardless of which endpoint is hit (e.g. an auth sidecar every request goes through). */
  "x-qaf-depends-on"?: string[];
  paths: Record<string, Record<string, OpenApiOperation>>;
}

export interface OpenApiIngestInput {
  serviceName: string;
  document: OpenApiDocument;
  /** Recorded on the Microservice/Endpoint nodes' `metadata.sourceFile` — what `impact/pr-diff.ts` matches a changed file path against. */
  sourceFile?: string;
}

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "options", "head"]);

/**
 * One `Microservice` node per input, one `Endpoint` node per path+method
 * (`Endpoint -DEPENDS_ON-> Microservice`, its own contract-declared
 * dependencies as additional `DEPENDS_ON` edges), and `Microservice
 * -WRITES_TO-> DBTable` for every `x-qaf-writes-to` table any of its
 * endpoints declares (deduplicated — an ingest orchestrator merging many
 * endpoints' edges is expected to collapse identical (from, to, type) triples,
 * see ingestion/ingest.ts).
 */
export function ingestOpenApiContracts(inputs: OpenApiIngestInput[]): IngestResult {
  return mergeResults(inputs.map(ingestOne));
}

function ingestOne(input: OpenApiIngestInput): IngestResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const serviceId = nodeId.service(input.serviceName);
  nodes.push({
    id: serviceId,
    type: "Microservice",
    label: input.document.info?.title ?? input.serviceName,
    metadata: { sourceFile: input.sourceFile },
  });

  for (const dependency of input.document["x-qaf-depends-on"] ?? []) {
    edges.push({ from: serviceId, to: nodeId.service(dependency), type: "DEPENDS_ON" });
  }

  for (const [pathTemplate, operations] of Object.entries(input.document.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;

      const endpointId = nodeId.endpoint(input.serviceName, method, pathTemplate);
      nodes.push({
        id: endpointId,
        type: "Endpoint",
        label: `${method.toUpperCase()} ${pathTemplate}`,
        metadata: {
          sourceFile: input.sourceFile,
          operationId: operation.operationId,
          tags: operation.tags ?? [],
          summary: operation.summary,
        },
      });
      // Ownership: the endpoint can't function if its own service is down —
      // modeled as DEPENDS_ON so impact analysis's single "who depends on
      // this" rule also surfaces a changed service's own endpoints.
      edges.push({ from: endpointId, to: serviceId, type: "DEPENDS_ON" });

      for (const dependency of operation["x-qaf-depends-on"] ?? []) {
        edges.push({ from: endpointId, to: nodeId.service(dependency), type: "DEPENDS_ON" });
      }
      for (const table of operation["x-qaf-writes-to"] ?? []) {
        edges.push({ from: serviceId, to: nodeId.table(table), type: "WRITES_TO" });
        nodes.push({ id: nodeId.table(table), type: "DBTable", label: table, metadata: {} });
      }
    }
  }

  return { nodes, edges };
}
