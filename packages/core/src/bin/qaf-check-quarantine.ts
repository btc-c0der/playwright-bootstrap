#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { checkCeiling } from "../quarantine/ceiling.js";
import { loadManifest, buildEntryId, DEFAULT_MANIFEST_PATH } from "../quarantine/manifest.js";
import { checkSync, type DiscoveredQuarantinedTest } from "../quarantine/sync-check.js";
import {
  annotateCeilingResult,
  annotateRepairSuggestion,
  annotateSyncResult,
  readRepairSuggestions,
} from "../quarantine/annotate.js";

interface PlaywrightJsonSpec {
  title: string;
  file: string;
  tests: Array<{ projectName: string }>;
}

interface PlaywrightJsonSuite {
  title: string;
  specs?: PlaywrightJsonSpec[];
  suites?: PlaywrightJsonSuite[];
}

interface PlaywrightListOutput {
  suites: PlaywrightJsonSuite[];
}

/**
 * Flattens Playwright's `--list --reporter=json` suite tree into one row per
 * (spec title path, project). Kept CLI-local rather than in a shared module
 * since it's purely about parsing this one external CLI's output shape.
 */
function flattenSuites(
  suites: PlaywrightJsonSuite[],
  titlePrefix: string[] = [],
): Array<{ titlePath: string[]; file: string; project: string }> {
  const rows: Array<{ titlePath: string[]; file: string; project: string }> = [];
  for (const suite of suites) {
    const prefix = suite.title ? [...titlePrefix, suite.title] : titlePrefix;
    for (const spec of suite.specs ?? []) {
      const titlePath = [...prefix, spec.title];
      for (const test of spec.tests) {
        rows.push({ titlePath, file: spec.file, project: test.projectName });
      }
    }
    if (suite.suites) {
      rows.push(...flattenSuites(suite.suites, prefix));
    }
  }
  return rows;
}

function discoverTests(): Array<{ titlePath: string[]; file: string; project: string }> {
  const raw = execFileSync("npx", ["playwright", "test", "--list", "--reporter=json"], {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const parsed = JSON.parse(raw) as PlaywrightListOutput;
  return flattenSuites(parsed.suites);
}

async function main(): Promise<void> {
  const manifestPath = process.argv[2] ?? DEFAULT_MANIFEST_PATH;
  const manifest = await loadManifest(manifestPath);

  const allTests = discoverTests();
  const quarantined: DiscoveredQuarantinedTest[] = allTests
    .filter((t) => t.titlePath.join(" > ").includes("@quarantined"))
    .map((t) => ({
      id: buildEntryId({ file: t.file, project: t.project, titlePath: t.titlePath }),
      file: t.file,
      project: t.project,
    }));

  const ceilingResult = checkCeiling(manifest, allTests.length);
  const syncResult = checkSync(manifest, quarantined);

  annotateCeilingResult(ceilingResult);
  annotateSyncResult(syncResult);

  const suggestions = await readRepairSuggestions(
    process.env.QAF_REPAIR_SUGGESTIONS_PATH ?? "locator-repair-suggestions.jsonl",
  );
  for (const suggestion of suggestions) {
    annotateRepairSuggestion(suggestion);
  }

  if (!ceilingResult.passed || !syncResult.passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`qaf-check-quarantine failed: ${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
