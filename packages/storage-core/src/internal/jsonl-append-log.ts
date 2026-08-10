import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Shared append-only JSONL primitive behind every `Local*Store` in this
 * package — same convention as `@qaf/core`'s `test-run-history.jsonl` and
 * `@qaf/rag-core`'s vector index files: one JSON object per line, appended
 * (never rewritten), safe to tail/grep in CI. Each `Local*Store` only adds
 * its own filtering on top of `readAll()`.
 */
export class JsonlAppendLog<T> {
  constructor(private readonly filePath: string) {}

  async append(record: T): Promise<void> {
    const dir = path.dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, "utf-8");
  }

  async readAll(): Promise<T[]> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      return raw
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as T);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
}
