import type { CoverageResult } from "../mapping/types.js";

export interface CoverageReportInputs {
  generatedAt: string;
  result: CoverageResult;
}

/**
 * Renders the markdown the `/rag-coverage` skill writes to
 * `docs/coverage-reports/<date>.md`. Pure formatting over an already-computed
 * `CoverageResult`, same shape as `@qaf/core`'s `buildHealthReportMarkdown` —
 * trivially testable, reusable outside the skill (e.g. a
 * `pnpm --filter rag-core coverage` script).
 */
export function buildCoverageReportMarkdown(inputs: CoverageReportInputs): string {
  const { result } = inputs;
  const gaps = result.mappings.filter((m) => m.status === "gap");
  const partial = result.mappings.filter((m) => m.status === "partial");
  const covered = result.mappings.filter((m) => m.status === "covered");

  const lines: string[] = [];
  lines.push(`# QAF Coverage Report — ${inputs.generatedAt}`, "");
  lines.push(
    `${result.mappings.length} spec(s) mapped: ${covered.length} covered, ${partial.length} partial, ` +
      `${gaps.length} gap(s). ${result.orphans.length} orphan test(s) with no matching spec.`,
    "",
  );
  lines.push(
    "_Semantic similarity is a hint, not proof of coverage — review before acting on any row below._",
    "",
  );

  lines.push("## Gaps — no test above threshold", "");
  if (gaps.length === 0) {
    lines.push("None.", "");
  } else {
    lines.push("| Spec | Source |", "|---|---|");
    for (const m of gaps) lines.push(`| ${m.specTitle} | ${m.specNamespace} |`);
    lines.push("");
  }

  lines.push('## Partial coverage — best match below the "covered" threshold', "");
  if (partial.length === 0) {
    lines.push("None.", "");
  } else {
    lines.push("| Spec | Source | Best match | Score |", "|---|---|---|---|");
    for (const m of partial) {
      const best = m.matchedTests[0];
      lines.push(
        `| ${m.specTitle} | ${m.specNamespace} | \`${best?.testId ?? "—"}\` | ${formatScore(best?.score)} |`,
      );
    }
    lines.push("");
  }

  lines.push("## Orphan tests — no spec matched above threshold", "");
  if (result.orphans.length === 0) {
    lines.push("None.", "");
  } else {
    lines.push("| Test |", "|---|");
    for (const o of result.orphans) lines.push(`| \`${o.testId}\` |`);
    lines.push("");
  }

  return lines.join("\n");
}

function formatScore(score: number | undefined): string {
  return score === undefined ? "—" : score.toFixed(2);
}
