import type { Page } from "@playwright/test";
import { createLocatorResolver, type Resolve } from "../locator-resolver/resolve.js";
import { NoopAiRepairProvider } from "../locator-resolver/ai-repair.js";
import { NoopVectorHealingProvider } from "../locator-resolver/vector-healing.js";
import type { AiRepairProvider, VectorHealingProvider } from "../locator-resolver/types.js";
import type { Logger } from "../logger/Logger.js";

export interface LocatorResolverTestFixtures {
  resolve: Resolve;
}

export interface LocatorResolverWorkerFixtures {
  /** Override in a consuming repo's fixtures to wire a real AiRepairProvider. */
  aiRepairProvider: AiRepairProvider;
  aiRepairEnabled: boolean;
  /** Override in a consuming repo's fixtures to wire a real VectorHealingProvider (e.g. `@qaf/rag-core`'s `createVectorHealingProvider`). */
  vectorHealingProvider: VectorHealingProvider;
  vectorHealingEnabled: boolean;
  /**
   * Separate from `vectorHealingEnabled` on purpose: a team can capture snapshots and get
   * confidence-scored advisory suggestions without ever letting a run substitute a different
   * element for the one a test asked for — see docs/locator-resolver.md.
   */
  vectorHealingAutoExecute: boolean;
  vectorHealingMinConfidence: number;
}

// Empty destructuring is required (not a plain named param) — Playwright parses
// each fixture function's first-parameter pattern to know its dependencies.
export async function aiRepairProviderFixture(
  // eslint-disable-next-line no-empty-pattern
  {}: object,
  use: (provider: AiRepairProvider) => Promise<void>,
): Promise<void> {
  await use(new NoopAiRepairProvider());
}

export async function aiRepairEnabledFixture(
  // eslint-disable-next-line no-empty-pattern
  {}: object,
  use: (enabled: boolean) => Promise<void>,
): Promise<void> {
  await use(process.env.QAF_AI_REPAIR_ENABLED === "true");
}

export async function vectorHealingProviderFixture(
  // eslint-disable-next-line no-empty-pattern
  {}: object,
  use: (provider: VectorHealingProvider) => Promise<void>,
): Promise<void> {
  await use(new NoopVectorHealingProvider());
}

export async function vectorHealingEnabledFixture(
  // eslint-disable-next-line no-empty-pattern
  {}: object,
  use: (enabled: boolean) => Promise<void>,
): Promise<void> {
  await use(process.env.QAF_VECTOR_HEALING_ENABLED === "true");
}

export async function vectorHealingAutoExecuteFixture(
  // eslint-disable-next-line no-empty-pattern
  {}: object,
  use: (autoExecute: boolean) => Promise<void>,
): Promise<void> {
  await use(process.env.QAF_VECTOR_HEALING_AUTO_EXECUTE === "true");
}

export async function vectorHealingMinConfidenceFixture(
  // eslint-disable-next-line no-empty-pattern
  {}: object,
  use: (minConfidence: number) => Promise<void>,
): Promise<void> {
  const raw = process.env.QAF_VECTOR_HEALING_MIN_CONFIDENCE;
  const parsed = raw ? Number(raw) : NaN;
  await use(Number.isFinite(parsed) ? parsed : 0.85);
}

export async function resolveFixture(
  {
    page,
    logger,
    aiRepairProvider,
    aiRepairEnabled,
    vectorHealingProvider,
    vectorHealingEnabled,
    vectorHealingAutoExecute,
    vectorHealingMinConfidence,
  }: {
    page: Page;
    logger: Logger;
    aiRepairProvider: AiRepairProvider;
    aiRepairEnabled: boolean;
    vectorHealingProvider: VectorHealingProvider;
    vectorHealingEnabled: boolean;
    vectorHealingAutoExecute: boolean;
    vectorHealingMinConfidence: number;
  },
  use: (resolve: Resolve) => Promise<void>,
): Promise<void> {
  const resolve = createLocatorResolver({ page }, logger);
  const scopedResolve = ((descriptor, opts) =>
    resolve(descriptor, {
      ...opts,
      aiRepair: opts?.aiRepair ?? { enabled: aiRepairEnabled, provider: aiRepairProvider },
      vectorHealing: opts?.vectorHealing ?? {
        enabled: vectorHealingEnabled,
        provider: vectorHealingProvider,
        autoExecute: vectorHealingAutoExecute,
        minConfidence: vectorHealingMinConfidence,
      },
    })) as Resolve;
  scopedResolve.within = (scope) => resolve.within(scope);
  await use(scopedResolve);
}
