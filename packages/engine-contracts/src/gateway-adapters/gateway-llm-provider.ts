import type { LLMCompletionOptions, LLMProvider } from "@qaf/synth-data";
import type { LLMGateway } from "@qaf/llm-gateway";

export interface GatewayLLMProviderOptions {
  gateway: LLMGateway;
  /** `"<prefix>:<model-name>"` — must be registered with an `LLMGatewayProvider` on the gateway. */
  model: string;
  requestedBy?: string;
  runId?: string;
}

/**
 * `@qaf/synth-data`'s `LLMProvider` implemented over `@qaf/llm-gateway`'s
 * `LLMGateway` instead of a bespoke API client — routes synthetic-data
 * generation calls through Layer 5's shared audit trail + PII redaction
 * rather than a provider this platform can't see into. `NoopLLMProvider`
 * remains the right default for anyone who hasn't wired a gateway.
 */
export class GatewayLLMProvider implements LLMProvider {
  readonly id: string;

  constructor(private readonly options: GatewayLLMProviderOptions) {
    this.id = options.model;
  }

  async complete(prompt: string, completionOptions?: LLMCompletionOptions): Promise<string> {
    const response = await this.options.gateway.complete({
      model: this.options.model,
      requestedBy: this.options.requestedBy ?? "synth-data-engine",
      runId: this.options.runId,
      temperature: completionOptions?.temperature,
      maxOutputTokens: completionOptions?.maxOutputTokens,
      messages: [{ role: "user", content: prompt }],
    });
    return response.content;
  }
}
