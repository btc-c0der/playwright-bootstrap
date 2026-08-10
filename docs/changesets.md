# Changesets — Release Flow

Four independently-versioned packages are published from this monorepo: `@qaf/core`,
`@qaf/eslint-plugin-qaf`, `create-qaf`, `@qaf/rag-core`.

## Day to day

Whenever your PR changes something consumers should know about:

```bash
pnpm changeset
```

Pick the affected package(s) and a semver bump:

- **patch** — bug fix, internal refactor with no behavior change for consumers
- **minor** — new fixture/rule/CLI flag, backwards-compatible
- **major** — anything that requires a consumer to change their own code/config

Write a one-line summary — it becomes the changelog entry verbatim, so write it for a
consumer reading a changelog, not for a fellow contributor reading the diff. Commit the
generated `.changeset/*.md` file as part of your PR.

## What happens on merge

`.github/workflows/release.yml` runs `changesets/action` on every push to `main`:

1. If there are pending `.changeset/*.md` files: opens (or updates) a **"Version
   Packages"** PR that bumps `package.json` versions, updates changelogs, and deletes the
   consumed changeset files. This PR is never auto-merged.
2. Once that PR is merged (i.e., there are no pending changesets left on `main`): publishes
   the new versions to npm (`pnpm release` = `pnpm build && changeset publish`).

## Cross-package version pinning

`create-qaf` depends on `@qaf/core`/`@qaf/eslint-plugin-qaf` at `workspace:*` in this repo;
Changesets rewrites that to a real semver range when publishing (`updateInternalDependencies:
"patch"` in `.changeset/config.json`). `create-qaf`'s `postinstall` step then reads the
_actually-installed_ version of each at scaffold time and pins that same version into the
generated project — see `docs/architecture.md`'s "Versioning relationship" section.

## Required secrets

`release.yml` needs `NPM_TOKEN` (an npm automation token with publish rights to the `@qaf`
scope and `create-qaf`) configured as a repository secret.
