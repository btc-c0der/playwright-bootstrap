import type { EmbeddingProvider } from "@qaf/rag-core";
import type { EmbeddingGateway } from "@qaf/llm-gateway";

export interface GatewayEmbeddingProviderOptions {
  gateway: EmbeddingGateway;
  /** `"<prefix>:<model-name>"` — must be registered with an `EmbeddingGatewayProvider` on the gateway. */
  model: string;
  /** `EmbeddingProvider.dimensions` is declared up front (some `VectorStore`s size a collection from it before the first `embed()` call), not derived from a response. */
  dimensions: number;
  requestedBy?: string;
  runId?: string;
}

/**
 * `@qaf/rag-core`'s `EmbeddingProvider` implemented over
 * `@qaf/llm-gateway`'s `EmbeddingGateway` instead of a bespoke API client —
 * this is what actually routes the RAG/GraphRAG/synthetic-data pillars'
 * embedding calls through Layer 5's shared audit trail + PII redaction,
 * rather than each pillar holding its own unaudited provider.
 * `NoopEmbeddingProvider` remains the right default for anyone who hasn't
 * wired a gateway — see `apps/gateway-api/src/config.ts`'s
 * `buildEnginesWithGateway`.
 */
export class GatewayEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;

  constructor(private readonly options: GatewayEmbeddingProviderOptions) {
    this.id = options.model;
    this.dimensions = options.dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await this.options.gateway.embed({
      model: this.options.model,
      texts,
      requestedBy: this.options.requestedBy,
      runId: this.options.runId,
    });
    return response.vectors;
  }
}
