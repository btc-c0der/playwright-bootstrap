import { JsonlAppendLog } from "../internal/jsonl-append-log.js";
import type { TokenUsageQueryOptions, TokenUsageRecord, TokenUsageStore, TokenUsageSummary } from "./types.js";

const DEFAULT_PATH = ".qaf/token-usage.jsonl";

/** Default `TokenUsageStore` — append-only JSONL, same convention as `@qaf/core`'s `test-run-history.jsonl`. */
export class LocalJsonlTokenUsageStore implements TokenUsageStore {
  private readonly log: JsonlAppendLog<TokenUsageRecord>;

  constructor(filePath: string = DEFAULT_PATH) {
    this.log = new JsonlAppendLog(filePath);
  }

  async append(record: TokenUsageRecord): Promise<void> {
    await this.log.append(record);
  }

  async query(options: TokenUsageQueryOptions = {}): Promise<TokenUsageRecord[]> {
    const all = await this.log.readAll();
    const filtered = all.filter(
      (r) =>
        (options.runId === undefined || r.runId === options.runId) &&
        (options.model === undefined || r.model === options.model) &&
        (options.requestedBy === undefined || r.requestedBy === options.requestedBy) &&
        (options.since === undefined || r.timestamp >= options.since),
    );
    return options.limit ? filtered.slice(-options.limit) : filtered;
  }

  async summarize(options: TokenUsageQueryOptions = {}): Promise<TokenUsageSummary> {
    const rows = await this.query(options);
    return rows.reduce<TokenUsageSummary>(
      (acc, row) => ({
        totalTokens: acc.totalTokens + row.totalTokens,
        estimatedCostUsd: acc.estimatedCostUsd + (row.estimatedCostUsd ?? 0),
        callCount: acc.callCount + 1,
      }),
      { totalTokens: 0, estimatedCostUsd: 0, callCount: 0 },
    );
  }
}
