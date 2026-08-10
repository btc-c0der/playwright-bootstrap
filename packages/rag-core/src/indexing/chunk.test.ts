import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkDocument } from "./chunk.js";
import type { SourceDocument } from "../sources/types.js";

function specDoc(text: string, overrides: Partial<SourceDocument> = {}): SourceDocument {
  return { id: "spec:a.md", namespace: "spec", title: "A", text, metadata: {}, ...overrides };
}

test("a short doc stays as a single chunk with the doc's own id", () => {
  const chunks = chunkDocument(specDoc("short text"));
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0]?.id, "spec:a.md");
  assert.equal(chunks[0]?.sourceId, "spec:a.md");
});

test("a long spec doc is split by heading, each chunk id suffixed by index", () => {
  const heading = (n: number) => `## Section ${n}\n\n${"x".repeat(3000)}`;
  const text = [heading(1), heading(2), heading(3)].join("\n\n");
  const chunks = chunkDocument(specDoc(text), { maxChars: 4000 });
  assert.ok(chunks.length > 1);
  assert.equal(chunks[0]?.id, "spec:a.md#0");
  assert.equal(chunks[0]?.metadata.title, "Section 1");
});

test("non-heading-chunked namespaces (e.g. test) are never split regardless of length", () => {
  const doc: SourceDocument = {
    id: "test:1",
    namespace: "test",
    title: "T",
    text: "x".repeat(10_000),
    metadata: {},
  };
  const chunks = chunkDocument(doc, { maxChars: 100 });
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0]?.id, "test:1");
});

test("adjacent small sections are merged rather than producing near-empty chunks", () => {
  const text = "## A\n\nshort\n\n## B\n\nalso short\n\n## C\n\nstill short";
  const chunks = chunkDocument(specDoc(text, { text: "x".repeat(4001) + "\n\n" + text }), {
    maxChars: 4000,
  });
  // The oversized first section forces splitting, but the three tiny headed
  // sections that follow should merge into one chunk, not three.
  const smallChunks = chunks.filter((c) => c.text.length < 200);
  assert.ok(
    smallChunks.length <= 1,
    `expected small sections to merge, got ${smallChunks.length} separate chunks`,
  );
});

test("contentHash is stable for identical text and differs when text changes", () => {
  const a = chunkDocument(specDoc("same text"))[0];
  const b = chunkDocument(specDoc("same text"))[0];
  const c = chunkDocument(specDoc("different text"))[0];
  assert.equal(a?.contentHash, b?.contentHash);
  assert.notEqual(a?.contentHash, c?.contentHash);
});
