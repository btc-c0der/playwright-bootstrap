// Run nightly by .github/workflows/quarantine-audit.yml. Reads the aggregated
// .qaf/test-run-history.jsonl, finds tests failing >= 3 of their trailing 20
// runs that AREN'T already quarantined, and proposes them: adds a manifest
// entry + best-effort tags the matching test title with `@quarantined` in
// source. Never commits directly — the workflow opens a PR for a human to
// review and merge. See docs/quarantine.md.
import { readFile, writeFile } from "node:fs/promises";
import { analyzeFlakiness, loadManifest, saveManifest, activeEntries } from "@qaf/core";

const HISTORY_PATH = ".qaf/test-run-history.jsonl";
const RENEWAL_DAYS = 14;

async function tagTestAsQuarantined(file, id) {
  // id shape: `${file}::${project}::${titlePath joined by " > "}`; the last
  // segment of the title path is the actual `test("...")`/`test.step` title.
  const titlePath = id.split("::")[2] ?? "";
  const leafTitle = titlePath.split(" > ").pop();
  if (!leafTitle) return false;

  const source = await readFile(file, "utf-8");
  const escaped = leafTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(test(?:\\.only)?\\(\\s*["'\`])(${escaped})(["'\`])`);
  if (!pattern.test(source)) return false;
  if (leafTitle.includes("@quarantined")) return true; // already tagged

  const updated = source.replace(pattern, (_match, open, title, close) => `${open}${title} @quarantined${close}`);
  await writeFile(file, updated, "utf-8");
  return true;
}

async function main() {
  const manifest = await loadManifest();
  const candidates = await analyzeFlakiness(HISTORY_PATH, { window: 20, failureThreshold: 3 });
  const alreadyQuarantined = new Set(activeEntries(manifest).map((e) => e.id));

  const proposed = [];
  for (const candidate of candidates) {
    if (alreadyQuarantined.has(candidate.id)) continue;

    const tagged = await tagTestAsQuarantined(candidate.file, candidate.id);
    if (!tagged) {
      process.stdout.write(`Could not auto-tag "${candidate.id}" — skipping, needs manual quarantine.\n`);
      continue;
    }

    const now = new Date();
    const expires = new Date(now.getTime() + RENEWAL_DAYS * 24 * 60 * 60 * 1000);
    manifest.entries.push({
      id: candidate.id,
      file: candidate.file,
      project: candidate.project,
      status: "quarantined",
      reason: `flaky-auto-detected (${candidate.failures}/${candidate.window} failures)`,
      firstSeen: candidate.lastFailure,
      lastFailure: candidate.lastFailure,
      flakeRate: { window: candidate.window, failures: candidate.failures },
      quarantinedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      renewalCount: 0,
    });
    proposed.push(candidate.id);
  }

  await saveManifest(manifest);
  await writeFile("flake-detection-summary.json", JSON.stringify({ proposed }, null, 2));
  process.stdout.write(`Proposed ${proposed.length} new quarantine entr${proposed.length === 1 ? "y" : "ies"}.\n`);
}

main().catch((error) => {
  process.stderr.write(`detect-flakes failed: ${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
