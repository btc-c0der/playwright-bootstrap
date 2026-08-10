import { appendFile } from "node:fs/promises";
import path from "node:path";
import type {
  FullConfig,
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import type { FailureRecord } from "../failure-clustering/types.js";

/**
 * Appends one JSONL `FailureRecord` per *failed* test result to
 * `ci-failures.jsonl` — the raw feed `qaf-rag-cluster` reads post-run to
 * cluster this run's failures against history. Same shape as `@qaf/core`'s
 * `HistoryReporter`: registered alongside the default reporters in
 * `playwright.config.ts`, never affects pass/fail, only logging. Unlike
 * `HistoryReporter` (which records every result), this only records
 * failures — passes carry no root-cause signal.
 */
export default class FailureReporter implements Reporter {
  private readonly path: string;
  private readonly pending: Promise<void>[] = [];
  private rootDir = "";

  constructor(options: { path?: string } = {}) {
    this.path = options.path ?? process.env.QAF_RAG_CI_FAILURES_PATH ?? "ci-failures.jsonl";
  }

  onBegin(config: FullConfig): void {
    this.rootDir = config.rootDir;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status !== "failed" && result.status !== "timedOut") return;

    const file = this.rootDir
      ? path.relative(this.rootDir, test.location.file)
      : test.location.file;
    const project = test.parent.project()?.name ?? "unknown";
    const titlePath = test.titlePath().filter((segment) => segment !== file);
    const timestamp = new Date().toISOString();

    const record: FailureRecord = {
      id: `${file}::${project}::${titlePath.join(" > ")}@${timestamp}`,
      testId: `${file}::${project}::${titlePath.join(" > ")}`,
      file,
      project,
      errorMessage:
        result.errors.map((e) => e.message ?? "").join("\n") || "(no error message captured)",
      stackTrace: result.errors.map((e) => e.stack ?? "").join("\n"),
      logExcerpt: result.stdout
        .map((chunk) => chunk.toString())
        .join("\n")
        .slice(-2000),
      commitSha: process.env.GITHUB_SHA ?? process.env.CI_COMMIT_SHA,
      timestamp,
    };
    this.pending.push(appendFile(this.path, JSON.stringify(record) + "\n", "utf-8"));
  }

  async onEnd(_result: FullResult): Promise<void> {
    await Promise.allSettled(this.pending);
  }
}
