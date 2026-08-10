#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { computeSpecToTestMapping } from "../mapping/spec-to-test.js";
import { buildCoverageReportMarkdown } from "../reporters/coverage-report.js";
import { LocalJsonlVectorStore } from "../vector-store/local-jsonl-store.js";

/**
 * Reads the already-indexed vector store (run `qaf-rag-index` first) and
 * writes a coverage report. Never touches the index itself — mapping is a
 * read-only query over whatever was indexed, same "advisory only" posture as
 * every other RAG output (see docs/rag-coverage-plan.md's Risks).
 */
async function main(): Promise<void> {
  const store = new LocalJsonlVectorStore(process.env.QAF_RAG_INDEX_DIR ?? ".qaf/vector-index");
  const result = await computeSpecToTestMapping({ vectorStore: store });

  const generatedAt = process.env.QAF_RAG_REPORT_DATE ?? new Date().toISOString().slice(0, 10);
  const markdown = buildCoverageReportMarkdown({ generatedAt, result });

  const outPath = process.argv[2] ?? path.join("docs", "coverage-reports", `${generatedAt}.md`);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, markdown, "utf-8");

  const gaps = result.mappings.filter((m) => m.status === "gap").length;
  process.stdout.write(`Coverage report written to ${outPath}\n`);
  process.stdout.write(
    `${result.mappings.length} spec(s) mapped, ${gaps} gap(s), ${result.orphans.length} orphan(s).\n`,
  );
  // Exit code is always 0 here regardless of gap count — advisory only, never fails CI (see plan's Risks).
}

main().catch((error) => {
  process.stderr.write(`qaf-rag-map failed: ${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
