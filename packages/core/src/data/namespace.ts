import { createHash, randomUUID } from "node:crypto";

/**
 * Playwright resets workerIndex per shard, so `workerIndex` alone collides across
 * shards running concurrently. Folding in shard + a short random suffix guarantees
 * global uniqueness across thousands of parallel tests without a shared counter/DB.
 */
export function buildWorkerNamespace(params: { shard: string; workerIndex: number }): string {
  const short = randomUUID().slice(0, 8);
  return `${params.shard}-w${params.workerIndex}-${short}`;
}

function hash8(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 8);
}

export function buildTestNamespace(params: { workerNamespace: string; titlePath: string[] }): string {
  const titleHash = hash8(params.titlePath.join(">"));
  return `${params.workerNamespace}-t${titleHash}`;
}
