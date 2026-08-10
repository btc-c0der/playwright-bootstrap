import type { TestInfo, WorkerInfo } from "@playwright/test";
import { buildTestNamespace, buildWorkerNamespace } from "../data/namespace.js";
import { TeardownStack } from "../data/teardown.js";
import { createUserFactory } from "../data/factories/index.js";
import type { ApiClient } from "./api-client.fixture.js";
import type { Logger } from "../logger/Logger.js";

export interface DataFactory {
  createUser: ReturnType<typeof createUserFactory>;
}

export interface DataFactoryWorkerFixtures {
  workerNamespace: string;
}

export interface DataFactoryTestFixtures {
  testNamespace: string;
  dataFactory: DataFactory;
}

// Empty destructuring is required (not a plain named param) — Playwright parses
// each fixture function's first-parameter pattern to know its dependencies.
export async function workerNamespaceFixture(
  // eslint-disable-next-line no-empty-pattern
  {}: object,
  use: (namespace: string) => Promise<void>,
  workerInfo: WorkerInfo,
): Promise<void> {
  const ns = buildWorkerNamespace({
    shard: process.env.QAF_SHARD_INDEX ?? "0",
    workerIndex: workerInfo.workerIndex,
  });
  await use(ns);
}

export async function testNamespaceFixture(
  { workerNamespace }: { workerNamespace: string },
  use: (namespace: string) => Promise<void>,
  testInfo: TestInfo,
): Promise<void> {
  const ns = buildTestNamespace({ workerNamespace, titlePath: testInfo.titlePath });
  await use(ns);
}

/**
 * Composes namespace + TeardownStack + the factory registry into the single
 * `dataFactory` fixture tests actually use. Extending `dataFactory` with a new
 * resource type means adding one line here and one factory file under data/factories/.
 */
export async function dataFactoryFixture(
  { apiClient, logger, testNamespace }: { apiClient: ApiClient; logger: Logger; testNamespace: string },
  use: (factory: DataFactory) => Promise<void>,
): Promise<void> {
  const teardown = new TeardownStack(testNamespace, logger);
  const factory: DataFactory = {
    createUser: createUserFactory({ apiClient, teardown, testNamespace }),
  };
  await use(factory);
  await teardown.runAll();
}
