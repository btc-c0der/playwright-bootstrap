---
name: triage-quarantine
description: Review quarantine-manifest.json entries (starting with those closest to expiring), decide resolve/fix/renew for each, and open PR(s). Use when asked to triage, clean up, or burn down quarantined tests, or when qaf-check-quarantine is failing due to expired entries.
---

# Triage Quarantine

Quarantine is a temporary parking spot with a ceiling, not a graveyard (see
`docs/quarantine.md`). This skill is how it gets burned down instead of silently growing.

## Inputs

- `quarantine-manifest.json`, sorted by `expiresAt` ascending (soonest-expiring first —
  those are the most urgent, and an already-expired entry is a hard CI failure via
  `qaf-check-quarantine`)

## Steps

For each entry, in order:

1. **Re-verify.** Run the exact test: `npx playwright test <file> --project=<project>
   --repeat-each=10 --grep "<title>"`.
2. **Decide:**
   - **0 failures in 10 runs → Resolve.** Remove the `@quarantined` tag from the test title
     in source, delete the manifest entry, append a record to `quarantine-history.json`
     (id, resolvedAt, verificationRuns). This is the default outcome to aim for.
   - **Still flaky, but you can identify a concrete root cause** (missing `await`, a hard
     `sleep` instead of an auto-retrying assertion, shared mutable state, a real
     app race condition) **→ Fix and re-verify.** Apply the fix, re-run the same
     `--repeat-each=10` check; if it now passes, treat as Resolve above.
   - **Still flaky, no identifiable root cause yet → Renew.** Bump `expiresAt` by 14 days,
     increment `renewalCount`. Refuse to renew past `ceiling.maxRenewals` (default 3) —
     an entry at the cap needs to be escalated to a human decision (skip it, rewrite the
     test, or accept the underlying flakiness as a known app issue), not silently renewed
     again.
3. **Never quarantine something new here.** This skill only processes *existing* entries;
   new candidates come from the nightly `quarantine-audit.yml` bot PR.

## Output

- One PR per logical batch (or one PR total, if entries are unrelated) with: resolved
  tests' tag removals, any applied fixes, manifest updates, `quarantine-history.json`
  appends.
- A summary comment: counts of resolved / fixed / renewed / escalated-to-human, and the
  resulting ceiling status (`pnpm check-quarantine`) after applying this batch.
