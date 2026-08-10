import { readFile } from "node:fs/promises";
import type { TestRunRecord } from "../quarantine/reporter.js";

export interface FlakeCandidate {
  id: string;
  file: string;
  project: string;
  window: number;
  failures: number;
  lastFailure: string;
}

/**
 * Groups `test-run-history.jsonl` records by test id, looks at each test's
 * trailing `window` runs, and flags any test failing in >= `failureThreshold`
 * of them as a flake candidate. This is what the nightly `quarantine-audit.yml`
 * job runs to decide which tests to propose (via a bot PR) for quarantine —
 * "failed then passed on retry" (retry > 0, status passed) counts as a failure
 * here even though Playwright ultimately reported the test green.
 */
export async function analyzeFlakiness(
  historyPath: string,
  options: { window?: number; failureThreshold?: number } = {},
): Promise<FlakeCandidate[]> {
  const window = options.window ?? 20;
  const failureThreshold = options.failureThreshold ?? 3;

  const records = await readHistory(historyPath);
  const byId = new Map<string, TestRunRecord[]>();
  for (const record of records) {
    const list = byId.get(record.id) ?? [];
    list.push(record);
    byId.set(record.id, list);
  }

  const candidates: FlakeCandidate[] = [];
  for (const [id, runs] of byId) {
    const trailing = runs.slice(-window);
    const failures = trailing.filter((r) => r.status === "failed" || r.retry > 0).length;
    if (failures >= failureThreshold) {
      const last = trailing[trailing.length - 1];
      if (!last) continue;
      candidates.push({
        id,
        file: last.file,
        project: last.project,
        window: trailing.length,
        failures,
        lastFailure: last.timestamp,
      });
    }
  }
  return candidates;
}

async function readHistory(path: string): Promise<TestRunRecord[]> {
  try {
    const raw = await readFile(path, "utf-8");
    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as TestRunRecord);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
