import { JsonlAppendLog } from "../internal/jsonl-append-log.js";
import type { ExecutionQueryOptions, ExecutionRecord, ExecutionStore } from "./types.js";

const DEFAULT_PATH = ".qaf/execution-history.jsonl";

/**
 * Default `ExecutionStore` — one JSONL line per `append()` call (a stage's
 * "started" and "succeeded"/"failed" calls are both appended rather than
 * updated in place; `query()` folds them by `id`, keeping the latest). Fine
 * at single-team scale, same posture as `@qaf/rag-core`'s
 * `LocalJsonlVectorStore` — swap in `PostgresExecutionStore` once/if history
 * needs to outlive the local filesystem or be queried across machines.
 */
export class LocalJsonlExecutionStore implements ExecutionStore {
  private readonly log: JsonlAppendLog<ExecutionRecord>;

  constructor(filePath: string = DEFAULT_PATH) {
    this.log = new JsonlAppendLog(filePath);
  }

  async append(record: ExecutionRecord): Promise<void> {
    await this.log.append(record);
  }

  async query(options: ExecutionQueryOptions = {}): Promise<ExecutionRecord[]> {
    const all = await this.log.readAll();
    const latestById = new Map<string, ExecutionRecord>();
    for (const record of all) latestById.set(record.id, record);

    const filtered = [...latestById.values()].filter(
      (r) =>
        (options.runId === undefined || r.runId === options.runId) &&
        (options.stage === undefined || r.stage === options.stage) &&
        (options.status === undefined || r.status === options.status),
    );
    return options.limit ? filtered.slice(-options.limit) : filtered;
  }
}
