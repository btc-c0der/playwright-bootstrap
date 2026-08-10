import { JsonlAppendLog } from "../internal/jsonl-append-log.js";
import type { LogQueryOptions, LogRecord, LogStore } from "./types.js";

const DEFAULT_PATH = ".qaf/platform-logs.jsonl";

/** Default `LogStore` — append-only JSONL, same convention as this package's other `Local*Store`s. */
export class LocalJsonlLogStore implements LogStore {
  private readonly log: JsonlAppendLog<LogRecord>;

  constructor(filePath: string = DEFAULT_PATH) {
    this.log = new JsonlAppendLog(filePath);
  }

  async append(record: LogRecord): Promise<void> {
    await this.log.append(record);
  }

  async query(options: LogQueryOptions = {}): Promise<LogRecord[]> {
    const all = await this.log.readAll();
    const filtered = all.filter(
      (r) =>
        (options.runId === undefined || r.runId === options.runId) &&
        (options.level === undefined || r.level === options.level) &&
        (options.source === undefined || r.source === options.source),
    );
    return options.limit ? filtered.slice(-options.limit) : filtered;
  }
}
