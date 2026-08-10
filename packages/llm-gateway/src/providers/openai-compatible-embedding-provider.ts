import type { EmbeddingGatewayProvider, EmbeddingRequest, EmbeddingResponse } from "../embedding/types.js";

export interface OpenAiCompatibleEmbeddingProviderOptions {
  /** Which model prefix this instance owns — `"openai"` and `"ollama"` both speak this same wire format. */
  prefix: string;
  /** e.g. `"https://api.openai.com/v1"`, `"http://localhost:11434/v1"` (Ollama), or a LiteLLM proxy's base URL. */
  baseUrl: string;
  apiKey?: string;
}

interface OpenAiEmbeddingsResponse {
  data: Array<{ embedding: number[] }>;
  usage?: { prompt_tokens: number; total_tokens: number };
}

/**
 * One `EmbeddingGatewayProvider` for every backend that speaks OpenAI's
 * `/embeddings` wire format — OpenAI itself, Ollama's OpenAI-compatible
 * embeddings endpoint, and any LiteLLM proxy. Plain `fetch`, no `openai` SDK
 * dependency, same posture as `OpenAiCompatibleProvider` (the completions
 * equivalent) — note Anthropic has no native embeddings API, so there's no
 * Anthropic embedding provider to pair with `AnthropicProvider`.
 */
export class OpenAiCompatibleEmbeddingProvider implements EmbeddingGatewayProvider {
  readonly prefix: string;

  constructor(private readonly options: OpenAiCompatibleEmbeddingProviderOptions) {
    this.prefix = options.prefix;
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const modelName = modelNameWithoutPrefix(request.model);
    const res = await fetch(`${this.options.baseUrl}/embeddings`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ model: modelName, input: request.texts }),
    });
    if (!res.ok) {
      throw new Error(`${this.prefix} embedding failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as OpenAiEmbeddingsResponse;
    const usage = body.usage ?? { prompt_tokens: 0, total_tokens: 0 };
    return {
      model: request.model,
      vectors: body.data.map((d) => d.embedding),
      usage: { promptTokens: usage.prompt_tokens, totalTokens: usage.total_tokens },
    };
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.options.apiKey) headers.Authorization = `Bearer ${this.options.apiKey}`;
    return headers;
  }
}

function modelNameWithoutPrefix(model: string): string {
  const colonIndex = model.indexOf(":");
  return colonIndex === -1 ? model : model.slice(colonIndex + 1);
}
