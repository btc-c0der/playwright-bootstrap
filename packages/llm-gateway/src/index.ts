export type {
  ChatMessage,
  CompletionRequest,
  CompletionResponse,
  CompletionUsage,
  ContentPart,
  ImageContentPart,
  LLMGateway,
  LLMGatewayProvider,
  TextContentPart,
} from "./gateway/types.js";
export { LLMGatewayRouter } from "./gateway/router.js";

export type { EmbeddingGateway, EmbeddingGatewayProvider, EmbeddingRequest, EmbeddingResponse, EmbeddingUsage } from "./embedding/types.js";
export { EmbeddingGatewayRouter } from "./embedding/router.js";

export { NoopLLMGatewayProvider } from "./providers/noop-provider.js";
export { NoopEmbeddingGatewayProvider } from "./providers/noop-embedding-provider.js";
export { OpenAiCompatibleProvider } from "./providers/openai-compatible-provider.js";
export type { OpenAiCompatibleProviderOptions } from "./providers/openai-compatible-provider.js";
export { OpenAiCompatibleEmbeddingProvider } from "./providers/openai-compatible-embedding-provider.js";
export type { OpenAiCompatibleEmbeddingProviderOptions } from "./providers/openai-compatible-embedding-provider.js";
export { AnthropicProvider } from "./providers/anthropic-provider.js";
export type { AnthropicProviderOptions } from "./providers/anthropic-provider.js";

export { EmbeddingAuditLogger, TokenAuditLogger } from "./audit/token-audit-logger.js";
export type {
  CostTable,
  TokenAuditLoggerOptions,
  TokenUsageSink,
  TokenUsageSinkRecord,
} from "./audit/token-audit-logger.js";

export { EmbeddingPiiRedactionMiddleware, PiiRedactionMiddleware } from "./redaction/pii-redaction.js";
export type { PiiCategory, PiiRedactionOptions, RedactionContext, RedactionMatch } from "./redaction/pii-redaction.js";

export { createGatewayClient } from "./gateway-client.js";
export type { CreateGatewayClientOptions, GatewayClient } from "./gateway-client.js";
