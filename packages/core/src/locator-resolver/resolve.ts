import type { Locator } from "@playwright/test";
import type { Logger } from "../logger/Logger.js";
import { buildLocator, probe, STRATEGY_ORDER } from "./strategies.js";
import { captureAndSuggestRepair, NoopAiRepairProvider } from "./ai-repair.js";
import { appendVectorHealingSuggestion, buildSuggestedPatch } from "./vector-healing.js";
import { buildLocatorFromRecipe, snapshotElement, snapshotInteractiveElements } from "./dom-snapshot.js";
import type { LocatorDescriptor, ResolveOptions, ResolverDeps } from "./types.js";

const DEFAULT_PROBE_TIMEOUT_MS = 1_000;
const DEFAULT_MIN_CONFIDENCE = 0.85;

export class LocatorResolutionError extends Error {
  constructor(descriptor: LocatorDescriptor) {
    super(
      `LocatorResolver exhausted all strategies for "${descriptor.fallbackLabel}" ` +
        `(tried: ${STRATEGY_ORDER.filter((s) => strategyApplies(descriptor, s)).join(", ")})`,
    );
    this.name = "LocatorResolutionError";
  }
}

function strategyApplies(descriptor: LocatorDescriptor, strategy: (typeof STRATEGY_ORDER)[number]): boolean {
  if (strategy === "testId") return descriptor.testId !== undefined;
  if (strategy === "role") return descriptor.role !== undefined;
  return descriptor.text !== undefined;
}

/**
 * Tries data-testid -> role+name -> text, in that order, returning the first
 * strategy that finds a match. Every attempt is logged (debug per try, info for
 * the winning strategy — this trail is the "selector health" signal the `audit`
 * skill aggregates) and a warn is logged when every strategy is exhausted, before
 * the optional AI-repair hook fires.
 */
export function createLocatorResolver(deps: ResolverDeps, logger: Logger): Resolve {
  const resolve = async (
    descriptor: LocatorDescriptor,
    opts: ResolveOptions = {},
  ): Promise<Locator> => {
    const root = deps.scope ?? deps.page;
    const timeoutMs = opts.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;

    for (const strategy of STRATEGY_ORDER) {
      if (!strategyApplies(descriptor, strategy)) continue;
      const locator = buildLocator(root, descriptor, strategy);
      if (!locator) continue;

      logger.debug("locator-resolver: attempting strategy", {
        strategy,
        label: descriptor.fallbackLabel,
      });

      if (await probe(locator, timeoutMs)) {
        logger.info("locator-resolver: resolved", { strategy, label: descriptor.fallbackLabel });
        if (opts.vectorHealing?.enabled) {
          await captureSuccessSnapshot(locator, descriptor, opts.vectorHealing.provider, logger);
        }
        return locator;
      }
    }

    logger.warn("locator-resolver: exhausted all strategies", {
      label: descriptor.fallbackLabel,
    });

    const provider = opts.aiRepair?.enabled ? opts.aiRepair.provider : new NoopAiRepairProvider();
    const suggestion = await captureAndSuggestRepair(deps.page, descriptor, provider);
    if (suggestion) {
      logger.warn("locator-resolver: AI-repair suggestion recorded (advisory only)", {
        label: descriptor.fallbackLabel,
        suggestedSelector: suggestion.suggestedSelector,
        confidence: suggestion.confidence,
      });
    }

    if (opts.vectorHealing?.enabled) {
      const healed = await attemptVectorHeal(deps, descriptor, opts.vectorHealing, timeoutMs, logger);
      if (healed) return healed;
    }

    throw new LocatorResolutionError(descriptor);
  };

  (resolve as Resolve).within = (scope: Locator) => createLocatorResolver({ page: deps.page, scope }, logger);

  return resolve as Resolve;
}

export interface Resolve {
  (descriptor: LocatorDescriptor, opts?: ResolveOptions): Promise<Locator>;
  /** Scope subsequent resolutions to a sub-tree — used by BaseComponent. */
  within(scope: Locator): Resolve;
}

/**
 * Fire-and-forget from the caller's perspective: a capture failure (e.g. the element detached
 * between the probe and the snapshot) must never fail the test that just successfully resolved
 * its locator, so every error is caught and logged rather than propagated.
 */
async function captureSuccessSnapshot(
  locator: Locator,
  descriptor: LocatorDescriptor,
  provider: NonNullable<ResolveOptions["vectorHealing"]>["provider"],
  logger: Logger,
): Promise<void> {
  try {
    const snapshot = await snapshotElement(locator);
    await provider.captureOnSuccess({ descriptor, snapshot });
  } catch (error) {
    logger.warn("locator-resolver: vector-healing capture failed (non-fatal)", {
      label: descriptor.fallbackLabel,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Called only once every static strategy is exhausted. Snapshots every currently-interactive
 * element, asks the provider for the closest semantic match against what was captured on the
 * last success, records a confidence-scored suggestion either way, and — only when the caller
 * has explicitly opted into `autoExecute` *and* the match clears `minConfidence` — hands back a
 * substitute `Locator` instead of letting `resolve()` throw.
 */
async function attemptVectorHeal(
  deps: ResolverDeps,
  descriptor: LocatorDescriptor,
  vectorHealing: NonNullable<ResolveOptions["vectorHealing"]>,
  timeoutMs: number,
  logger: Logger,
): Promise<Locator | null> {
  try {
    const candidates = await snapshotInteractiveElements(deps.page);
    const result = await vectorHealing.provider.attemptHeal({ descriptor, candidates });
    if (!result) return null;

    const minConfidence = vectorHealing.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
    const confidencePercent = Math.round(result.confidence * 100);
    const meetsThreshold = result.confidence >= minConfidence;
    const autoExecuted = meetsThreshold && vectorHealing.autoExecute === true;

    await appendVectorHealingSuggestion({
      fallbackLabel: descriptor.fallbackLabel,
      descriptor,
      recipe: result.candidate.recipe,
      confidence: result.confidence,
      autoExecuted,
      suggestedPatch: buildSuggestedPatch(descriptor, result.candidate.recipe),
      timestamp: new Date().toISOString(),
    });

    logger.warn(
      autoExecuted
        ? "locator-resolver: vector-healing AUTO-HEALED — interacting with a substitute element"
        : "locator-resolver: vector-healing found a candidate match (advisory only, not applied)",
      { label: descriptor.fallbackLabel, confidencePercent, meetsThreshold, autoExecuted },
    );

    if (!autoExecuted) return null;

    const root = deps.scope ?? deps.page;
    const healedLocator = buildLocatorFromRecipe(root, result.candidate.recipe);
    if (await probe(healedLocator, timeoutMs)) {
      return healedLocator;
    }
    logger.warn("locator-resolver: vector-healing candidate vanished before it could be used", {
      label: descriptor.fallbackLabel,
    });
    return null;
  } catch (error) {
    logger.warn("locator-resolver: vector-healing attempt failed, falling back to throwing", {
      label: descriptor.fallbackLabel,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
