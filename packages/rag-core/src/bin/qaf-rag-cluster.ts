#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { clusterFailure, type ClusterResult } from "../failure-clustering/cluster.js";
import { LocalJsonlVectorStore } from "../vector-store/local-jsonl-store.js";
import type { FailureRecord } from "../failure-clustering/types.js";
import { loadProviderFromEnv } from "./load-provider.js";

interface Cursor {
  /** Lines of `ci-failures.jsonl` already clustered — avoids re-embedding the same occurrence on a re-run. */
  processedLines: number;
}

/**
 * Reads whatever `FailureReporter` appended to `ci-failures.jsonl` since the
 * last run, clusters each new failure against history, and emits a GitHub
 * Actions annotation per failure — same `::warning`/`::notice` mechanism as
 * `@qaf/core`'s `quarantine/annotate.ts`, advisory only (never fails CI on a
 * cluster match, see docs/rag-coverage-plan.md's Risks).
 */
async function main(): Promise<void> {
  if (process.env.QAF_RAG_ENABLED !== "true") {
    process.stdout.write(
      'qaf-rag-cluster: QAF_RAG_ENABLED is not "true" — skipping. RAG clustering is opt-in, see docs/rag-coverage.md.\n',
    );
    return;
  }

  const failuresPath = process.env.QAF_RAG_CI_FAILURES_PATH ?? "ci-failures.jsonl";
  const cursorPath =
    process.env.QAF_RAG_CLUSTER_CURSOR_PATH ?? ".qaf/vector-index/.ci-failures-cursor.json";

  const lines = await readFailureLines(failuresPath);
  if (lines === null) {
    process.stdout.write(`qaf-rag-cluster: no ${failuresPath} found — nothing to cluster.\n`);
    return;
  }

  const cursor = await readCursor(cursorPath);
  const newLines = lines.slice(cursor.processedLines);
  if (newLines.length === 0) {
    process.stdout.write("qaf-rag-cluster: no new failures since the last run.\n");
    return;
  }

  const provider = await loadProviderFromEnv();
  const store = new LocalJsonlVectorStore(process.env.QAF_RAG_INDEX_DIR ?? ".qaf/vector-index");

  for (const line of newLines) {
    const record = JSON.parse(line) as FailureRecord;
    const result = await clusterFailure(record, {
      vectorStore: store,
      embeddingProvider: provider,
    });
    annotateClusterResult(record, result);
  }

  await mkdir(path.dirname(cursorPath), { recursive: true });
  await writeFile(
    cursorPath,
    JSON.stringify({ processedLines: lines.length } satisfies Cursor),
    "utf-8",
  );
}

async function readFailureLines(failuresPath: string): Promise<string[] | null> {
  try {
    const raw = await readFile(failuresPath, "utf-8");
    return raw.split("\n").filter((line) => line.trim().length > 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function readCursor(cursorPath: string): Promise<Cursor> {
  try {
    return JSON.parse(await readFile(cursorPath, "utf-8")) as Cursor;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { processedLines: 0 };
    throw error;
  }
}

function annotateClusterResult(record: FailureRecord, result: ClusterResult): void {
  if (result.isNewCluster) {
    process.stdout.write(
      `::notice file=${record.file},title=New failure signature::` +
        `"${record.testId}" started a new cluster (${result.clusterId}).\n`,
    );
    return;
  }
  const label = result.rootCauseLabel ? ` — ${result.rootCauseLabel}` : "";
  const issue = result.linkedIssue ? ` (linked: ${result.linkedIssue})` : "";
  process.stdout.write(
    `::warning file=${record.file},title=Matches a known failure cluster (advisory only)::` +
      `"${record.testId}" matches cluster ${result.clusterId}, ${result.similarOccurrences.length} similar ` +
      `occurrence(s) on record${label}${issue}.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`qaf-rag-cluster failed: ${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
