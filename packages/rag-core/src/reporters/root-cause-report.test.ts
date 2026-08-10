import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRootCauseReportMarkdown } from "./root-cause-report.js";
import type { ClusterSummary } from "../failure-clustering/types.js";

function cluster(overrides: Partial<ClusterSummary> = {}): ClusterSummary {
  return {
    clusterId: "c1",
    occurrenceCount: 3,
    distinctTestIds: ["a.spec.ts::chromium::t"],
    lastSeen: "2026-08-09T00:00:00.000Z",
    ...overrides,
  };
}

test("splits recurring clusters into infra-level (multi-test) vs single-test sections", () => {
  const md = buildRootCauseReportMarkdown({
    generatedAt: "2026-08-09",
    clusters: [
      cluster({ clusterId: "infra", distinctTestIds: ["a::t", "b::t"] }),
      cluster({ clusterId: "single", distinctTestIds: ["a::t"] }),
    ],
  });
  assert.match(md, /\| `infra` \|/);
  const infraSection = md.split("## Recurring on a single test")[0] ?? "";
  assert.match(infraSection, /`infra`/);
  assert.doesNotMatch(infraSection.split("## Spanning")[1] ?? infraSection, /`single`/);
});

test("omits clusters below minOccurrences from the recurring counts", () => {
  const md = buildRootCauseReportMarkdown({
    generatedAt: "2026-08-09",
    clusters: [cluster({ clusterId: "onceonly", occurrenceCount: 1 })],
  });
  assert.match(md, /0 recurring cluster/);
  assert.doesNotMatch(md, /onceonly/);
});

test("unlabeled clusters render 'unlabeled' rather than a blank cell", () => {
  const md = buildRootCauseReportMarkdown({ generatedAt: "2026-08-09", clusters: [cluster()] });
  assert.match(md, /\| unlabeled \|/);
});

test("labeled clusters render their root cause and linked issue", () => {
  const md = buildRootCauseReportMarkdown({
    generatedAt: "2026-08-09",
    clusters: [cluster({ rootCauseLabel: "Flaky API mock timeout", linkedIssue: "#42" })],
  });
  assert.match(md, /Flaky API mock timeout/);
  assert.match(md, /#42/);
});
