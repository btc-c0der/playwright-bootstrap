import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCoverageReportMarkdown } from "./coverage-report.js";
import type { CoverageResult } from "../mapping/types.js";

function result(overrides: Partial<CoverageResult> = {}): CoverageResult {
  return { mappings: [], orphans: [], ...overrides };
}

test("summarizes counts by status and orphan count in the header line", () => {
  const md = buildCoverageReportMarkdown({
    generatedAt: "2026-08-09",
    result: result({
      mappings: [
        {
          specId: "s1",
          specTitle: "Spec 1",
          specNamespace: "spec",
          matchedTests: [{ testId: "t1", score: 0.9 }],
          status: "covered",
        },
        {
          specId: "s2",
          specTitle: "Spec 2",
          specNamespace: "jira",
          matchedTests: [],
          status: "gap",
        },
      ],
      orphans: [{ testId: "t2", testTitle: "orphan" }],
    }),
  });
  assert.match(md, /2 spec\(s\) mapped: 1 covered, 0 partial, 1 gap\(s\)\. 1 orphan test\(s\)/);
});

test("renders 'None.' for empty gap/partial/orphan sections", () => {
  const md = buildCoverageReportMarkdown({ generatedAt: "2026-08-09", result: result() });
  const noneCount = md.split("\n").filter((l) => l === "None.").length;
  assert.equal(noneCount, 3);
});

test("lists each gap by title and source namespace", () => {
  const md = buildCoverageReportMarkdown({
    generatedAt: "2026-08-09",
    result: result({
      mappings: [
        {
          specId: "s1",
          specTitle: "Missing spec",
          specNamespace: "confluence",
          matchedTests: [],
          status: "gap",
        },
      ],
    }),
  });
  assert.match(md, /\| Missing spec \| confluence \|/);
});

test("lists partial matches with their best test id and formatted score", () => {
  const md = buildCoverageReportMarkdown({
    generatedAt: "2026-08-09",
    result: result({
      mappings: [
        {
          specId: "s1",
          specTitle: "Partial spec",
          specNamespace: "spec",
          matchedTests: [{ testId: "a.spec.ts::chromium::test", score: 0.734 }],
          status: "partial",
        },
      ],
    }),
  });
  assert.match(md, /\| Partial spec \| spec \| `a\.spec\.ts::chromium::test` \| 0\.73 \|/);
});

test("lists orphan test ids", () => {
  const md = buildCoverageReportMarkdown({
    generatedAt: "2026-08-09",
    result: result({ orphans: [{ testId: "orphan.spec.ts::api::t", testTitle: "t" }] }),
  });
  assert.match(md, /\| `orphan\.spec\.ts::api::t` \|/);
});
