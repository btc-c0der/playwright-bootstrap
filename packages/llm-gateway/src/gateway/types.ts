/** A text part of a multimodal message. */
export interface TextContentPart {
  type: "text";
  text: string;
}

/** An inline image part — `data` is base64-encoded, no `data:` URI prefix. Only vision-capable models (see each `LLMGatewayProvider`) do anything useful with these. */
export interface ImageContentPart {
  type: "image";
  mediaType: string;
  data: string;
}

export type ContentPart = TextContentPart | ImageContentPart;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  /** A plain string for the common text-only case, or content parts for a multimodal message (e.g. `@qaf/engine-contracts`'s `GatewayAiRepairProvider`, which attaches a screenshot). */
  content: string | ContentPart[];
}

export interface CompletionRequest {
  /** `"<prefix>:<model-name>"`, e.g. `"openai:gpt-4o"`, `"anthropic:claude-sonnet-5"`, `"ollama:llama3"` — same shape as every other provider `.id` in this monorepo (`@qaf/synth-data`'s `LLMProvider.id`, `@qaf/rag-core`'s `EmbeddingProvider.id`). */
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  /** Which engine/caller is making this request, e.g. `"synth-data-engine"` — flows through to the token-audit record. */
  requestedBy?: string;
  /** Correlates this call to an orchestrator run — flows through to the token-audit record. */
  runId?: string;
}

export interface CompletionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CompletionResponse {
  model: string;
  content: string;
  usage: CompletionUsage;
}

/**
 * One concrete backend's shape — an `LLMGatewayProvider` speaks to exactly
 * one API family (OpenAI-compatible, Anthropic, ...). `LLMGatewayRouter`
 * dispatches a `CompletionRequest` to whichever provider owns its model's
 * prefix; callers never talk to a provider directly.
 */
export interface LLMGatewayProvider {
  /** The prefix this provider owns, e.g. `"openai"`, `"anthropic"`, `"ollama"`, `"litellm"`. */
  readonly prefix: string;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
}

/** The seam every engine/orchestrator node calls through — Layer 5's Foundation & Security Gateway. Implemented by `LLMGatewayRouter` and by the `TokenAuditLogger`/`PiiRedactionMiddleware` wrappers `createGatewayClient` composes around it. */
export interface LLMGateway {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
}
