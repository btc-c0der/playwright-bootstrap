import { readFile, writeFile } from "node:fs/promises";

export type QuarantineStatus = "quarantined" | "resolved";

export interface QuarantineEntry {
  /** `${file}::${project}::${titlePath}` — matches the `@quarantined`-tagged test 1:1. */
  id: string;
  file: string;
  project: string;
  status: QuarantineStatus;
  reason: string;
  firstSeen: string;
  lastFailure: string;
  flakeRate?: { window: number; failures: number };
  quarantinedAt: string;
  expiresAt: string;
  renewalCount: number;
  linkedIssue?: string;
}

export interface QuarantineCeiling {
  maxCount: number;
  maxPercent: number;
  maxRenewals?: number;
}

export interface QuarantineManifest {
  version: 1;
  ceiling: QuarantineCeiling;
  entries: QuarantineEntry[];
}

export const DEFAULT_MANIFEST_PATH = "quarantine-manifest.json";

export function emptyManifest(ceiling: QuarantineCeiling): QuarantineManifest {
  return { version: 1, ceiling, entries: [] };
}

export async function loadManifest(path = DEFAULT_MANIFEST_PATH): Promise<QuarantineManifest> {
  const raw = await readFile(path, "utf-8");
  const parsed = JSON.parse(raw) as QuarantineManifest;
  assertManifestShape(parsed);
  return parsed;
}

export async function saveManifest(
  manifest: QuarantineManifest,
  path = DEFAULT_MANIFEST_PATH,
): Promise<void> {
  await writeFile(path, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
}

export function activeEntries(manifest: QuarantineManifest): QuarantineEntry[] {
  return manifest.entries.filter((e) => e.status === "quarantined");
}

export function expiredEntries(manifest: QuarantineManifest, now = new Date()): QuarantineEntry[] {
  return activeEntries(manifest).filter((e) => new Date(e.expiresAt) < now);
}

function assertManifestShape(value: unknown): asserts value is QuarantineManifest {
  if (typeof value !== "object" || value === null) {
    throw new Error("quarantine-manifest.json: root must be an object");
  }
  const v = value as Partial<QuarantineManifest>;
  if (v.version !== 1) throw new Error("quarantine-manifest.json: version must be 1");
  if (!v.ceiling || typeof v.ceiling.maxCount !== "number" || typeof v.ceiling.maxPercent !== "number") {
    throw new Error("quarantine-manifest.json: ceiling.maxCount and ceiling.maxPercent are required");
  }
  if (!Array.isArray(v.entries)) {
    throw new Error("quarantine-manifest.json: entries must be an array");
  }
}

/**
 * Both Playwright's reporter API (`TestCase.titlePath()`) and its
 * `--list --reporter=json` output represent each spec file as an outer suite
 * titled with the file's own relative path — so `titlePath` always carries a
 * leading segment that duplicates `file`. Filtering it out here (rather than
 * trying to special-case each caller) keeps the id stable and readable
 * regardless of which of the two ever-so-slightly different Playwright APIs
 * produced the inputs.
 */
export function buildEntryId(params: { file: string; project: string; titlePath: string[] }): string {
  const meaningfulTitlePath = params.titlePath.filter((segment) => segment !== params.file);
  return `${params.file}::${params.project}::${meaningfulTitlePath.join(" > ")}`;
}
