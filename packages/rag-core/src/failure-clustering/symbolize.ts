import type { FailureRecord } from "./types.js";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ISO_TIMESTAMP_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g;
const HEX_ADDRESS_RE = /\b0x[0-9a-f]+\b/gi;
/** `/abs/path/to/file.ts:123:45` or `C:\path\to\file.ts:123:45` — captures the path so it can be relativized. */
const FILE_LINE_COL_RE = /((?:[A-Za-z]:)?[/\\][\w. /\\-]+?):(\d+):(\d+)/g;
/** Any remaining multi-segment absolute-looking path with no trailing :line:col. */
const BARE_ABSOLUTE_PATH_RE = /(?:[A-Za-z]:)?(?:[/\\][\w.-]+){2,}/g;

/**
 * Canonicalizes a raw error message + stack trace into a stable signature
 * before embedding. Without this, two CI occurrences of the *same* root
 * cause look "unique" to a naive embedding, because line numbers,
 * timestamps, temp paths, and object addresses dominate lexical/semantic
 * distance far more than the actual call shape and error text do (see
 * docs/rag-coverage-plan.md's "Why symbolize before embedding").
 *
 * Deliberately does NOT strip arbitrary numbers (e.g. "expected 3 got 5") —
 * only tokens that are volatile *by construction* (timestamps, UUIDs,
 * addresses, source locations). Over-stripping collapses genuinely distinct
 * errors together; under-stripping never clusters anything. Tune here first
 * against real failure samples, not synthetically.
 */
export function symbolizeFailure(record: FailureRecord): string {
  const raw = `${record.errorMessage}\n${record.stackTrace}`;
  let text = raw;
  text = text.replace(UUID_RE, "<uuid>");
  text = text.replace(ISO_TIMESTAMP_RE, "<timestamp>");
  text = text.replace(HEX_ADDRESS_RE, "<addr>");
  text = text.replace(
    FILE_LINE_COL_RE,
    (_match, filePath: string) => `${relativize(filePath)}:<line>:<col>`,
  );
  text = text.replace(BARE_ABSOLUTE_PATH_RE, (match) => relativize(match));
  return normalizeWhitespace(text);
}

/** Keeps the last two path segments (dir/file) — enough to identify *what* failed without absolute-path noise. */
function relativize(rawPath: string): string {
  const parts = rawPath.split(/[\\/]+/).filter(Boolean);
  return parts.slice(-2).join("/");
}

function normalizeWhitespace(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}
