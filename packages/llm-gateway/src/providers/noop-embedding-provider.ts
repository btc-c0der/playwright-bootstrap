import type { EmbeddingGatewayProvider, EmbeddingRequest, EmbeddingResponse } from "../embedding/types.js";

/** Default for any embedding prefix nobody's wired a real backend for yet — throws with a pointer, same posture as `NoopLLMGatewayProvider`. */
export class NoopEmbeddingGatewayProvider implements EmbeddingGatewayProvider {
  constructor(public readonly prefix: string = "noop") {}

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    throw new Error(
      `Embedding calls are opt-in and require a real EmbeddingGatewayProvider registered for prefix "${this.prefix}" ` +
        `— see docs/ai-platform.md. Requested model: "${request.model}".`,
    );
  }
}
