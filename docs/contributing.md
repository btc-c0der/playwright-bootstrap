# Contributing to the framework

## Setup

```bash
npx pnpm install   # or: corepack enable && pnpm install, if corepack is available
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

## Adding a fixture to `@qaf/core`

1. Add `src/fixtures/your-thing.fixture.ts` following the existing `extendWithX` pattern
   (see `data-factory.fixture.ts` for a worker+test-scoped example, `logger.fixture.ts` for
   a simpler one).
2. Compose it into `src/fixtures/index.ts`'s chain (`extendWithX(previousStage)`), in
   dependency order (a fixture that needs `logger` must be composed after
   `extendWithLogger`).
3. Export any new public types from `src/index.ts`.
4. Update `template/`'s example specs if the new fixture should be demonstrated, and
   `template/docs/` if it needs its own explanation.
5. Add a changeset (`pnpm changeset`) describing the change from a *consumer's*
   perspective — "what can teams now do that they couldn't before."

## Adding an ESLint rule to `@qaf/eslint-plugin-qaf`

1. Add `src/rules/your-rule.ts` (plain `Rule.RuleModule`, see `require-data-testid.ts`).
2. Register it in `src/index.ts`'s `rules` map and, if it should be on by default, in
   `configs.recommended`.
3. Test it by running `pnpm --filter @qaf/eslint-plugin-qaf build` then linting
   `template/` locally with the built plugin.

## Editing the template

Edit `template/` directly at the repo root — never `packages/create-qaf/template/`, which
is a generated copy overwritten by `scripts/sync-template.mjs` on every build. After
editing, run the monorepo's `smoke-scaffold` check locally:

```bash
pnpm --filter create-qaf build
node packages/create-qaf/dist/index.js /tmp/qaf-smoke-test --yes --no-install --no-git
```

## Before opening a PR

- `pnpm build && pnpm typecheck && pnpm lint && pnpm test` all clean.
- A changeset for any change that affects consumers of the published packages
  (`pnpm changeset` — see [changesets.md](changesets.md)). Not needed for
  monorepo-internal-only changes (CI config, this doc, etc.).
