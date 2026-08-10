import { execFileSync } from "node:child_process";
import type { DocumentSource, SourceDocument } from "./types.js";

export interface DiscoveredTest {
  titlePath: string[];
  file: string;
  project: string;
}

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

export interface TestCatalogSourceOptions {
  cwd?: string;
  /** Override for testing (and for callers that already ran `--list` themselves) — bypasses the shell-out. */
  discover?: () => DiscoveredTest[];
}

/**
 * One `SourceDocument` per (test, project) pair, chunked as *intent* rather
 * than implementation: title path + tags. Deliberately excludes the test
 * body — implementation detail is noise relative to what a spec/ticket
 * describes, and it would dominate the embedding with framework boilerplate
 * (`await expect(...)`) common to unrelated tests.
 *
 * Parses `playwright test --list --reporter=json`, the same external
 * contract `@qaf/core`'s `qaf-check-quarantine` bin already relies on.
 * Duplicated here rather than shared, matching that bin's own precedent of
 * keeping this parsing CLI-local (it's purely about one external CLI's
 * output shape, not framework logic worth a shared module).
 */
export function createTestCatalogSource(options: TestCatalogSourceOptions = {}): DocumentSource {
  const cwd = options.cwd ?? process.cwd();
  return {
    namespace: "test",
    async fetch(): Promise<SourceDocument[]> {
      const discovered = options.discover ? options.discover() : discoverTests(cwd);
      return discovered.map((t) => {
        const tags = t.titlePath.flatMap(extractTags);
        const title = t.titlePath.join(" > ");
        return {
          id: buildTestId(t),
          namespace: "test",
          title,
          text: [title, tags.length > 0 ? `Tags: ${tags.join(", ")}` : ""]
            .filter(Boolean)
            .join("\n"),
          metadata: { file: t.file, project: t.project, tags },
        } satisfies SourceDocument;
      });
    },
  };
}

/**
 * `${file}::${project}::${meaningfulTitlePath}` — intentionally the same
 * shape as `@qaf/core`'s `buildEntryId` (quarantine/manifest.ts) so a test's
 * id here lines up with its quarantine-manifest id for cross-referencing in
 * reports (e.g. "this orphan test is also quarantined"), without this
 * package depending on `@qaf/core` for one string-building function.
 */
export function buildTestId(t: DiscoveredTest): string {
  const meaningfulTitlePath = t.titlePath.filter((segment) => segment !== t.file);
  return `${t.file}::${t.project}::${meaningfulTitlePath.join(" > ")}`;
}

export function extractTags(titleSegment: string): string[] {
  return titleSegment.match(/@[\w-]+/g) ?? [];
}

function flattenSuites(
  suites: PlaywrightJsonSuite[],
  titlePrefix: string[] = [],
): DiscoveredTest[] {
  const rows: DiscoveredTest[] = [];
  for (const suite of suites) {
    const prefix = suite.title ? [...titlePrefix, suite.title] : titlePrefix;
    for (const spec of suite.specs ?? []) {
      const titlePath = [...prefix, spec.title];
      for (const t of spec.tests) {
        rows.push({ titlePath, file: spec.file, project: t.projectName });
      }
    }
    if (suite.suites) {
      rows.push(...flattenSuites(suite.suites, prefix));
    }
  }
  return rows;
}

function discoverTests(cwd: string): DiscoveredTest[] {
  const raw = execFileSync("npx", ["playwright", "test", "--list", "--reporter=json"], {
    cwd,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const parsed = JSON.parse(raw) as PlaywrightListOutput;
  return flattenSuites(parsed.suites);
}
