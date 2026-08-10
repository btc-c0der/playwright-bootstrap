---
name: generate-tests
description: Scaffold Playwright spec files (and page objects, if missing) from an approved test-cases.json, following this framework's conventions. Use after analyze-requirements has produced and the user has approved a test plan, or when the user directly asks to write test code for a described scenario.
---

# Generate Tests

Turns approved, structured test cases into real spec files that follow this framework's
conventions — never raw locators, always through fixtures.

## Inputs

- `test-cases.json` (from `analyze-requirements`), or a directly-described scenario if the
  user skipped straight to "write me a test for X"
- Target project: `web` | `api` | `mobile`

## Steps

1. **Read the conventions first.** `docs/conventions.md` and `docs/anti-patterns.md` are
   non-negotiable — every element lookup goes through `this.find(descriptor)`
   (BasePage/BaseComponent) or the `resolve()` fixture; never `page.locator()`/`page.$()`
   with raw CSS/XPath (enforced by `@qaf/eslint-plugin-qaf`'s `require-data-testid` rule —
   your generated code must pass it, don't rely on the linter to catch it after the fact).
2. **Reuse before creating.** Check `tests/<project>/pages/` for an existing page object
   covering the same screen/resource before writing a new one. Check
   `tests/<project>/journeys/` for an existing composed flow before duplicating steps.
3. **Scaffold the page object** (if missing) extending `BasePage` (web/mobile) — every
   locator as a `LocatorDescriptor` (`testId` first, `role`/`text` only when the target
   element genuinely has no `data-testid`, matching what's actually in the DOM — don't
   invent a `data-testid` that isn't there).
4. **Write the spec** importing `test`/`expect` from `@qaf/core`, using `dataFactory` for
   any data the test creates (never module-level shared fixtures — see
   `docs/data-isolation.md`), and matching one test case from the input to one `test(...)`
   block (don't merge unrelated cases into one test).
5. **Self-check before finishing:**
   - `npx eslint <changed files>` — must be clean (data-testid rule, no-console rule)
   - `npx tsc --noEmit` — must be clean
   - Do not add a `@quarantined` tag to anything you generate — quarantine is only ever
     applied to a test with an observed flake history (see `triage-quarantine`).
6. **Report back** which files were created/modified and which test-case `id`s map to
   which `test(...)` blocks, plus any test case you couldn't implement (e.g. missing
   `data-testid` in the app) and why.

## Output

New/modified `.spec.ts` and (if needed) `.page.ts`/journey files, self-checked via
eslint + tsc, plus a short mapping of test-case id -> generated test.
