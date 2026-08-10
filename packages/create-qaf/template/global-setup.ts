import type { FullConfig } from "@playwright/test";
import { Logger } from "@qaf/core";

/**
 * Playwright's own lifecycle hook (distinct from the git pre-commit/pre-push
 * hooks in .husky/) — runs once before the whole run, not per test/worker.
 * Use it for one-time setup (seeding a shared read-only fixture dataset,
 * warming a cache) — never for per-test data, which belongs in the
 * `dataFactory` fixture so it stays isolated per test/worker/shard.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const logger = Logger.root();
  logger.info("global setup starting", {
    projects: config.projects.map((p) => p.name),
    workers: config.workers,
  });
}
