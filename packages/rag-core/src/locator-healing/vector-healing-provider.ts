import { createHash } from "node:crypto";
import type {
  ElementSnapshot,
  HealCandidate,
  LocatorDescriptor,
  VectorHealResult,
  VectorHealingProvider,
} from "@qaf/core";
import type { EmbeddingProvider } from "../embedding/types.js";
import type { VectorRecord, VectorStore } from "../vector-store/types.js";
import { cosineSimilarity } from "../vector-store/similarity.js";
import { LocalJsonlVectorStore } from "../vector-store/local-jsonl-store.js";

export interface VectorHealingProviderOptions {
  /** No default — an embedding call is opt-in and needs a real model, same posture as indexing. */
  embeddingProvider: EmbeddingProvider;
  /** Defaults to a `LocalJsonlVectorStore` rooted at `.qaf/vector-index` (namespace `"locator"`). */
  vectorStore?: VectorStore;
}

/**
 * The concrete, embedding-backed `VectorHealingProvider` this package exists to provide —
 * `@qaf/core` only ships the interface + a no-op default (see `locator-resolver/vector-healing.ts`
 * there). Reuses this package's existing `EmbeddingProvider`/`VectorStore`/`cosineSimilarity`
 * primitives rather than introducing a second vector-math implementation: a "locator" fingerprint
 * and a "spec"/"test" chunk are both just "text -> vector -> compare", the namespace is what
 * keeps them from being compared against each other.
 */
export function createVectorHealingProvider(options: VectorHealingProviderOptions): VectorHealingProvider {
  const embeddingProvider = options.embeddingProvider;
  const store = options.vectorStore ?? new LocalJsonlVectorStore();

  return {
    async captureOnSuccess({ descriptor, snapshot }): Promise<void> {
      const text = describeSnapshot(snapshot);
      const [vector] = await embeddingProvider.embed([text]);
      if (!vector) return;

      const record: VectorRecord = {
        id: recordId(descriptor),
        namespace: "locator",
        vector,
        // The descriptor is the "fallback selectors" requirement 1 asks to be stored alongside
        // the vector — advisory context for the suggestion patch, never read back to re-resolve.
        metadata: { descriptor: serializeDescriptor(descriptor), snapshot },
        contentHash: hashText(text),
        embeddingId: embeddingProvider.id,
        indexedAt: new Date().toISOString(),
      };
      await store.upsert([record]);
    },

    async attemptHeal({ descriptor, candidates }): Promise<VectorHealResult | null> {
      if (candidates.length === 0) return null;

      const stored = (await store.all("locator")).find((r) => r.id === recordId(descriptor));
      // Nothing was ever captured for this descriptor (first-ever failure, or a brand-new
      // locator) — there's no "good" fingerprint to compare live candidates against.
      if (!stored) return null;

      // One batched embed call for every live candidate, not one call per candidate — same
      // cost-control instinct as indexing/index.ts's batching.
      const vectors = await embeddingProvider.embed(candidates.map((c) => describeSnapshot(c.snapshot)));

      let best: { candidate: HealCandidate; score: number } | null = null;
      for (let i = 0; i < candidates.length; i++) {
        const vector = vectors[i];
        const candidate = candidates[i];
        if (!vector || !candidate) continue;
        const score = cosineSimilarity(stored.vector, vector);
        if (!best || score > best.score) best = { candidate, score };
      }

      return best ? { candidate: best.candidate, confidence: best.score } : null;
    },
  };
}

function recordId(descriptor: LocatorDescriptor): string {
  return `locator:${descriptor.fallbackLabel}`;
}

/**
 * Turns an `ElementSnapshot` into the text that actually gets embedded — tag, visible text,
 * accessible-name hints, and the parent/child/neighbor hierarchy the requirements ask for, in
 * one normalized string so semantically-similar elements land close together in vector space
 * regardless of which specific attribute drifted.
 */
function describeSnapshot(snapshot: ElementSnapshot): string {
  const parts = [
    `tag:${snapshot.tag}`,
    snapshot.testId ? `testId:${snapshot.testId}` : "",
    snapshot.ariaLabel ? `ariaLabel:${snapshot.ariaLabel}` : "",
    snapshot.role ? `role:${snapshot.role}` : "",
    snapshot.textContent ? `text:${snapshot.textContent}` : "",
    snapshot.parentTag ? `parent:${snapshot.parentTag}${snapshot.parentTestId ? `#${snapshot.parentTestId}` : ""}` : "",
    snapshot.childTags.length ? `children:${snapshot.childTags.join(",")}` : "",
    snapshot.neighborText.length ? `neighbors:${snapshot.neighborText.join(" | ")}` : "",
  ];
  return parts.filter((p) => p.length > 0).join(" ");
}

function serializeDescriptor(descriptor: LocatorDescriptor): Record<string, unknown> {
  return {
    testId: descriptor.testId,
    role: descriptor.role ? { role: descriptor.role.role, name: String(descriptor.role.name ?? "") } : undefined,
    text: descriptor.text !== undefined ? String(descriptor.text) : undefined,
    fallbackLabel: descriptor.fallbackLabel,
  };
}

function hashText(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}
