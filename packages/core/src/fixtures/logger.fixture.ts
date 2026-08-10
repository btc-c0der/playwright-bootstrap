import type { TestInfo, WorkerInfo } from "@playwright/test";
import { Logger } from "../logger/Logger.js";

export interface LoggerWorkerFixtures {
  rootLogger: Logger;
}

export interface LoggerTestFixtures {
  logger: Logger;
}

/**
 * One pino root instance per worker process (cheap to share), one bound child
 * per test carrying workerIndex/shard/titlePath so every log line is traceable
 * back to the exact test run that emitted it. Exported as plain fixture pieces
 * (not a `test.extend` HOC) — see fixtures/index.ts for why: composing several
 * separate `.extend()` calls through generic passthrough functions defeats
 * Playwright's own `TestType` structural checks, so every fixture in this
 * framework is merged in a single `.extend()` call there instead.
 */
// Playwright inspects each fixture function's source to determine its
// dependencies, requiring a literal (possibly empty) destructuring pattern as
// the first parameter — a plain named parameter (even if unused) breaks that.
export async function rootLoggerFixture(
  // eslint-disable-next-line no-empty-pattern
  {}: object,
  use: (logger: Logger) => Promise<void>,
  workerInfo: WorkerInfo,
): Promise<void> {
  const logger = Logger.root().child({
    workerIndex: workerInfo.workerIndex,
    shard: process.env.QAF_SHARD_INDEX ?? "0",
  });
  await use(logger);
}

export async function loggerFixture(
  { rootLogger }: { rootLogger: Logger },
  use: (logger: Logger) => Promise<void>,
  testInfo: TestInfo,
): Promise<void> {
  const logger = rootLogger.child({
    test: testInfo.titlePath.join(" > "),
    project: testInfo.project.name,
    retry: testInfo.retry,
  });
  await use(logger);
}
