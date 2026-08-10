import { appendFile } from "node:fs/promises";
import path from "node:path";
import type { FullConfig, FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { buildEntryId } from "./manifest.js";

export interface TestRunRecord {
  id: string;
  file: string;
  project: string;
  status: TestResult["status"];
  retry: number;
  durationMs: number;
  timestamp: string;
}

/**
 * Appends one JSONL record per test result to `test-run-history.jsonl`. This is
 * the raw feed the nightly `quarantine-audit.yml` job aggregates (trailing 20
 * runs per test id) to auto-detect new flakes, and that `test-duration-history.json`
 * (shard-count planning) is derived from. Registered in playwright.config.ts
 * alongside the default reporters — it never affects pass/fail, only logging.
 */
export default class HistoryReporter implements Reporter {
  private readonly path: string;
  private readonly pending: Promise<void>[] = [];
  private rootDir = "";

  constructor(options: { path?: string } = {}) {
    this.path = options.path ?? process.env.QAF_TEST_HISTORY_PATH ?? "test-run-history.jsonl";
  }

  onBegin(config: FullConfig): void {
    // Matches Playwright's own `--list --reporter=json` file convention (relative
    // to config.rootDir, i.e. the top-level testDir) — see bin/qaf-check-quarantine.ts's
    // discoverTests(), which must produce identical `file`/`id` values for the
    // sync-check to compare tag vs. manifest without false mismatches.
    this.rootDir = config.rootDir;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const file = this.rootDir ? path.relative(this.rootDir, test.location.file) : test.location.file;
    const record: TestRunRecord = {
      id: buildEntryId({
        file,
        project: test.parent.project()?.name ?? "unknown",
        titlePath: test.titlePath(),
      }),
      file,
      project: test.parent.project()?.name ?? "unknown",
      status: result.status,
      retry: result.retry,
      durationMs: result.duration,
      timestamp: new Date().toISOString(),
    };
    this.pending.push(appendFile(this.path, JSON.stringify(record) + "\n", "utf-8"));
  }

  async onEnd(_result: FullResult): Promise<void> {
    await Promise.allSettled(this.pending);
  }
}
