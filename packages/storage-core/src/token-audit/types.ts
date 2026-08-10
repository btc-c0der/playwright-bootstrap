export interface TokenUsageRecord {
  id: string;
  runId?: string;
  /** Which model handled the call, e.g. `"openai:gpt-4o"`, `"anthropic:claude-sonnet-5"`, `"ollama:llama3"` — matches `@qaf/llm-gateway`'s `LLMProvider.id`. */
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** USD, only set when a per-model rate is configured — omitted rather than guessed. */
  estimatedCostUsd?: number;
  /** Which engine/caller made the request, e.g. `"synth-data-engine"`, `"self-healing-engine"` — the audit skill's "spend by engine" breakdown groups on this. */
  requestedBy?: string;
  timestamp: string;
}

export interface TokenUsageQueryOptions {
  runId?: string;
  model?: string;
  requestedBy?: string;
  since?: string;
  limit?: number;
}

export interface TokenUsageSummary {
  totalTokens: number;
  estimatedCostUsd: number;
  callCount: number;
}

/**
 * Layer 4's storage for Layer 5's token audit trail — `@qaf/llm-gateway`'s
 * `TokenAuditLogger` writes here on every LLM call this platform makes,
 * across every engine, so spend and usage are reconstructable per
 * run/model/engine.
 */
export interface TokenUsageStore {
  append(record: TokenUsageRecord): Promise<void>;
  query(options?: TokenUsageQueryOptions): Promise<TokenUsageRecord[]>;
  /** Aggregate over whatever `query(options)` would return — cheaper than summing the full array yourself when the backend can aggregate server-side (see `PostgresTokenUsageStore`). */
  summarize(options?: TokenUsageQueryOptions): Promise<TokenUsageSummary>;
}
