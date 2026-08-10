import { nodeId } from "../graph/types.js";
import type { GraphEdge, GraphNode } from "../graph/types.js";
import { mergeResults } from "./types.js";
import type { IngestResult } from "./types.js";

/**
 * The slice of an AsyncAPI-shaped document this ingestor reads — one entry
 * per channel/topic, each optionally naming a `publish` and/or `subscribe`
 * operation. Kept in AsyncAPI's own vocabulary (operations named from *this*
 * service's perspective: `publish` = this service sends messages,
 * `subscribe` = this service receives them) rather than a bespoke shape, so a
 * real AsyncAPI document needs no translation beyond JSON-parsing its YAML —
 * same "shape only" posture as openapi.ts.
 */
export interface AsyncApiChannel {
  publish?: { operationId?: string };
  subscribe?: { operationId?: string };
}

export interface AsyncApiDocument {
  channels: Record<string, AsyncApiChannel>;
}

export interface AsyncApiIngestInput {
  serviceName: string;
  document: AsyncApiDocument;
  sourceFile?: string;
}

/**
 * One `MessageQueue` node per channel; `Microservice -PRODUCES_EVENT->
 * MessageQueue` for every channel this service publishes to, `Microservice
 * -CONSUMES_EVENT-> MessageQueue` for every channel it subscribes to. Two
 * services can (and typically do) both point at the same queue node from
 * different inputs — that shared node is exactly what lets
 * `impact/traversal.ts` walk producer → queue → consumers.
 */
export function ingestAsyncApiContracts(inputs: AsyncApiIngestInput[]): IngestResult {
  return mergeResults(inputs.map(ingestOne));
}

function ingestOne(input: AsyncApiIngestInput): IngestResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const serviceId = nodeId.service(input.serviceName);

  for (const [channelName, channel] of Object.entries(input.document.channels)) {
    const queueId = nodeId.queue(channelName);
    nodes.push({ id: queueId, type: "MessageQueue", label: channelName, metadata: { sourceFile: input.sourceFile } });

    if (channel.publish) {
      edges.push({
        from: serviceId,
        to: queueId,
        type: "PRODUCES_EVENT",
        metadata: { operationId: channel.publish.operationId },
      });
    }
    if (channel.subscribe) {
      edges.push({
        from: serviceId,
        to: queueId,
        type: "CONSUMES_EVENT",
        metadata: { operationId: channel.subscribe.operationId },
      });
    }
  }

  return { nodes, edges };
}
