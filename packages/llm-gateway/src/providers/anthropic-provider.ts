import type { ChatMessage, CompletionRequest, CompletionResponse, ContentPart, LLMGatewayProvider } from "../gateway/types.js";

export interface AnthropicProviderOptions {
  apiKey: string;
  baseUrl?: string;
  apiVersion?: string;
}

interface AnthropicMessagesResponse {
  model: string;
  content: Array<{ type: string; text?: string }>;
  usage: { input_tokens: number; output_tokens: number };
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

const DEFAULT_BASE_URL = "https://api.anthropic.com/v1";
const DEFAULT_API_VERSION = "2023-06-01";
const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

/** `LLMGatewayProvider` for Anthropic's native Messages API — plain `fetch`, no `@anthropic-ai/sdk` dependency. Registers under prefix `"anthropic"`. */
export class AnthropicProvider implements LLMGatewayProvider {
  readonly prefix = "anthropic";

  constructor(private readonly options: AnthropicProviderOptions) {}

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const colonIndex = request.model.indexOf(":");
    const modelName = colonIndex === -1 ? request.model : request.model.slice(colonIndex + 1);
    const systemMessage = request.messages.find((m) => m.role === "system");
    const system = systemMessage ? contentToPlainText(systemMessage.content) : undefined;
    const messages = request.messages.filter((m) => m.role !== "system").map(toAnthropicMessage);

    const res = await fetch(`${this.options.baseUrl ?? DEFAULT_BASE_URL}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.options.apiKey,
        "anthropic-version": this.options.apiVersion ?? DEFAULT_API_VERSION,
      },
      body: JSON.stringify({
        model: modelName,
        system,
        messages,
        max_tokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        temperature: request.temperature,
      }),
    });
    if (!res.ok) {
      throw new Error(`anthropic completion failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as AnthropicMessagesResponse;
    const text = body.content.find((block) => block.type === "text")?.text ?? "";
    return {
      model: request.model,
      content: text,
      usage: {
        promptTokens: body.usage.input_tokens,
        completionTokens: body.usage.output_tokens,
        totalTokens: body.usage.input_tokens + body.usage.output_tokens,
      },
    };
  }
}

function toAnthropicMessage(message: ChatMessage): { role: "user" | "assistant"; content: string | AnthropicContentBlock[] } {
  const role = message.role === "assistant" ? "assistant" : "user";
  if (typeof message.content === "string") return { role, content: message.content };
  return { role, content: message.content.map(toAnthropicContentBlock) };
}

function toAnthropicContentBlock(part: ContentPart): AnthropicContentBlock {
  if (part.type === "text") return { type: "text", text: part.text };
  return { type: "image", source: { type: "base64", media_type: part.mediaType, data: part.data } };
}

/** Anthropic's top-level `system` param is a plain string — a multimodal system message (unusual) is flattened to its text parts, images dropped. */
function contentToPlainText(content: string | ContentPart[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}
