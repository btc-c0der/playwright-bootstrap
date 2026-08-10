import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { indexDocuments } from "./index.js";
import { LocalJsonlVectorStore } from "../vector-store/local-jsonl-store.js";
import type { EmbeddingProvider } from "../embedding/types.js";
import type { DocumentSource, SourceDocument } from "../sources/types.js";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "qaf-rag-index-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function fakeProvider(): EmbeddingProvider & { calls: string[][] } {
  return {
    id: "fake:v1",
    dimensions: 2,
    calls: [] as string[][],
    async embed(texts: string[]) {
      this.calls.push(texts);
      // deterministic per-text vector so equal text -> equal vector
      return texts.map((t) => [t.length, t.length % 7]);
    },
  };
}

function sourceOf(docs: SourceDocument[]): DocumentSource {
  return {
    namespace: docs[0]?.namespace ?? "spec",
    async fetch() {
      return docs;
    },
  };
}

test("first run embeds every fetched doc and reports zero skipped/deleted", async () => {
  await withTempDir(async (dir) => {
    const provider = fakeProvider();
    const store = new LocalJsonlVectorStore(dir);
    const docs: SourceDocument[] = [
      { id: "spec:a", namespace: "spec", title: "A", text: "alpha", metadata: {} },
      { id: "spec:b", namespace: "spec", title: "B", text: "beta", metadata: {} },
    ];

    const summaries = await indexDocuments({
      sources: [sourceOf(docs)],
      embeddingProvider: provider,
      vectorStore: store,
    });

    assert.equal(summaries[0]?.fetched, 2);
    assert.equal(summaries[0]?.embedded, 2);
    assert.equal(summaries[0]?.skippedUnchanged, 0);
    assert.equal(summaries[0]?.deleted, 0);
    assert.equal(provider.calls.length, 1); // one batch call for both

    const stored = await store.all("spec");
    assert.equal(stored.length, 2);
  });
});

test("a second run with unchanged content skips re-embedding entirely", async () => {
  await withTempDir(async (dir) => {
    const provider = fakeProvider();
    const store = new LocalJsonlVectorStore(dir);
    const docs: SourceDocument[] = [
      { id: "spec:a", namespace: "spec", title: "A", text: "alpha", metadata: {} },
    ];
    const source = sourceOf(docs);

    await indexDocuments({ sources: [source], embeddingProvider: provider, vectorStore: store });
    provider.calls.length = 0;

    const summaries = await indexDocuments({
      sources: [source],
      embeddingProvider: provider,
      vectorStore: store,
    });
    assert.equal(summaries[0]?.embedded, 0);
    assert.equal(summaries[0]?.skippedUnchanged, 1);
    assert.equal(provider.calls.length, 0);
  });
});

test("changed content re-embeds only the changed doc, leaves the unchanged one alone", async () => {
  await withTempDir(async (dir) => {
    const provider = fakeProvider();
    const store = new LocalJsonlVectorStore(dir);
    const v1: SourceDocument[] = [
      { id: "spec:a", namespace: "spec", title: "A", text: "alpha", metadata: {} },
      { id: "spec:b", namespace: "spec", title: "B", text: "beta", metadata: {} },
    ];
    await indexDocuments({
      sources: [sourceOf(v1)],
      embeddingProvider: provider,
      vectorStore: store,
    });
    provider.calls.length = 0;

    const v2: SourceDocument[] = [
      { id: "spec:a", namespace: "spec", title: "A", text: "alpha changed", metadata: {} },
      { id: "spec:b", namespace: "spec", title: "B", text: "beta", metadata: {} },
    ];
    const summaries = await indexDocuments({
      sources: [sourceOf(v2)],
      embeddingProvider: provider,
      vectorStore: store,
    });

    assert.equal(summaries[0]?.embedded, 1);
    assert.equal(summaries[0]?.skippedUnchanged, 1);
    assert.deepEqual(provider.calls[0], ["alpha changed"]);
  });
});

test("a doc removed from the source is deleted from the store", async () => {
  await withTempDir(async (dir) => {
    const provider = fakeProvider();
    const store = new LocalJsonlVectorStore(dir);
    const v1: SourceDocument[] = [
      { id: "spec:a", namespace: "spec", title: "A", text: "alpha", metadata: {} },
      { id: "spec:b", namespace: "spec", title: "B", text: "beta", metadata: {} },
    ];
    await indexDocuments({
      sources: [sourceOf(v1)],
      embeddingProvider: provider,
      vectorStore: store,
    });

    const v2: SourceDocument[] = [
      { id: "spec:a", namespace: "spec", title: "A", text: "alpha", metadata: {} },
    ];
    const summaries = await indexDocuments({
      sources: [sourceOf(v2)],
      embeddingProvider: provider,
      vectorStore: store,
    });

    assert.equal(summaries[0]?.deleted, 1);
    const stored = await store.all("spec");
    assert.deepEqual(
      stored.map((r) => r.id),
      ["spec:a"],
    );
  });
});

test("a model change (different embeddingProvider.id) forces re-embedding even with identical text", async () => {
  await withTempDir(async (dir) => {
    const store = new LocalJsonlVectorStore(dir);
    const docs: SourceDocument[] = [
      { id: "spec:a", namespace: "spec", title: "A", text: "alpha", metadata: {} },
    ];
    const providerV1 = fakeProvider();
    await indexDocuments({
      sources: [sourceOf(docs)],
      embeddingProvider: providerV1,
      vectorStore: store,
    });

    const providerV2 = { ...fakeProvider(), id: "fake:v2" };
    const summaries = await indexDocuments({
      sources: [sourceOf(docs)],
      embeddingProvider: providerV2,
      vectorStore: store,
    });
    assert.equal(summaries[0]?.embedded, 1);
    assert.equal(summaries[0]?.skippedUnchanged, 0);
  });
});

test("throws instead of silently corrupting the index if a provider returns the wrong vector count", async () => {
  await withTempDir(async (dir) => {
    const store = new LocalJsonlVectorStore(dir);
    const badProvider: EmbeddingProvider = {
      id: "bad",
      dimensions: 2,
      async embed(texts: string[]) {
        return texts.slice(1).map(() => [0, 0]); // one short
      },
    };
    const docs: SourceDocument[] = [
      { id: "spec:a", namespace: "spec", title: "A", text: "alpha", metadata: {} },
      { id: "spec:b", namespace: "spec", title: "B", text: "beta", metadata: {} },
    ];
    await assert.rejects(
      () =>
        indexDocuments({
          sources: [sourceOf(docs)],
          embeddingProvider: badProvider,
          vectorStore: store,
        }),
      /returned 1 vectors for 2 texts/,
    );
  });
});
