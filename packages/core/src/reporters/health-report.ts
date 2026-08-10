import type { QuarantineManifest } from "../quarantine/manifest.js";
import type { CeilingCheckResult } from "../quarantine/ceiling.js";
import type { FlakeCandidate } from "./flaky-report.js";
import type { RepairSuggestion } from "../locator-resolver/types.js";
import type { TeardownFailure } from "../data/teardown.js";

export interface HealthReportInputs {
  generatedAt: string;
  manifest: QuarantineManifest;
  ceiling: CeilingCheckResult;
  newFlakeCandidates: FlakeCandidate[];
  repairSuggestions: RepairSuggestion[];
  teardownFailures: TeardownFailure[];
}

/**
 * Renders the markdown consumed by the `audit` skill's `docs/health-reports/<date>.md`
 * output. Pure formatting over already-computed inputs so it stays trivially testable
 * and reusable outside the skill (e.g. a manual `pnpm --filter core audit` script).
 */
export function buildHealthReportMarkdown(inputs: HealthReportInputs): string {
  const lines: string[] = [];
  lines.push(`# QAF Health Report — ${inputs.generatedAt}`, "");

  lines.push("## Quarantine ceiling", "");
  lines.push(
    `${inputs.ceiling.passed ? "PASSED" : "BREACHED"} — ${inputs.ceiling.activeCount} active (${inputs.ceiling.activePercent.toFixed(1)}%), ceiling ${inputs.manifest.ceiling.maxCount} / ${inputs.manifest.ceiling.maxPercent}%.`,
    "",
  );
  if (inputs.ceiling.reasons.length > 0) {
    for (const reason of inputs.ceiling.reasons) lines.push(`- ${reason}`);
    lines.push("");
  }

  lines.push("## New flake candidates (not yet quarantined)", "");
  if (inputs.newFlakeCandidates.length === 0) {
    lines.push("None.", "");
  } else {
    lines.push("| Test | Failures/Window | Last failure |", "|---|---|---|");
    for (const c of inputs.newFlakeCandidates) {
      lines.push(`| \`${c.id}\` | ${c.failures}/${c.window} | ${c.lastFailure} |`);
    }
    lines.push("");
  }

  lines.push("## Pending AI-repair suggestions", "");
  if (inputs.repairSuggestions.length === 0) {
    lines.push("None.", "");
  } else {
    lines.push("| Locator | Suggested selector | Confidence |", "|---|---|---|");
    for (const s of inputs.repairSuggestions) {
      lines.push(`| ${s.fallbackLabel} | \`${s.suggestedSelector}\` | ${s.confidence} |`);
    }
    lines.push("");
  }

  lines.push("## Teardown failures (possible orphaned test data)", "");
  if (inputs.teardownFailures.length === 0) {
    lines.push("None.", "");
  } else {
    lines.push("| Type | Id | Error |", "|---|---|---|");
    for (const f of inputs.teardownFailures) {
      lines.push(`| ${f.type} | ${f.id} | ${f.error} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
