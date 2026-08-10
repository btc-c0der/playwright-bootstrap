import { EmbeddingAuditLogger, TokenAuditLogger } from "./audit/token-audit-logger.js";
import type { TokenAuditLoggerOptions } from "./audit/token-audit-logger.js";
import { EmbeddingGatewayRouter } from "./embedding/router.js";
import type { EmbeddingGateway, EmbeddingGatewayProvider } from "./embedding/types.js";
import { LLMGatewayRouter } from "./gateway/router.js";
import type { LLMGateway, LLMGatewayProvider } from "./gateway/types.js";
import { EmbeddingPiiRedactionMiddleware, PiiRedactionMiddleware } from "./redaction/pii-redaction.js";
import type { PiiRedactionOptions } from "./redaction/pii-redaction.js";

export interface CreateGatewayClientOptions {
  providers: LLMGatewayProvider[];
  audit: TokenAuditLoggerOptions;
  redaction?: PiiRedactionOptions;
  /** Omit if no pillar needs embeddings through this client — `embeddings.embed()` then throws on first use (see `EmbeddingGatewayRouter`). */
  embeddingProviders?: EmbeddingGatewayProvider[];
  /** Defaults to `audit` — i.e. completions and embeddings share one `TokenUsageSink` by default, which is the whole point: one audit trail across every pillar. Override only if you deliberately want them split. */
  embeddingAudit?: TokenAuditLoggerOptions;
  /** Defaults to `redaction`. */
  embeddingRedaction?: PiiRedactionOptions;
}

export interface GatewayClient {
  llm: LLMGateway;
  embeddings: EmbeddingGateway;
}

/**
 * Layer 5's Foundation & Security Gateway, assembled: every request is
 * PII-redacted, then routed to the right provider, then audited — in that
 * call order, so (a) a redacted payload is what actually leaves the process
 * boundary and (b) the audit trail records what the provider was *actually*
 * sent, not the unredacted input. This is the one function every engine
 * adapter should call through instead of constructing `LLMGatewayRouter`/
 * `EmbeddingGatewayRouter` directly — see `@qaf/engine-contracts`'s
 * `GatewayLLMProvider`/`GatewayEmbeddingProvider`/`GatewayAiRepairProvider`,
 * which is what actually plugs a `GatewayClient` into each pillar's own
 * provider injection point.
 */
export function createGatewayClient(options: CreateGatewayClientOptions): GatewayClient {
  const llmRouter = new LLMGatewayRouter(options.providers);
  const llmAudited = new TokenAuditLogger(llmRouter, options.audit);
  const llm = new PiiRedactionMiddleware(llmAudited, options.redaction);

  const embeddingRouter = new EmbeddingGatewayRouter(options.embeddingProviders ?? []);
  const embeddingAudited = new EmbeddingAuditLogger(embeddingRouter, options.embeddingAudit ?? options.audit);
  const embeddings = new EmbeddingPiiRedactionMiddleware(embeddingAudited, options.embeddingRedaction ?? options.redaction);

  return { llm, embeddings };
}
