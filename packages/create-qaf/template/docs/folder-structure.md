# Folder Structure

```
tests/
  web/
    pages/            Page objects extending BasePage. One file per screen/resource.
      components/      BaseComponent subclasses for reusable sub-trees (nav bar, a table row).
    journeys/          Composed multi-step flows reusing page-object methods. No assertions here.
    specs/             *.spec.ts — the actual tests. One test-case-id : one test() block.
    visual/            Visual-regression specs only — own Playwright project ("visual"), never
                        part of the blocking matrix.
    a11y/              Accessibility-audit specs only — own project ("a11y"), never blocking.
  api/
    specs/             Contract/API-only tests — no `page`, just `apiClient`.
  mobile/
    specs/             Mobile-viewport tests — typically reusing tests/web/pages POMs.
  fixtures/
    server/            The bundled dependency-free demo app + mock API (delete once you have
                        a real app/backend).
    todo-app.html        The demo app itself.

scripts/               Small standalone Node scripts run by CI/git hooks (detect-flakes,
                       run-affected-tests) — plain JS, not part of the TS test code path.

docs/                  You are here.
.claude/skills/        The 5-skill requirements -> tests -> review -> triage -> audit pipeline.
.github/workflows/     ci.yml (sharded matrix), visual.yml, a11y.yml, quarantine-audit.yml.
.husky/                pre-commit (lint-staged), pre-push (typecheck + affected tests).

quarantine-manifest.json   Committed. The quarantine ceiling + per-entry audit trail.
.qaf/test-run-history.jsonl  Committed, bot-updated. Feeds nightly flake detection.
playwright.config.ts       Projects, sharding, webServer, reporters.
```

## Naming conventions

- Page objects: `PascalCase` matching the screen/resource — `LoginPage.ts`, `CheckoutPage.ts`.
- Components: `PascalCase`, verb-free — `CartItemRow.ts`, not `CartItemRowComponent.ts`.
- Specs: `kebab-case.spec.ts`, named after the *feature*, not the page — `checkout-discount-codes.spec.ts`.
- Journeys: `camelCase` function names describing the flow — `completePurchaseJourney.ts`.

## Adding a new test project (e.g. a second app, or desktop-app testing)

1. Add a folder under `tests/` (e.g. `tests/admin/`).
2. Add a project entry to `playwright.config.ts` pointing `testDir` at it.
3. Add it to the `test` script in `package.json` and to the CI matrix in
   `.github/workflows/ci.yml` if it should be part of the blocking suite.
