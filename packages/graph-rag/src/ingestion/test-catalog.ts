import { readFile } from "node:fs/promises";
import { nodeId, parseNodeRef } from "../graph/types.js";
import type { GraphEdge, GraphNode } from "../graph/types.js";
import { mergeResults } from "./types.js";
import type { IngestResult } from "./types.js";

export interface TestCatalogIngestOptions {
  /** Spec file paths to scan, e.g. from a glob over `tests/**\/*.spec.ts`. */
  files: string[];
  /** Override for testing — bypasses the filesystem read. */
  readFile?: (file: string) => Promise<string>;
}

const TEST_CALL_RE = /\btest(?:\.only|\.skip|\.fixme)?\s*\(\s*(['"`])((?:(?!\1).)*)\1/g;
/** A single JSDoc comment line's decoration (opening/leading/closing asterisks) stripped before matching `@covers`. */
const COMMENT_DECORATION_RE = /^\s*\/?\*+\/?\s?/;
/** JSDoc form: `@covers <nodeRef>` — one directive per line, rest-of-line is the ref (endpoint refs legitimately contain a space, e.g. `endpoint:orders-service:POST /orders`). */
const JSDOC_COVERS_RE = /^@covers[:\s]+(.+)$/;
/** Inline tag-array form: a whole tag string is `"@covers:<nodeRef>"`, Playwright's own `@tag` convention — delimited by its own quotes, so no rest-of-line ambiguity with sibling tags. */
const INLINE_COVERS_RE = /["'`]@covers:([^"'`]+)["'`]/g;

/**
 * Scans raw test-file source (not `playwright --list` output, unlike
 * `@qaf/rag-core`'s `sources/test-catalog.ts`) for `@covers <nodeRef>`
 * directives — either in a JSDoc block comment immediately preceding a
 * `test(...)` call, or as an inline tag (`test("...", { tag:
 * ["@covers:service:x"] }, ...)`). Deliberately regex-based rather than a
 * full TS AST parse — same spirit as `@qaf/rag-core`'s `extractTags` — so
 * this package doesn't add a TypeScript-parsing dependency for what's
 * fundamentally a text scan; a test title that happens to contain
 * `@covers:...` outside a comment/tag would false-positive, an accepted
 * tradeoff for zero dependencies.
 *
 * One `TestCase` node per matched `test(...)` call, keyed by
 * `${file}::${title}` (only the literal title, not `describe` nesting — two
 * identically-titled tests in different `describe` blocks in the *same* file
 * collide; name tests uniquely per file if that matters for your suite). One
 * `TestCase -COVERS_TEST-> <target>` edge per resolvable directive;
 * directives with an unknown ref prefix are dropped, not guessed at.
 */
export async function ingestTestCatalog(options: TestCatalogIngestOptions): Promise<IngestResult> {
  const read = options.readFile ?? ((file: string) => readFile(file, "utf-8"));
  const results = await Promise.all(
    options.files.map(async (file) => ingestFile(file, await read(file))),
  );
  return mergeResults(results);
}

function ingestFile(file: string, source: string): IngestResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenTestIds = new Set<string>();

  for (const match of source.matchAll(TEST_CALL_RE)) {
    const title = match[2];
    if (title === undefined || match.index === undefined) continue;

    const docComment = lastBlockComment(source.slice(0, match.index));
    const callSource = source.slice(match.index, findCallEnd(source, match.index));
    const refs = [
      ...extractCoversRefsFromComment(docComment ?? ""),
      ...extractCoversRefsFromInlineTags(callSource),
    ];

    const testId = nodeId.test(file, title);
    if (!seenTestIds.has(testId)) {
      seenTestIds.add(testId);
      nodes.push({ id: testId, type: "TestCase", label: title, metadata: { file } });
    }
    for (const ref of refs) {
      const parsed = parseNodeRef(ref);
      if (!parsed) continue;
      edges.push({ from: testId, to: parsed.id, type: "COVERS_TEST" });
    }
  }

  return { nodes, edges };
}

function extractCoversRefsFromComment(comment: string): string[] {
  const refs: string[] = [];
  for (const rawLine of comment.split("\n")) {
    const line = rawLine.replace(COMMENT_DECORATION_RE, "").trim();
    const match = JSDOC_COVERS_RE.exec(line);
    if (match) refs.push(match[1]!.trim());
  }
  return refs;
}

function extractCoversRefsFromInlineTags(callSource: string): string[] {
  return [...callSource.matchAll(INLINE_COVERS_RE)].map((m) => m[1]!.trim());
}

/** The nearest JSDoc block comment ending at (or just before) `textBeforeCall`'s end, or `undefined` if the preceding non-blank content isn't a comment. */
function lastBlockComment(textBeforeCall: string): string | undefined {
  const trimmed = textBeforeCall.replace(/\s+$/, "");
  const end = trimmed.lastIndexOf("*/");
  if (end === -1 || end !== trimmed.length - 2) return undefined;
  const start = trimmed.lastIndexOf("/**");
  if (start === -1) return undefined;
  return trimmed.slice(start, end + 2);
}

/** A cheap paren-depth scan from a `test(` call's start to its matching close — enough to bound the inline-tag search without a real parser. */
function findCallEnd(source: string, callStart: number): number {
  let depth = 0;
  for (let i = callStart; i < source.length; i++) {
    if (source[i] === "(") depth++;
    if (source[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length;
}
