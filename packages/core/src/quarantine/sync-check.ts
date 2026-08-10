import { activeEntries, type QuarantineManifest } from "./manifest.js";

export interface DiscoveredQuarantinedTest {
  id: string;
  file: string;
  project: string;
}

export interface SyncCheckResult {
  passed: boolean;
  /** Tests tagged `@quarantined` in source with no manifest entry — untracked quarantine. */
  taggedWithoutEntry: DiscoveredQuarantinedTest[];
  /** Manifest entries with no matching `@quarantined` test in source — stale entry. */
  entryWithoutTag: string[];
}

/**
 * Keeps the `@quarantined` title tag (execution semantics) and the manifest
 * (audit trail) from drifting apart. `discovered` should come from parsing
 * `playwright test --list --reporter=json --grep "@quarantined"` — this module
 * stays a pure function over that input so it's trivially unit-testable.
 */
export function checkSync(
  manifest: QuarantineManifest,
  discovered: DiscoveredQuarantinedTest[],
): SyncCheckResult {
  const discoveredIds = new Set(discovered.map((d) => d.id));
  const manifestIds = new Set(activeEntries(manifest).map((e) => e.id));

  const taggedWithoutEntry = discovered.filter((d) => !manifestIds.has(d.id));
  const entryWithoutTag = [...manifestIds].filter((id) => !discoveredIds.has(id));

  return {
    passed: taggedWithoutEntry.length === 0 && entryWithoutTag.length === 0,
    taggedWithoutEntry,
    entryWithoutTag,
  };
}
