import type { ClusterSummary } from "../failure-clustering/types.js";

export interface RootCauseReportInputs {
  generatedAt: string;
  clusters: ClusterSummary[];
  /** Clusters below this occurrence count are omitted from "recurring" — a single occurrence isn't a pattern yet. */
  minOccurrences?: number;
}

const DEFAULT_MIN_OCCURRENCES = 2;

/**
 * Renders the "recurring root-cause clusters" markdown the `audit` skill
 * folds in alongside quarantine/flake sections, plus what `qaf-rag-cluster`
 * prints after each CI run. Pure formatting over already-computed
 * `ClusterSummary[]`, same shape as `buildHealthReportMarkdown`/
 * `buildCoverageReportMarkdown`.
 */
export function buildRootCauseReportMarkdown(inputs: RootCauseReportInputs): string {
  const minOccurrences = inputs.minOccurrences ?? DEFAULT_MIN_OCCURRENCES;
  const recurring = inputs.clusters.filter((c) => c.occurrenceCount >= minOccurrences);
  const infraLevel = recurring.filter((c) => c.distinctTestIds.length > 1);
  const perTest = recurring.filter((c) => c.distinctTestIds.length <= 1);

  const lines: string[] = [];
  lines.push(`# QAF Root-Cause Clusters — ${inputs.generatedAt}`, "");
  lines.push(
    `${recurring.length} recurring cluster(s) (>= ${minOccurrences} occurrences): ` +
      `${infraLevel.length} spanning multiple distinct tests (likely infra-level), ${perTest.length} single-test.`,
    "",
  );
  lines.push(
    "_A cluster match is advisory — review before treating two failures as the same root cause._",
    "",
  );

  lines.push("## Spanning multiple tests (likely infra-level)", "");
  lines.push(...renderTable(infraLevel));

  lines.push("## Recurring on a single test", "");
  lines.push(...renderTable(perTest));

  return lines.join("\n");
}

function renderTable(clusters: ClusterSummary[]): string[] {
  if (clusters.length === 0) return ["None.", ""];
  const lines = [
    "| Cluster | Occurrences | Distinct tests | Root cause | Linked issue | Last seen |",
    "|---|---|---|---|---|---|",
  ];
  for (const c of clusters) {
    lines.push(
      `| \`${c.clusterId}\` | ${c.occurrenceCount} | ${c.distinctTestIds.length} | ${c.rootCauseLabel ?? "unlabeled"} | ${c.linkedIssue ?? "—"} | ${c.lastSeen} |`,
    );
  }
  lines.push("");
  return lines;
}
