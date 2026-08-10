import type { SqlExecutor } from "../sql/types.js";
import type { ExecutionQueryOptions, ExecutionRecord, ExecutionStatus, ExecutionStore } from "./types.js";

const DEFAULT_TABLE = "qaf_execution_history";

/**
 * Production `ExecutionStore` — plain SQL over an injected `SqlExecutor`,
 * same "inject your own driver" posture as `@qaf/graph-rag`'s
 * `CypherDriver`. No `pg` dependency here — see `sql/types.ts`'s
 * `createPgSqlExecutor`. Expects a table matching this package's
 * `schema.sql`.
 */
export class PostgresExecutionStore implements ExecutionStore {
  constructor(
    private readonly sql: SqlExecutor,
    private readonly table: string = DEFAULT_TABLE,
  ) {}

  async append(record: ExecutionRecord): Promise<void> {
    await this.sql.query(
      `INSERT INTO ${this.table} (id, run_id, stage, status, started_at, finished_at, detail, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         finished_at = EXCLUDED.finished_at,
         detail = EXCLUDED.detail,
         error = EXCLUDED.error`,
      [
        record.id,
        record.runId,
        record.stage,
        record.status,
        record.startedAt,
        record.finishedAt ?? null,
        record.detail ? JSON.stringify(record.detail) : null,
        record.error ?? null,
      ],
    );
  }

  async query(options: ExecutionQueryOptions = {}): Promise<ExecutionRecord[]> {
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (options.runId !== undefined) {
      params.push(options.runId);
      clauses.push(`run_id = $${params.length}`);
    }
    if (options.stage !== undefined) {
      params.push(options.stage);
      clauses.push(`stage = $${params.length}`);
    }
    if (options.status !== undefined) {
      params.push(options.status);
      clauses.push(`status = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limitClause = options.limit ? `LIMIT ${Number(options.limit)}` : "";

    const rows = await this.sql.query(
      `SELECT id, run_id, stage, status, started_at, finished_at, detail, error
       FROM ${this.table} ${where}
       ORDER BY started_at DESC ${limitClause}`,
      params,
    );
    return rows.map(toExecutionRecord);
  }
}

function toExecutionRecord(row: Record<string, unknown>): ExecutionRecord {
  return {
    id: row.id as string,
    runId: row.run_id as string,
    stage: row.stage as string,
    status: row.status as ExecutionStatus,
    startedAt: row.started_at as string,
    finishedAt: (row.finished_at as string | null) ?? undefined,
    detail: (row.detail as Record<string, unknown> | null) ?? undefined,
    error: (row.error as string | null) ?? undefined,
  };
}
