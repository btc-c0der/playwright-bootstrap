#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { LocalGraphStore } from "../graph/local-graph-store.js";
import { LocalIncidentStore } from "../root-cause/incident-store.js";
import { diagnoseRootCause } from "../root-cause/diagnose.js";
import type { DiagnoseInput } from "../root-cause/diagnose.js";
import { buildCiPayload } from "../reporters/payload.js";
import type { AnalyzeImpactResult } from "../impact/select-tests.js";
import { loadProviderFromEnv } from "./load-provider.js";

const DEFAULT_MAX_DEPTH = 3;

/**
 * Reads a `DiagnoseInput` JSON file (`QAF_GRAPH_FAILURE_PATH`, default
 * `qaf-graph-failure.json` — `{ failingNodeId, stackTrace, timestamp,
 * serviceLogs? }`) describing a SIT failure, diagnoses its root cause, and
 * prints requirement #4's JSON payload to stdout. If
 * `QAF_GRAPH_IMPACT_OUTPUT_PATH` (from a prior `qaf-graph-impact` run) points
 * at an existing file, its `selected_tests`/`impact_radius_score` are carried
 * forward into the same payload rather than re-running impact analysis —
 * the common case is "diagnose the failure that happened *during* the
 * already-selected regression run", not a fresh impact query.
 */
async function main(): Promise<void> {
  const failurePath = process.env.QAF_GRAPH_FAILURE_PATH ?? "qaf-graph-failure.json";
  const failure = JSON.parse(await readFile(failurePath, "utf-8")) as DiagnoseInput;

  const store = new LocalGraphStore(process.env.QAF_GRAPH_INDEX_DIR ?? ".qaf/graph-index");
  await store.load();
  const incidentStore = new LocalIncidentStore(process.env.QAF_GRAPH_INDEX_DIR ?? ".qaf/graph-index");
  const embeddingProvider = await loadProviderFromEnv();

  const maxDepth = Number(process.env.QAF_GRAPH_MAX_DEPTH ?? DEFAULT_MAX_DEPTH);
  const rootCause = await diagnoseRootCause(failure, {
    store,
    incidentStore,
    embeddingProvider,
    maxDepth,
  });

  process.stderr.write(
    `qaf-graph-diagnose: origin=${rootCause.origin_node} root_cause=${rootCause.root_cause_node} ` +
      `confidence=${rootCause.confidence}%\n`,
  );

  const priorImpact = await readPriorImpact(process.env.QAF_GRAPH_IMPACT_OUTPUT_PATH);
  const payload = buildCiPayload(priorImpact, rootCause);
  const json = JSON.stringify(payload, null, 2);
  process.stdout.write(json + "\n");

  const outputPath = process.env.QAF_GRAPH_DIAGNOSE_OUTPUT_PATH;
  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, json, "utf-8");
  }
}

/** Falls back to an empty impact selection (0 tests, 0 radius) if no prior `qaf-graph-impact` output is configured/found — diagnosis still runs standalone. */
async function readPriorImpact(impactOutputPath: string | undefined): Promise<AnalyzeImpactResult> {
  const empty: AnalyzeImpactResult = {
    seeds: [],
    impact: { seeds: [], impacted: [] },
    selectedTests: [],
    impactRadiusScore: 0,
    unresolvedRefs: [],
  };
  if (!impactOutputPath) return empty;
  try {
    const priorPayload = JSON.parse(await readFile(impactOutputPath, "utf-8")) as {
      selected_tests: string[];
      impact_radius_score: number;
    };
    return {
      ...empty,
      selectedTests: priorPayload.selected_tests,
      impactRadiusScore: priorPayload.impact_radius_score,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty;
    throw error;
  }
}

main().catch((error) => {
  process.stderr.write(`qaf-graph-diagnose failed: ${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
