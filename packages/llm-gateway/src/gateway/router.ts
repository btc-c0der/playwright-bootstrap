import type { CompletionRequest, CompletionResponse, LLMGateway, LLMGatewayProvider } from "./types.js";

/**
 * Unified LLM Gateway Router — Layer 5's single dispatch point across
 * OpenAI/Anthropic/local Ollama/a LiteLLM proxy. `request.model`'s
 * `"<prefix>:<model-name>"` shape picks the provider; the provider then does
 * whatever it wants with the part after the colon (a real model name, or
 * nothing at all if it only ever serves one model).
 */
export class LLMGatewayRouter implements LLMGateway {
  private readonly providers = new Map<string, LLMGatewayProvider>();

  constructor(providers: LLMGatewayProvider[]) {
    for (const provider of providers) this.providers.set(provider.prefix, provider);
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const prefix = request.model.split(":")[0];
    const provider = prefix ? this.providers.get(prefix) : undefined;
    if (!provider) {
      throw new Error(
        `No LLMGatewayProvider registered for model "${request.model}" (prefix "${prefix ?? ""}"). ` +
          `Registered prefixes: ${[...this.providers.keys()].join(", ") || "(none)"}.`,
      );
    }
    return provider.complete(request);
  }
}
