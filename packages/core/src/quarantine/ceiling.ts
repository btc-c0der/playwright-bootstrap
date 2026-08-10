import { activeEntries, expiredEntries, type QuarantineManifest } from "./manifest.js";

export interface CeilingCheckResult {
  passed: boolean;
  activeCount: number;
  activePercent: number;
  reasons: string[];
}

/**
 * The anti-graveyard valve: quarantine is a temporary parking spot, not a
 * permanent one. Three ways this check fails the build:
 *  1. Active quarantine count/percent exceeds the configured ceiling.
 *  2. Any entry's `expiresAt` has passed without being re-triaged — this is
 *     what forces burn-down instead of indefinite parking.
 *  3. Any entry has been renewed past `maxRenewals` (default 3) — triage
 *     can't just keep pushing the expiry date out forever either.
 */
export function checkCeiling(
  manifest: QuarantineManifest,
  totalTestCount: number,
  now = new Date(),
): CeilingCheckResult {
  const reasons: string[] = [];
  const active = activeEntries(manifest);
  const activeCount = active.length;
  const activePercent = totalTestCount > 0 ? (activeCount / totalTestCount) * 100 : 0;

  if (activeCount > manifest.ceiling.maxCount) {
    reasons.push(
      `active quarantine count ${activeCount} exceeds ceiling.maxCount ${manifest.ceiling.maxCount}`,
    );
  }
  if (activePercent > manifest.ceiling.maxPercent) {
    reasons.push(
      `active quarantine percent ${activePercent.toFixed(1)}% exceeds ceiling.maxPercent ${manifest.ceiling.maxPercent}%`,
    );
  }

  const expired = expiredEntries(manifest, now);
  for (const entry of expired) {
    reasons.push(`entry "${entry.id}" expired at ${entry.expiresAt} without re-triage`);
  }

  const maxRenewals = manifest.ceiling.maxRenewals ?? 3;
  for (const entry of active) {
    if (entry.renewalCount > maxRenewals) {
      reasons.push(`entry "${entry.id}" exceeded maxRenewals (${entry.renewalCount} > ${maxRenewals})`);
    }
  }

  return { passed: reasons.length === 0, activeCount, activePercent, reasons };
}
