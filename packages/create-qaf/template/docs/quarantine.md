# Quarantine

Quarantine exists so one flaky test doesn't block the whole team's merges — while making
sure "quarantined" never quietly becomes "permanently ignored." Three mechanisms enforce
that; understand all three before touching `quarantine-manifest.json` by hand.

## 1. The tag drives execution; the manifest is the audit trail

A test tagged `@quarantined` in its title runs under the `chromium-quarantine` Playwright
project instead of the blocking `chromium` one — see `playwright.config.ts`'s
`grep`/`grepInvert` split. That project has more retries and CI runs it with
`continue-on-error: true`, so it never blocks a merge.

`quarantine-manifest.json` is the separate, committed audit trail: ceiling config plus one
entry per quarantined test (`reason`, `flakeRate`, `quarantinedAt`, `expiresAt`,
`renewalCount`, `linkedIssue`). `qaf-check-quarantine`'s **sync check** fails CI if a
`@quarantined`-tagged test has no manifest entry, or vice versa — the two can never
silently drift apart.

## 2. The ceiling

```json
{ "ceiling": { "maxCount": 50, "maxPercent": 5, "maxRenewals": 3 } }
```

`qaf-check-quarantine` (run in CI via `pnpm check-quarantine`) fails the build if:
- Active quarantine count/percent exceeds `maxCount`/`maxPercent`.
- **Any entry's `expiresAt` has passed without re-triage** — this is what forces burn-down.
  An expired entry isn't just a warning; it's a hard CI failure until a human triages it.
- Any entry's `renewalCount` exceeds `maxRenewals` — triage can't just keep pushing the
  expiry date forever either; at the cap it needs a human decision (see the
  `triage-quarantine` skill).

## 3. The lifecycle

```
new flake detected (nightly quarantine-audit.yml, >=3 failures in trailing 20 runs)
  -> bot PR: tag + manifest entry together, human reviews and merges
  -> runs non-blocking under *-quarantine project, expiresAt default +14 days
  -> triage-quarantine skill (run periodically, or when expiresAt approaches):
       resolved (0/10 re-runs failed) -> tag removed, entry deleted, history recorded
       fixed (root cause found + fixed) -> re-verified -> resolved
       still flaky, no cause found -> renewed (expiresAt +14d, renewalCount+1, capped)
```

## Manual quarantine

You can quarantine a test yourself instead of waiting for the nightly bot: add
`@quarantined` to its title, add a matching manifest entry (same `id` shape:
`${file}::${project}::${titlePath joined by " > "}`), and open a PR — `pr-review` checks
for a `linkedIssue` on any new entry.
