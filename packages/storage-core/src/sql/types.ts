/**
 * The minimal shape this package's Postgres-backed adapters need from a
 * driver — deliberately loose enough that `node-postgres`'s `Pool`/`Client`
 * (`.query(text, params)` returning `{ rows }`) satisfies it after the
 * one-line wrap below. No `pg` dependency added here — same opt-in posture
 * as `@qaf/graph-rag`'s `CypherDriver`.
 */
export interface SqlExecutor {
  query(text: string, params?: unknown[]): Promise<Array<Record<string, unknown>>>;
}

/** The shape a real `pg.Pool`/`pg.Client` already has. */
export interface PgPoolLike {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** One-line wrap wherever you have a real `pg.Pool`: `createPgSqlExecutor(pool)`. */
export function createPgSqlExecutor(pool: PgPoolLike): SqlExecutor {
  return {
    async query(text, params) {
      const result = await pool.query(text, params);
      return result.rows;
    },
  };
}
