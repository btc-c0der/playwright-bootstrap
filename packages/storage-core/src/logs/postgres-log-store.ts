import type { SqlExecutor } from "../sql/types.js";
import type { LogLevel, LogQueryOptions, LogRecord, LogStore } from "./types.js";

const DEFAULT_TABLE = "qaf_platform_logs";

/** Production `LogStore` — plain SQL over an injected `SqlExecutor`. Expects a table matching this package's `schema.sql`. */
export class PostgresLogStore implements LogStore {
  constructor(
    private readonly sql: SqlExecutor,
    private readonly table: string = DEFAULT_TABLE,
  ) {}

  async append(record: LogRecord): Promise<void> {
    await this.sql.query(
      `INSERT INTO ${this.table} (id, run_id, level, message, source, fields, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        record.id,
        record.runId ?? null,
        record.level,
        record.message,
        record.source ?? null,
        record.fields ? JSON.stringify(record.fields) : null,
        record.timestamp,
      ],
    );
  }

  async query(options: LogQueryOptions = {}): Promise<LogRecord[]> {
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (options.runId !== undefined) {
      params.push(options.runId);
      clauses.push(`run_id = $${params.length}`);
    }
    if (options.level !== undefined) {
      params.push(options.level);
      clauses.push(`level = $${params.length}`);
    }
    if (options.source !== undefined) {
      params.push(options.source);
      clauses.push(`source = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limitClause = options.limit ? `LIMIT ${Number(options.limit)}` : "";

    const rows = await this.sql.query(
      `SELECT id, run_id, level, message, source, fields, timestamp FROM ${this.table} ${where} ORDER BY timestamp DESC ${limitClause}`,
      params,
    );
    return rows.map(toLogRecord);
  }
}

function toLogRecord(row: Record<string, unknown>): LogRecord {
  return {
    id: row.id as string,
    runId: (row.run_id as string | null) ?? undefined,
    level: row.level as LogLevel,
    message: row.message as string,
    source: (row.source as string | null) ?? undefined,
    fields: (row.fields as Record<string, unknown> | null) ?? undefined,
    timestamp: row.timestamp as string,
  };
}
