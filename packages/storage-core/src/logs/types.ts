export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord {
  id: string;
  runId?: string;
  level: LogLevel;
  message: string;
  /** e.g. the orchestrator stage or engine that emitted this — `"impact-analysis"`, `"llm-gateway"`. */
  source?: string;
  fields?: Record<string, unknown>;
  timestamp: string;
}

export interface LogQueryOptions {
  runId?: string;
  level?: LogLevel;
  source?: string;
  limit?: number;
}

/**
 * Layer 4's storage for the platform service's own structured logs —
 * distinct from `@qaf/core`'s per-test `Logger` fixture (that's scoped to
 * one Playwright test run); this is the orchestrator/gateway-api process's
 * own log persistence, queryable per run for the health-audit skill and for
 * support/debugging.
 */
export interface LogStore {
  append(record: LogRecord): Promise<void>;
  query(options?: LogQueryOptions): Promise<LogRecord[]>;
}
