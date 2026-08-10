#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { LocalGraphStore } from "../graph/local-graph-store.js";
import { analyzeImpact } from "../impact/select-tests.js";
import { buildCiPayload } from "../reporters/payload.js";

const DEFAULT_MAX_DEPTH = 3;

/**
 * Reads a JSON array of changed refs/file paths (`QAF_GRAPH_CHANGED_REFS_PATH`,
 * default `qaf-graph-changed-refs.json`) — a PR's changed endpoints/services
 * or just its changed file list — walks the impact radius against the graph
 * `qaf-graph-ingest` already built, and prints requirement #4's JSON payload
 * (with `root_cause_analysis: null` — this bin runs pre-merge, before any SIT
 * failure exists) to stdout for the CI step to consume, plus optionally to a
 * file (`QAF_GRAPH_IMPACT_OUTPUT_PATH`).
 */
async function main(): Promise<void> {
  const changedRefsPath = process.env.QAF_GRAPH_CHANGED_REFS_PATH ?? "qaf-graph-changed-refs.json";
  const changedRefs = JSON.parse(await readFile(changedRefsPath, "utf-8")) as string[];

  const store = new LocalGraphStore(process.env.QAF_GRAPH_INDEX_DIR ?? ".qaf/graph-index");
  await store.load();

  const maxDepth = Number(process.env.QAF_GRAPH_MAX_DEPTH ?? DEFAULT_MAX_DEPTH);
  const result = await analyzeImpact(store, changedRefs, { maxDepth });

  if (result.unresolvedRefs.length > 0) {
    process.stderr.write(
      `::warning::qaf-graph-impact: ${result.unresolvedRefs.length} changed ref(s) matched nothing in ` +
        `the graph — it may be stale: ${result.unresolvedRefs.join(", ")}\n`,
    );
  }

  const payload = buildCiPayload(result);
  const json = JSON.stringify(payload, null, 2);
  process.stdout.write(json + "\n");

  const outputPath = process.env.QAF_GRAPH_IMPACT_OUTPUT_PATH;
  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, json, "utf-8");
  }
}

main().catch((error) => {
  process.stderr.write(`qaf-graph-impact failed: ${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
