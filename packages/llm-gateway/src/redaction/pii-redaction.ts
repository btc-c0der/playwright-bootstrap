import type { EmbeddingGateway, EmbeddingRequest, EmbeddingResponse } from "../embedding/types.js";
import type { ChatMessage, CompletionRequest, CompletionResponse, ContentPart, LLMGateway } from "../gateway/types.js";

export type PiiCategory = "email" | "phone" | "ssn" | "creditCard" | "ipv4";

export interface RedactionMatch {
  category: PiiCategory;
  original: string;
}

/** The minimal shape both `CompletionRequest` and `EmbeddingRequest` already have — `onRedacted` takes this instead of either concrete request type so one callback works for both gateways. */
export interface RedactionContext {
  model: string;
  requestedBy?: string;
  runId?: string;
}

export interface PiiRedactionOptions {
  categories?: PiiCategory[];
  /** Called with everything redacted from one request — wire this to `@qaf/storage-core`'s `LogStore` to keep an auditable "what got stripped" trail without ever persisting the raw value itself. */
  onRedacted?: (matches: RedactionMatch[], context: RedactionContext) => void;
}

const PATTERNS: Record<PiiCategory, RegExp> = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  creditCard: /\b(?:\d[ -]?){13,16}\b/g,
  ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
};

const DEFAULT_CATEGORIES: PiiCategory[] = ["email", "phone", "ssn", "creditCard", "ipv4"];

/** Shared by both middlewares below — redacts plain text against the configured categories, recording every match. */
function redactText(text: string, categories: PiiCategory[], matches: RedactionMatch[]): string {
  let content = text;
  for (const category of categories) {
    const pattern = PATTERNS[category];
    content = content.replace(pattern, (matched) => {
      matches.push({ category, original: matched });
      return `[REDACTED:${category.toUpperCase()}]`;
    });
  }
  return content;
}

function redactMessageContent(content: string | ContentPart[], categories: PiiCategory[], matches: RedactionMatch[]): string | ContentPart[] {
  if (typeof content === "string") return redactText(content, categories, matches);
  return content.map((part) => (part.type === "text" ? { ...part, text: redactText(part.text, categories, matches) } : part));
}

/**
 * Redacts PII from every outbound message *before* it reaches an
 * `LLMGateway` provider — Layer 5's "PII Redaction Middleware ... before any
 * payload leaves the system boundary" requirement. Regex-based on purpose
 * (no external DLP service dependency); these are deliberately conservative
 * patterns, not a certified PII detector — tune `categories`/the exported
 * `PATTERNS` shape per your actual data before relying on this alone. Only
 * text content parts are redacted — an attached image (see `ContentPart`)
 * passes through untouched.
 */
export class PiiRedactionMiddleware implements LLMGateway {
  private readonly categories: PiiCategory[];

  constructor(
    private readonly inner: LLMGateway,
    private readonly options: PiiRedactionOptions = {},
  ) {
    this.categories = options.categories ?? DEFAULT_CATEGORIES;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const matches: RedactionMatch[] = [];
    const messages = request.messages.map((message) => this.redactMessage(message, matches));
    if (matches.length > 0) this.options.onRedacted?.(matches, request);
    return this.inner.complete({ ...request, messages });
  }

  private redactMessage(message: ChatMessage, matches: RedactionMatch[]): ChatMessage {
    return { ...message, content: redactMessageContent(message.content, this.categories, matches) };
  }
}

/** `PiiRedactionMiddleware`'s counterpart for `EmbeddingGateway` — redacts every outbound text before it's embedded, same posture as redacting before a completion. */
export class EmbeddingPiiRedactionMiddleware implements EmbeddingGateway {
  private readonly categories: PiiCategory[];

  constructor(
    private readonly inner: EmbeddingGateway,
    private readonly options: PiiRedactionOptions = {},
  ) {
    this.categories = options.categories ?? DEFAULT_CATEGORIES;
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const matches: RedactionMatch[] = [];
    const texts = request.texts.map((text) => redactText(text, this.categories, matches));
    if (matches.length > 0) this.options.onRedacted?.(matches, request);
    return this.inner.embed({ ...request, texts });
  }
}
