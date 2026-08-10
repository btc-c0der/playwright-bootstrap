import type { CompletionRequest, CompletionResponse, LLMGatewayProvider } from "../gateway/types.js";

/** Default for any prefix nobody's wired a real backend for yet — throws with a pointer, same posture as every other Noop provider in this monorepo (`NoopEmbeddingProvider`, `NoopLLMProvider`, `NoopAiRepairProvider`). */
export class NoopLLMGatewayProvider implements LLMGatewayProvider {
  constructor(public readonly prefix: string = "noop") {}

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    throw new Error(
      `LLM calls are opt-in and require a real LLMGatewayProvider registered for prefix "${this.prefix}" ` +
        `— see docs/llm-gateway.md. Requested model: "${request.model}".`,
    );
  }
}
