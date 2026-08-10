import type { Locator, Page } from "@playwright/test";

// Playwright doesn't export an `AriaRole` type alias directly — derive it from
// `getByRole`'s own first parameter so it always matches the installed version.
export type AriaRole = Parameters<Locator["getByRole"]>[0];

export interface LocatorDescriptor {
  /** Preferred: the value of the element's `data-testid` attribute. */
  testId?: string;
  /** Fallback 2: ARIA role + accessible name — resilient to markup churn. */
  role?: { role: AriaRole; name?: string | RegExp };
  /** Fallback 3: visible text — last resort, most prone to drift. */
  text?: string | RegExp;
  /** Human-readable label used in logs/errors when every strategy fails. */
  fallbackLabel: string;
}

export type StrategyName = "testId" | "role" | "text";

export interface StrategyAttempt {
  strategy: StrategyName;
  matched: boolean;
}

export interface RepairSuggestion {
  descriptor: LocatorDescriptor;
  fallbackLabel: string;
  suggestedSelector: string;
  confidence: number;
  rationale: string;
  file?: string;
  testTitle?: string;
  timestamp: string;
}

/**
 * Pluggable, opt-in AI-repair backend. `@qaf/core` ships only `NoopAiRepairProvider`
 * (see ai-repair.ts) — wiring a real LLM-backed provider is a consuming-repo choice
 * (docs/locator-resolver.md documents an Anthropic-backed example) so no test run
 * is forced to hold an API key it doesn't want.
 */
export interface AiRepairProvider {
  suggest(context: {
    descriptor: LocatorDescriptor;
    domSnapshot: string;
    screenshot: Buffer;
  }): Promise<RepairSuggestion | null>;
}

/**
 * A structural fingerprint of one element — tag/text/aria/geometry/hierarchy — captured
 * either right after a successful resolution (to remember what "good" looked like) or for
 * every currently-interactive element on the page (to search for the closest match once
 * every static strategy has failed). Deliberately plain data (no `Locator`/`Page`) so it can
 * be embedded, serialized to the vector store, and compared across runs/processes.
 */
export interface ElementSnapshot {
  tag: string;
  textContent: string;
  ariaLabel: string | null;
  role: string | null;
  testId: string | null;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  parentTag: string | null;
  parentTestId: string | null;
  childTags: string[];
  /** Trimmed text of immediate sibling elements — the "neighborhood" context. */
  neighborText: string[];
}

/**
 * A deterministic recipe for turning one live, on-page element back into a real Playwright
 * `Locator` — not a raw CSS/XPath string, which would itself be prone to the same drift this
 * module exists to survive. `"nth"` is the last-resort recipe (positional, most fragile) for
 * elements with no `data-testid`/accessible role+name.
 */
export type HealCandidateRecipe =
  | { kind: "testId"; value: string }
  | { kind: "role"; role: AriaRole; name?: string }
  | { kind: "nth"; tag: string; index: number };

export interface HealCandidate {
  snapshot: ElementSnapshot;
  recipe: HealCandidateRecipe;
}

export interface VectorHealResult {
  candidate: HealCandidate;
  /** Cosine similarity against the stored snapshot from the last successful capture, 0..1. */
  confidence: number;
}

/**
 * Pluggable, opt-in vector-healing backend — same provider-injection shape as
 * `AiRepairProvider`, but where `AiRepairProvider` only ever *suggests*, this one can be
 * wired to actually hand `resolve()` a substitute `Locator` at runtime (see
 * `ResolveOptions.vectorHealing.autoExecute`). `@qaf/core` ships only `NoopVectorHealingProvider`
 * (see vector-healing.ts); a real embedding-backed implementation lives in the opt-in
 * `@qaf/rag-core` package (`createVectorHealingProvider`) — docs/locator-resolver.md documents
 * wiring it in.
 */
export interface VectorHealingProvider {
  /** Called after a strategy resolves — persist the winning element's fingerprint. */
  captureOnSuccess(context: {
    descriptor: LocatorDescriptor;
    snapshot: ElementSnapshot;
  }): Promise<void>;

  /** Called once every static strategy is exhausted — find the closest live match, if any. */
  attemptHeal(context: {
    descriptor: LocatorDescriptor;
    candidates: HealCandidate[];
  }): Promise<VectorHealResult | null>;
}

export interface VectorHealingSuggestion {
  fallbackLabel: string;
  descriptor: LocatorDescriptor;
  recipe: HealCandidateRecipe;
  confidence: number;
  /** Whether this run actually interacted with the healed element instead of throwing. */
  autoExecuted: boolean;
  /** Human-readable before/after so the file reads like a review-ready diff, not raw JSON. */
  suggestedPatch: string;
  file?: string;
  testTitle?: string;
  timestamp: string;
}

export interface ResolveOptions {
  aiRepair?: {
    enabled: boolean;
    provider: AiRepairProvider;
  };
  vectorHealing?: {
    enabled: boolean;
    provider: VectorHealingProvider;
    /** Cosine-similarity floor to accept a match at all. Default 0.85. */
    minConfidence?: number;
    /**
     * When true, a match >= minConfidence is used in place of throwing
     * `LocatorResolutionError` — i.e. the test keeps running against a *different* element than
     * the one the descriptor named. Default false: capture + log + advisory suggestion only,
     * same "never silently changes what the test does" posture as `aiRepair`. Turn this on only
     * with eyes open — a confident but wrong match makes a real UI regression look like a pass.
     */
    autoExecute?: boolean;
  };
  /** Per-strategy probe timeout in ms. Kept short — this is a fallback chain, not a wait. */
  probeTimeoutMs?: number;
}

export interface ResolverDeps {
  page: Page;
  scope?: Locator;
}
