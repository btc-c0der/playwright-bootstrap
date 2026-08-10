export interface LLMCompletionOptions {
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * Pluggable, opt-in generation backend — same shape and same posture as
 * `@qaf/rag-core`'s `EmbeddingProvider`: this package ships only
 * `NoopLLMProvider`, wiring a real model (OpenAI/Anthropic/a local model via
 * Ollama) is a consuming-repo choice (see `bin/load-provider.ts` and
 * docs/synthetic-data-engine.md) so no generation call is forced to hold an
 * API key it doesn't want.
 */
export interface LLMProvider {
  /** Identifies the model, e.g. `"anthropic:claude-sonnet-5"` — not persisted anywhere today (unlike `EmbeddingProvider.id`, no vector space to keep consistent), but useful in logs/error messages. */
  readonly id: string;
  complete(prompt: string, options?: LLMCompletionOptions): Promise<string>;
}

/**
 * Default provider — generation is opt-in, and like `NoopEmbeddingProvider`
 * (and unlike `NoopAiRepairProvider`), there's no meaningful empty completion
 * to return: an empty string would just fail JSON parsing one step later with
 * a confusing error. Throws immediately with a pointer to how to wire a real
 * one instead.
 */
export class NoopLLMProvider implements LLMProvider {
  readonly id = "noop";

  async complete(): Promise<string> {
    throw new Error(
      "Synthetic data generation is opt-in and requires a real LLMProvider to be configured " +
        "— see docs/synthetic-data-engine.md for how to wire one (e.g. an OpenAI/Anthropic/Ollama-backed provider).",
    );
  }
}
