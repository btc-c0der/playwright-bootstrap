import type { DocumentSource, SourceDocument } from "./types.js";

/**
 * Zephyr Scale (Cloud) REST API test case shape — trimmed to the fields this
 * source uses. Zephyr Server/Data Center's API differs; this targets Cloud
 * since that's the common case, and the fetch is isolated behind
 * `ZephyrSourceOptions.fetchImpl` precisely so a team on Server/DC can supply
 * their own `loadTestCases`-equivalent without forking this file — see
 * `createZephyrSourceFromTestCases` below for that path.
 */
export interface ZephyrTestCaseInput {
  key: string;
  name: string;
  objective?: string;
  precondition?: string;
  /** Flattened step descriptions — Zephyr's testScript.steps, joined for embedding. */
  steps?: string[];
  labels?: string[];
  status?: string;
  updatedOn?: string;
  url?: string;
}

export function normalizeZephyrTestCases(cases: ZephyrTestCaseInput[]): SourceDocument[] {
  return cases.map((tc) => ({
    id: `zephyr:${tc.key}`,
    namespace: "zephyr",
    title: `${tc.key}: ${tc.name}`,
    text: [tc.name, tc.objective, tc.precondition, ...(tc.steps ?? [])]
      .filter(Boolean)
      .join("\n\n"),
    url: tc.url,
    updatedAt: tc.updatedOn,
    metadata: { key: tc.key, labels: tc.labels ?? [], status: tc.status },
  }));
}

/**
 * Preferred integration path, matching jira.ts/confluence.ts: supply
 * already-fetched test cases (however your team gets them — Zephyr Scale
 * REST API, Server/DC API, or a manual CSV/export ingestion script) and this
 * just normalizes them. No network call, no token handling, testable with
 * plain data.
 */
export function createZephyrSourceFromTestCases(
  loadTestCases: () => Promise<ZephyrTestCaseInput[]>,
): DocumentSource {
  return {
    namespace: "zephyr",
    async fetch(): Promise<SourceDocument[]> {
      return normalizeZephyrTestCases(await loadTestCases());
    },
  };
}

export interface ZephyrScaleApiSourceOptions {
  /** e.g. "https://api.zephyrscale.smartbear.com/v2" */
  baseUrl: string;
  apiToken: string;
  projectKey: string;
  /** Injectable for tests; defaults to the global `fetch` (Node >=20). */
  fetchImpl?: typeof fetch;
  pageSize?: number;
}

interface ZephyrScaleListResponse {
  values: ZephyrScaleApiTestCase[];
  isLast: boolean;
}

interface ZephyrScaleApiTestCase {
  key: string;
  name: string;
  objective?: string;
  precondition?: string;
  status?: { name?: string };
  labels?: string[];
  updatedOn?: string;
  testScript?: { steps?: Array<{ description?: string }> };
}

/**
 * Concrete Zephyr Scale Cloud adapter, gated the same way every other
 * external call in this package is: nothing runs unless a caller
 * constructs and invokes it with real credentials. Paginates via Zephyr's
 * `isLast`/`startAt` convention.
 */
export function createZephyrScaleApiSource(options: ZephyrScaleApiSourceOptions): DocumentSource {
  const fetchFn = options.fetchImpl ?? fetch;
  const pageSize = options.pageSize ?? 50;

  return {
    namespace: "zephyr",
    async fetch(): Promise<SourceDocument[]> {
      const all: ZephyrScaleApiTestCase[] = [];
      let startAt = 0;
      for (;;) {
        const url =
          `${options.baseUrl}/testcases?projectKey=${encodeURIComponent(options.projectKey)}` +
          `&maxResults=${pageSize}&startAt=${startAt}`;
        const response = await fetchFn(url, {
          headers: { Authorization: `Bearer ${options.apiToken}` },
        });
        if (!response.ok) {
          throw new Error(
            `Zephyr Scale API request failed: ${response.status} ${response.statusText}`,
          );
        }
        const page = (await response.json()) as ZephyrScaleListResponse;
        all.push(...page.values);
        if (page.isLast || page.values.length === 0) break;
        startAt += page.values.length;
      }
      return normalizeZephyrTestCases(
        all.map((tc) => ({
          key: tc.key,
          name: tc.name,
          objective: tc.objective,
          precondition: tc.precondition,
          steps: tc.testScript?.steps
            ?.map((s) => s.description)
            .filter((d): d is string => Boolean(d)),
          labels: tc.labels,
          status: tc.status?.name,
          updatedOn: tc.updatedOn,
        })),
      );
    },
  };
}
