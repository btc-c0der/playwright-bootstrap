import { readFile } from "node:fs/promises";
import type { RepairSuggestion } from "../locator-resolver/types.js";
import type { CeilingCheckResult } from "./ceiling.js";
import type { SyncCheckResult } from "./sync-check.js";

/**
 * Emits GitHub Actions workflow-command annotations (`::warning file=...::`),
 * which render directly on the PR's "Files changed" tab with no GitHub API
 * token/permissions needed. This is intentionally output, not `console.log` —
 * it goes through `process.stdout.write` because these are CI log protocol
 * commands, not application log lines the Logger should structure/scope.
 */
export function annotateRepairSuggestion(s: RepairSuggestion): void {
  const location = s.file ? `file=${s.file},` : "";
  process.stdout.write(
    `::warning ${location}title=AI-repair suggestion (advisory only)::` +
      `Locator "${s.fallbackLabel}" exhausted all strategies. Suggested selector: ` +
      `${s.suggestedSelector} (confidence ${s.confidence}). ${s.rationale}\n`,
  );
}

export function annotateCeilingResult(result: CeilingCheckResult): void {
  if (result.passed) {
    process.stdout.write(
      `::notice title=Quarantine ceiling OK::${result.activeCount} active (${result.activePercent.toFixed(1)}%)\n`,
    );
    return;
  }
  for (const reason of result.reasons) {
    process.stdout.write(`::error title=Quarantine ceiling breached::${reason}\n`);
  }
}

export function annotateSyncResult(result: SyncCheckResult): void {
  for (const t of result.taggedWithoutEntry) {
    process.stdout.write(
      `::error file=${t.file},title=Untracked quarantine::` +
        `Test "${t.id}" is tagged @quarantined but has no quarantine-manifest.json entry.\n`,
    );
  }
  for (const id of result.entryWithoutTag) {
    process.stdout.write(
      `::warning title=Stale quarantine entry::` +
        `Manifest entry "${id}" has no matching @quarantined test in source — remove or re-tag.\n`,
    );
  }
}

export async function readRepairSuggestions(path: string): Promise<RepairSuggestion[]> {
  try {
    const raw = await readFile(path, "utf-8");
    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as RepairSuggestion);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
