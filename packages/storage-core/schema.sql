-- Layer 4 relational schema for the AI-Driven QA Platform.
-- Run once against the `qaf` Postgres database (see docker-compose.yml's
-- `postgres` service). All three tables back an append-audit workload
-- (INSERT-heavy, occasional UPDATE-on-conflict for execution history) — no
-- foreign keys between them by design, since `run_id` is a loose correlation
-- id shared across engines/services, not a referential-integrity boundary.

CREATE TABLE IF NOT EXISTS qaf_execution_history (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  detail JSONB,
  error TEXT
);
CREATE INDEX IF NOT EXISTS qaf_execution_history_run_id_idx ON qaf_execution_history (run_id);
CREATE INDEX IF NOT EXISTS qaf_execution_history_stage_idx ON qaf_execution_history (stage);

CREATE TABLE IF NOT EXISTS qaf_token_usage (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  estimated_cost_usd NUMERIC(12, 6),
  requested_by TEXT,
  timestamp TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS qaf_token_usage_run_id_idx ON qaf_token_usage (run_id);
CREATE INDEX IF NOT EXISTS qaf_token_usage_model_idx ON qaf_token_usage (model);

CREATE TABLE IF NOT EXISTS qaf_platform_logs (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  source TEXT,
  fields JSONB,
  timestamp TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS qaf_platform_logs_run_id_idx ON qaf_platform_logs (run_id);

-- Optional — only needed if you're using PgVectorStore instead of a
-- dedicated Qdrant/Chroma deployment. Replace <dimensions> with your
-- EmbeddingProvider's `.dimensions` (e.g. 1536 for text-embedding-3-small).
-- CREATE EXTENSION IF NOT EXISTS vector;
-- CREATE TABLE IF NOT EXISTS qaf_vectors (
--   id TEXT PRIMARY KEY,
--   namespace TEXT NOT NULL,
--   vector vector(<dimensions>) NOT NULL,
--   metadata JSONB,
--   content_hash TEXT,
--   embedding_id TEXT,
--   indexed_at TIMESTAMPTZ
-- );
-- CREATE INDEX IF NOT EXISTS qaf_vectors_namespace_idx ON qaf_vectors (namespace);
