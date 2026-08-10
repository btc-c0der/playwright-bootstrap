import type { SqlExecutor } from "../sql/types.js";
import type { TokenUsageQueryOptions, TokenUsageRecord, TokenUsageStore, TokenUsageSummary } from "./types.js";

const DEFAULT_TABLE = "qaf_token_usage";

/** Production `TokenUsageStore` — plain SQL over an injected `SqlExecutor`. Expects a table matching this package's `schema.sql`. */
export class PostgresTokenUsageStore implements TokenUsageStore {
  constructor(
    private readonly sql: SqlExecutor,
    private readonly table: string = DEFAULT_TABLE,
  ) {}

  async append(record: TokenUsageRecord): Promise<void> {
    await this.sql.query(
      `INSERT INTO ${this.table}
         (id, run_id, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, requested_by, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [
        record.id,
        record.runId ?? null,
        record.model,
        record.promptTokens,
        record.completionTokens,
        record.totalTokens,
        record.estimatedCostUsd ?? null,
        record.requestedBy ?? null,
        record.timestamp,
      ],
    );
  }

  async query(options: TokenUsageQueryOptions = {}): Promise<TokenUsageRecord[]> {
    const { where, params } = buildWhere(options);
    const limitClause = options.limit ? `LIMIT ${Number(options.limit)}` : "";
    const rows = await this.sql.query(
      `SELECT id, run_id, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, requested_by, timestamp
       FROM ${this.table} ${where}
       ORDER BY timestamp DESC ${limitClause}`,
      params,
    );
    return rows.map(toTokenUsageRecord);
  }

  async summarize(options: TokenUsageQueryOptions = {}): Promise<TokenUsageSummary> {
    const { where, params } = buildWhere(options);
    const rows = await this.sql.query(
      `SELECT COALESCE(SUM(total_tokens), 0) AS total_tokens,
              COALESCE(SUM(estimated_cost_usd), 0) AS estimated_cost_usd,
              COUNT(*) AS call_count
       FROM ${this.table} ${where}`,
      params,
    );
    const row = rows[0] ?? {};
    return {
      totalTokens: Number(row.total_tokens ?? 0),
      estimatedCostUsd: Number(row.estimated_cost_usd ?? 0),
      callCount: Number(row.call_count ?? 0),
    };
  }
}

function buildWhere(options: TokenUsageQueryOptions): { where: string; params: unknown[] } {
  const params: unknown[] = [];
  const clauses: string[] = [];
  if (options.runId !== undefined) {
    params.push(options.runId);
    clauses.push(`run_id = $${params.length}`);
  }
  if (options.model !== undefined) {
    params.push(options.model);
    clauses.push(`model = $${params.length}`);
  }
  if (options.requestedBy !== undefined) {
    params.push(options.requestedBy);
    clauses.push(`requested_by = $${params.length}`);
  }
  if (options.since !== undefined) {
    params.push(options.since);
    clauses.push(`timestamp >= $${params.length}`);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

function toTokenUsageRecord(row: Record<string, unknown>): TokenUsageRecord {
  return {
    id: row.id as string,
    runId: (row.run_id as string | null) ?? undefined,
    model: row.model as string,
    promptTokens: Number(row.prompt_tokens),
    completionTokens: Number(row.completion_tokens),
    totalTokens: Number(row.total_tokens),
    estimatedCostUsd: row.estimated_cost_usd === null ? undefined : Number(row.estimated_cost_usd),
    requestedBy: (row.requested_by as string | null) ?? undefined,
    timestamp: row.timestamp as string,
  };
}
