import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { ElementSnapshot, HealCandidate, HealCandidateRecipe, LocatorDescriptor } from "@qaf/core";
import { createVectorHealingProvider } from "./vector-healing-provider.js";
import { LocalJsonlVectorStore } from "../vector-store/local-jsonl-store.js";
import type { EmbeddingProvider } from "../embedding/types.js";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "qaf-vector-healing-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function snapshot(overrides: Partial<ElementSnapshot> = {}): ElementSnapshot {
  return {
    tag: "button",
    textContent: "",
    ariaLabel: null,
    role: null,
    testId: null,
    boundingBox: null,
    parentTag: null,
    parentTestId: null,
    childTags: [],
    neighborText: [],
    ...overrides,
  };
}

const descriptor: LocatorDescriptor = { testId: "submit", fallbackLabel: "submit button" };

/** Deterministic stand-in for a real embedding model: one-hot on a marker substring. */
class OneHotEmbeddingProvider implements EmbeddingProvider {
  readonly id = "fake:one-hot";
  readonly dimensions = 2;
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => (t.includes("MATCH-MARKER") ? [1, 0] : [0, 1]));
  }
}

test("attemptHeal returns null when nothing has ever been captured for this descriptor", async () => {
  await withTempDir(async (dir) => {
    const provider = createVectorHealingProvider({
      embeddingProvider: new OneHotEmbeddingProvider(),
      vectorStore: new LocalJsonlVectorStore(dir),
    });
    const candidates: HealCandidate[] = [
      { snapshot: snapshot({ textContent: "MATCH-MARKER" }), recipe: { kind: "testId", value: "a" } },
    ];
    const result = await provider.attemptHeal({ descriptor, candidates });
    assert.equal(result, null);
  });
});

test("attemptHeal returns null when there are no live candidates at all", async () => {
  await withTempDir(async (dir) => {
    const provider = createVectorHealingProvider({
      embeddingProvider: new OneHotEmbeddingProvider(),
      vectorStore: new LocalJsonlVectorStore(dir),
    });
    const result = await provider.attemptHeal({ descriptor, candidates: [] });
    assert.equal(result, null);
  });
});

test("captureOnSuccess persists the winning snapshot's vector under a stable, descriptor-derived id", async () => {
  await withTempDir(async (dir) => {
    const store = new LocalJsonlVectorStore(dir);
    const provider = createVectorHealingProvider({ embeddingProvider: new OneHotEmbeddingProvider(), vectorStore: store });

    await provider.captureOnSuccess({ descriptor, snapshot: snapshot({ textContent: "MATCH-MARKER" }) });

    const stored = await store.all("locator");
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.id, "locator:submit button");
    assert.deepEqual(stored[0]?.vector, [1, 0]);
  });
});

test("attemptHeal finds the closest semantic match among live candidates and returns its recipe + confidence", async () => {
  await withTempDir(async (dir) => {
    const embeddingProvider = new OneHotEmbeddingProvider();
    const store = new LocalJsonlVectorStore(dir);
    const provider = createVectorHealingProvider({ embeddingProvider, vectorStore: store });

    await provider.captureOnSuccess({ descriptor, snapshot: snapshot({ textContent: "MATCH-MARKER" }) });

    const candidates: HealCandidate[] = [
      { snapshot: snapshot({ textContent: "unrelated" }), recipe: { kind: "testId", value: "decoy" } },
      {
        snapshot: snapshot({ textContent: "MATCH-MARKER" }),
        recipe: { kind: "testId", value: "renamed-submit" },
      },
    ];

    const result = await provider.attemptHeal({ descriptor, candidates });
    assert.ok(result);
    assert.equal((result?.candidate.recipe as HealCandidateRecipe & { kind: "testId" }).value, "renamed-submit");
    assert.ok(result && result.confidence > 0.99);
  });
});
