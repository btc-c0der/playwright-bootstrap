import type { EmbeddingGateway, EmbeddingGatewayProvider, EmbeddingRequest, EmbeddingResponse } from "./types.js";

/** Embeddings' equivalent of `LLMGatewayRouter` — same prefix-dispatch shape, separate because embeddings are a separate API from chat completions. */
export class EmbeddingGatewayRouter implements EmbeddingGateway {
  private readonly providers = new Map<string, EmbeddingGatewayProvider>();

  constructor(providers: EmbeddingGatewayProvider[]) {
    for (const provider of providers) this.providers.set(provider.prefix, provider);
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const prefix = request.model.split(":")[0];
    const provider = prefix ? this.providers.get(prefix) : undefined;
    if (!provider) {
      throw new Error(
        `No EmbeddingGatewayProvider registered for model "${request.model}" (prefix "${prefix ?? ""}"). ` +
          `Registered prefixes: ${[...this.providers.keys()].join(", ") || "(none)"}.`,
      );
    }
    return provider.embed(request);
  }
}
