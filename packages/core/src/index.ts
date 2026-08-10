export { test, expect } from "./fixtures/index.js";
export type {
  LoggerTestFixtures,
  LoggerWorkerFixtures,
  ApiClient,
  ApiClientTestFixtures,
  DataFactory,
  DataFactoryTestFixtures,
  DataFactoryWorkerFixtures,
  LocatorResolverTestFixtures,
  LocatorResolverWorkerFixtures,
  AuthTestFixtures,
  AuthenticatedSession,
  SessionCookie,
} from "./fixtures/index.js";

export { Logger } from "./logger/Logger.js";
export type { LogFields } from "./logger/Logger.js";

export { BasePage } from "./pom/BasePage.js";
export { BaseComponent } from "./pom/BaseComponent.js";

export { createLocatorResolver, LocatorResolutionError } from "./locator-resolver/resolve.js";
export type { Resolve } from "./locator-resolver/resolve.js";
export { NoopAiRepairProvider } from "./locator-resolver/ai-repair.js";
export type {
  LocatorDescriptor,
  AiRepairProvider,
  RepairSuggestion,
  ResolveOptions,
  ElementSnapshot,
  HealCandidate,
  HealCandidateRecipe,
  VectorHealResult,
  VectorHealingProvider,
  VectorHealingSuggestion,
} from "./locator-resolver/types.js";
export {
  NoopVectorHealingProvider,
  appendVectorHealingSuggestion,
  readVectorHealingSuggestions,
  buildSuggestedPatch,
} from "./locator-resolver/vector-healing.js";
export {
  snapshotElement,
  snapshotInteractiveElements,
  buildLocatorFromRecipe,
} from "./locator-resolver/dom-snapshot.js";

export { buildWorkerNamespace, buildTestNamespace } from "./data/namespace.js";
export { TeardownStack } from "./data/teardown.js";
export type { TrackedResource, TeardownFailure } from "./data/teardown.js";
export { createUserFactory } from "./data/factories/index.js";
export type { TestUser, CreateUserOptions } from "./data/factories/index.js";

export {
  loadManifest,
  saveManifest,
  emptyManifest,
  activeEntries,
  expiredEntries,
  buildEntryId,
  DEFAULT_MANIFEST_PATH,
} from "./quarantine/manifest.js";
export type {
  QuarantineManifest,
  QuarantineEntry,
  QuarantineCeiling,
  QuarantineStatus,
} from "./quarantine/manifest.js";
export { checkCeiling } from "./quarantine/ceiling.js";
export type { CeilingCheckResult } from "./quarantine/ceiling.js";
export { checkSync } from "./quarantine/sync-check.js";
export type { DiscoveredQuarantinedTest, SyncCheckResult } from "./quarantine/sync-check.js";
export {
  annotateCeilingResult,
  annotateRepairSuggestion,
  annotateSyncResult,
  readRepairSuggestions,
} from "./quarantine/annotate.js";
export { default as HistoryReporter } from "./quarantine/reporter.js";
export type { TestRunRecord } from "./quarantine/reporter.js";

export { analyzeFlakiness } from "./reporters/flaky-report.js";
export type { FlakeCandidate } from "./reporters/flaky-report.js";
export { buildHealthReportMarkdown } from "./reporters/health-report.js";
export type { HealthReportInputs } from "./reporters/health-report.js";

export { expectMatchesBaseline } from "./visual/toMatchBaseline.js";
export { DEFAULT_VISUAL_POLICY, isCanonicalVisualProject } from "./visual/policy.js";
export type { VisualPolicy } from "./visual/policy.js";

export { runA11yAudit, DEFAULT_A11Y_POLICY } from "./a11y/axe.js";
export type { A11yPolicy, A11yResult, AxeSeverity } from "./a11y/axe.js";
