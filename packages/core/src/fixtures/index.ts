import { test as base, expect } from "@playwright/test";
import { rootLoggerFixture, loggerFixture } from "./logger.fixture.js";
import { apiClientFixture } from "./api-client.fixture.js";
import { workerNamespaceFixture, testNamespaceFixture, dataFactoryFixture } from "./data-factory.fixture.js";
import {
  aiRepairProviderFixture,
  aiRepairEnabledFixture,
  vectorHealingProviderFixture,
  vectorHealingEnabledFixture,
  vectorHealingAutoExecuteFixture,
  vectorHealingMinConfidenceFixture,
  resolveFixture,
} from "./locator-resolver.fixture.js";
import { authenticatedPageFixture } from "./auth.fixture.js";

import type { LoggerTestFixtures, LoggerWorkerFixtures } from "./logger.fixture.js";
import type { ApiClientTestFixtures } from "./api-client.fixture.js";
import type { DataFactoryTestFixtures, DataFactoryWorkerFixtures } from "./data-factory.fixture.js";
import type {
  LocatorResolverTestFixtures,
  LocatorResolverWorkerFixtures,
} from "./locator-resolver.fixture.js";
import type { AuthTestFixtures } from "./auth.fixture.js";

type CombinedTestFixtures = LoggerTestFixtures &
  ApiClientTestFixtures &
  DataFactoryTestFixtures &
  LocatorResolverTestFixtures &
  AuthTestFixtures;

type CombinedWorkerFixtures = LoggerWorkerFixtures & DataFactoryWorkerFixtures & LocatorResolverWorkerFixtures;

/**
 * Single composition point, one `.extend()` call: every consuming spec does
 * `import { test, expect } from "@qaf/core"` and gets logger + apiClient +
 * dataFactory + resolve + authenticatedPage together. Composing fixtures
 * through several separate `.extend()` calls (each wrapped in its own generic
 * helper) looks appealing but fights Playwright's `TestType` structural
 * checks in strict mode — see git history for that abandoned approach. Adding
 * a new cross-cutting fixture means adding one entry to the object below.
 */
const test = base.extend<CombinedTestFixtures, CombinedWorkerFixtures>({
  rootLogger: [rootLoggerFixture, { scope: "worker" }],
  logger: loggerFixture,
  apiClient: apiClientFixture,
  workerNamespace: [workerNamespaceFixture, { scope: "worker" }],
  testNamespace: testNamespaceFixture,
  dataFactory: dataFactoryFixture,
  aiRepairProvider: [aiRepairProviderFixture, { scope: "worker" }],
  aiRepairEnabled: [aiRepairEnabledFixture, { scope: "worker" }],
  vectorHealingProvider: [vectorHealingProviderFixture, { scope: "worker" }],
  vectorHealingEnabled: [vectorHealingEnabledFixture, { scope: "worker" }],
  vectorHealingAutoExecute: [vectorHealingAutoExecuteFixture, { scope: "worker" }],
  vectorHealingMinConfidence: [vectorHealingMinConfidenceFixture, { scope: "worker" }],
  resolve: resolveFixture,
  authenticatedPage: authenticatedPageFixture,
});

export { test, expect };

export type { LoggerTestFixtures, LoggerWorkerFixtures } from "./logger.fixture.js";
export type { ApiClient, ApiClientTestFixtures } from "./api-client.fixture.js";
export type {
  DataFactory,
  DataFactoryTestFixtures,
  DataFactoryWorkerFixtures,
} from "./data-factory.fixture.js";
export type {
  LocatorResolverTestFixtures,
  LocatorResolverWorkerFixtures,
} from "./locator-resolver.fixture.js";
export type { AuthTestFixtures, AuthenticatedSession, SessionCookie } from "./auth.fixture.js";
