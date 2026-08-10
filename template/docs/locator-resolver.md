# The Locator Resolver

The safe default in this framework is two honest things — resilient fallback strategies plus
visible drift logging — plus an optional, genuinely-AI-assisted repair *suggestion* step that's
advisory only (Playwright itself has no built-in self-healing). Everything through the AI-repair
section below never changes what a test does. Beyond that, an explicit second opt-in — vector-based
healing — *can* auto-execute at runtime (substitute a different element for the one a test
named); it's real self-healing in the literal sense, gated behind its own env var, with the
tradeoffs spelled out before you flip it on.

## The fallback chain

```ts
const button = await resolve({
  testId: "submit-button",     // tried first
  role: { role: "button", name: "Submit" },  // tried if testId is absent/not found
  text: "Submit",              // tried last — most prone to drift, use sparingly
  fallbackLabel: "submit button", // for logs/errors when everything fails
});
```

Each strategy is tried in order (`data-testid` -> `role`+accessible name -> visible text),
with a short existence probe (not a long wait — this is a fallback chain, not a substitute
for Playwright's own auto-waiting). Every attempt is logged:

- `debug` — each strategy attempted
- `info` — which strategy actually resolved (this trail is the "selector health" signal the
  `audit` skill aggregates — if most of your resolutions are falling back to `role`/`text`,
  that's a sign the app is missing `data-testid` attributes it should have)
- `warn` — every strategy exhausted

## The AI-repair hook (opt-in, advisory only)

Set `QAF_AI_REPAIR_ENABLED=true` (and wire a real `AiRepairProvider` — `@qaf/core` ships
only a no-op default) to have a locator-resolution failure capture a DOM snapshot +
screenshot and ask an LLM for a suggested selector. The suggestion:

- Is written to `locator-repair-suggestions.jsonl` — nothing more.
- Is surfaced as a PR annotation by CI (`qaf-check-quarantine`'s CI step reads this file).
- **Is never retried in the same run, and never applied back to source automatically.**
  A human reads the suggestion and decides whether to update the page object.

To wire a real provider, implement `AiRepairProvider.suggest()` (see
`@qaf/core`'s `locator-resolver/types.ts`) and pass it via the `aiRepairProvider` worker
fixture override in this repo — e.g. an Anthropic-backed implementation that sends the DOM
snapshot to Claude with a prompt asking for a `data-testid`-preferring selector suggestion.

## Vector-based healing (opt-in, *can* auto-execute — read this before turning it on)

This is a second, separate hook — same provider-injection shape as AI-repair, but with a
materially different risk profile, so it has its own env vars instead of reusing
`QAF_AI_REPAIR_ENABLED`:

- On every successful resolution, `resolve()` fingerprints the winning element (tag, text,
  `aria-label`, role, `data-testid`, bounding box, parent/child tags, sibling text) and hands it
  to a `VectorHealingProvider.captureOnSuccess()`.
- When every static strategy is exhausted, it fingerprints every currently-interactive element on
  the page and calls `VectorHealingProvider.attemptHeal()`, which embeds both sides and returns
  the closest match by cosine similarity, if any.
- **Advisory-only by default.** `QAF_VECTOR_HEALING_ENABLED=true` turns on capture + matching;
  every match found — regardless of confidence — is logged (confidence %) and appended to
  `vector-healing-suggestions.jsonl` as a human-readable before/after patch. Nothing is applied.
- **`QAF_VECTOR_HEALING_AUTO_EXECUTE=true`** is the separate switch this repo's AI-repair hook
  deliberately does *not* have: a match scoring at or above `QAF_VECTOR_HEALING_MIN_CONFIDENCE`
  (default `0.85`) is used **in place of throwing** — the test keeps running against a
  *different* element than the one the page object named, with a `warn`-level "AUTO-HEALED" log
  line as the only signal it happened.

  **Know the tradeoff before enabling it:** a confidently-wrong semantic match makes a real UI
  regression look like a passing test. Turn this on only where a false pass is cheaper than a
  false pipeline break for that suite (e.g. a low-stakes smoke run), review
  `vector-healing-suggestions.jsonl` regularly, and prefer fixing the underlying `data-testid`
  drift over leaning on this long-term — same "this is a symptom, not a fix" posture as a high
  `role`/`text` fallback rate in the resolver's own health signal.

`@qaf/core` ships only `NoopVectorHealingProvider` (heals nothing). The real, embedding-backed
implementation is `@qaf/rag-core`'s `createVectorHealingProvider()` — it reuses that package's
existing `EmbeddingProvider`/`VectorStore`/`cosineSimilarity` primitives (a `"locator"` vector
namespace, `LocalJsonlVectorStore` by default) rather than a separate vector-math stack, and
follows the identical no-default-API-key posture as RAG indexing (see docs/rag-coverage.md). Wire
it via the `vectorHealingProvider` worker fixture override, e.g.:

```ts
import { createVectorHealingProvider } from "@qaf/rag-core";

vectorHealingProvider: [
  async ({}, use) => {
    await use(createVectorHealingProvider({ embeddingProvider: myOpenAiOrOllamaProvider }));
  },
  { scope: "worker" },
],
```

## Adding a component with repeated locators

`BaseComponent` scopes resolution to its root locator (`resolve.within(root)`), so a
`data-testid` that repeats identically across many instances (e.g. every row of a table)
still resolves correctly per-instance — see
`tests/web/pages/components/TodoItemRow.ts` for the reference example.
