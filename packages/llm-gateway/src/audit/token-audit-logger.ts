import { randomUUID } from "node:crypto";
import type { EmbeddingGateway, EmbeddingRequest, EmbeddingResponse } from "../embedding/types.js";
import type { CompletionRequest, CompletionResponse, LLMGateway } from "../gateway/types.js";

export interface TokenUsageSinkRecord {
  id: string;
  runId?: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number;
  requestedBy?: string;
  timestamp: string;
}

/** Structurally compatible with `@qaf/storage-core`'s `TokenUsageStore.append` — pass a real one in, no dependency on that package required here. */
export interface TokenUsageSink {
  append(record: TokenUsageSinkRecord): Promise<void>;
}

export type CostTable = Record<string, { inputPer1k: number; outputPer1k: number }>;

export interface TokenAuditLoggerOptions {
  sink: TokenUsageSink;
  /** Per-model USD/1k-token rates, keyed by the same `"<prefix>:<model>"` string used elsewhere — omit an entry to leave `estimatedCostUsd` unset for that model rather than guess. For an embedding model, only `inputPer1k` is ever used (there's no completion half). */
  costTable?: CostTable;
  idFactory?: () => string;
  clock?: () => string;
}

/**
 * Wraps an `LLMGateway` so every completion is recorded before the result is
 * returned to the caller — Layer 5's Token Audit Logger requirement.
 * Composed with `PiiRedactionMiddleware` by `createGatewayClient` (see
 * `../gateway-client.ts`); this class alone only audits, it doesn't redact.
 * `EmbeddingAuditLogger` below is the same pattern for `EmbeddingGateway` —
 * both write to the same `TokenUsageSink` shape, which is how one
 * `TokenUsageStore` ends up holding every pillar's LLM *and* embedding spend
 * in one place.
 */
export class TokenAuditLogger implements LLMGateway {
  constructor(
    private readonly inner: LLMGateway,
    private readonly options: TokenAuditLoggerOptions,
  ) {}

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const response = await this.inner.complete(request);
    const rate = this.options.costTable?.[request.model];
    const estimatedCostUsd = rate
      ? (response.usage.promptTokens / 1000) * rate.inputPer1k +
        (response.usage.completionTokens / 1000) * rate.outputPer1k
      : undefined;

    await this.options.sink.append({
      id: (this.options.idFactory ?? randomUUID)(),
      runId: request.runId,
      model: response.model,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      totalTokens: response.usage.totalTokens,
      estimatedCostUsd,
      requestedBy: request.requestedBy,
      timestamp: (this.options.clock ?? defaultClock)(),
    });

    return response;
  }
}

/** `TokenAuditLogger`'s counterpart for `EmbeddingGateway` — `completionTokens` is always `0` (embeddings have no completion half), so a query against the shared `TokenUsageStore` can still tell the two kinds of call apart. */
export class EmbeddingAuditLogger implements EmbeddingGateway {
  constructor(
    private readonly inner: EmbeddingGateway,
    private readonly options: TokenAuditLoggerOptions,
  ) {}

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const response = await this.inner.embed(request);
    const rate = this.options.costTable?.[request.model];
    const estimatedCostUsd = rate ? (response.usage.promptTokens / 1000) * rate.inputPer1k : undefined;

    await this.options.sink.append({
      id: (this.options.idFactory ?? randomUUID)(),
      runId: request.runId,
      model: response.model,
      promptTokens: response.usage.promptTokens,
      completionTokens: 0,
      totalTokens: response.usage.totalTokens,
      estimatedCostUsd,
      requestedBy: request.requestedBy,
      timestamp: (this.options.clock ?? defaultClock)(),
    });

    return response;
  }
}

function defaultClock(): string {
  return new Date().toISOString();
}
