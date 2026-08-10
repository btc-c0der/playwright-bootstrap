import { createHash } from "node:crypto";

/**
 * Deterministic UUIDv5-shaped id derived from an arbitrary string. Qdrant's
 * point ids must be an unsigned integer or a UUID, but `@qaf/rag-core`'s
 * `VectorRecord.id` is an arbitrary string (`"jira:PROJ-123"`). Hashing keeps
 * `upsert()` idempotent — the same source id always maps to the same point —
 * without asking every caller to pre-mint a UUID. The original id is also
 * stored in the point's payload (see `qdrant-vector-store.ts`'s `__qafId`) so
 * results can be mapped back to it.
 */
export function deterministicUuid(input: string): string {
  const hash = createHash("sha1").update(input).digest("hex");
  const variant = ((parseInt(hash[16] ?? "8", 16) & 0x3) | 0x8).toString(16);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `${variant}${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}
