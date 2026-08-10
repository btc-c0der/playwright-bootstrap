# Changesets

This repo publishes four packages independently: `@qaf/core`, `@qaf/eslint-plugin-qaf`, `create-qaf`, and `@qaf/rag-core`.

Whenever a PR changes behavior in `packages/*` that consumers should know about, run:

```
pnpm changeset
```

Pick the affected package(s), pick a semver bump (patch/minor/major), and write a one-line summary — it becomes the changelog entry. Commit the generated `.changeset/*.md` file with your PR.

On merge to `main`, `release.yml` opens/updates a "Version Packages" PR via `changesets/action`. Merging _that_ PR publishes the new versions to npm. See [docs/changesets.md](../docs/changesets.md) for the full flow.
