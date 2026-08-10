import type { ChatMessage, CompletionRequest, CompletionResponse, ContentPart, LLMGatewayProvider } from "../gateway/types.js";

export interface OpenAiCompatibleProviderOptions {
  /** Which model prefix this instance owns — register separate instances under `"openai"`/`"ollama"`/`"litellm"` even though they share this same class. */
  prefix: string;
  /** e.g. `"https://api.openai.com/v1"`, `"http://localhost:11434/v1"` (Ollama's OpenAI-compatible endpoint), or a LiteLLM proxy's base URL. */
  baseUrl: string;
  apiKey?: string;
}

interface OpenAiChatCompletionResponse {
  model: string;
  choices: Array<{ message: { content: string } }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

/**
 * One `LLMGatewayProvider` for every backend that speaks OpenAI's
 * `/chat/completions` wire format — which is most of them: OpenAI itself,
 * Ollama (`/v1/chat/completions`, OpenAI-compatible since Ollama 0.1.x), and
 * any LiteLLM proxy (LiteLLM's whole purpose is normalizing every provider
 * behind this same shape). Plain `fetch`, no `openai` SDK dependency.
 */
export class OpenAiCompatibleProvider implements LLMGatewayProvider {
  readonly prefix: string;

  constructor(private readonly options: OpenAiCompatibleProviderOptions) {
    this.prefix = options.prefix;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const modelName = modelNameWithoutPrefix(request.model);
    const res = await fetch(`${this.options.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: modelName,
        messages: request.messages.map(toOpenAiMessage),
        temperature: request.temperature,
        max_tokens: request.maxOutputTokens,
      }),
    });
    if (!res.ok) {
      throw new Error(`${this.prefix} completion failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as OpenAiChatCompletionResponse;
    const usage = body.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    return {
      model: request.model,
      content: body.choices[0]?.message.content ?? "",
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      },
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

function toOpenAiMessage(message: ChatMessage): { role: string; content: string | OpenAiContentPart[] } {
  if (typeof message.content === "string") return { role: message.role, content: message.content };
  return { role: message.role, content: message.content.map(toOpenAiContentPart) };
}

type OpenAiContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

function toOpenAiContentPart(part: ContentPart): OpenAiContentPart {
  if (part.type === "text") return { type: "text", text: part.text };
  return { type: "image_url", image_url: { url: `data:${part.mediaType};base64,${part.data}` } };
}
