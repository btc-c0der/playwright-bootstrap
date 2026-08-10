import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createInternalSpecsSource } from "./internal-specs.js";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "qaf-rag-specs-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("finds markdown files under configured dirs and uses the first heading as title", async () => {
  await withTempDir(async (cwd) => {
    await mkdir(path.join(cwd, "docs"), { recursive: true });
    await writeFile(
      path.join(cwd, "docs", "login.md"),
      "# Login spec\n\nUsers must authenticate.\n",
    );

    const source = createInternalSpecsSource({ cwd, dirs: ["docs"] });
    const docs = await source.fetch();

    assert.equal(docs.length, 1);
    assert.equal(docs[0]?.namespace, "spec");
    assert.equal(docs[0]?.title, "Login spec");
    assert.equal(docs[0]?.id, `spec:${path.join("docs", "login.md")}`);
  });
});

test("recurses into subdirectories and skips ignored ones", async () => {
  await withTempDir(async (cwd) => {
    await mkdir(path.join(cwd, "docs", "nested"), { recursive: true });
    await mkdir(path.join(cwd, "docs", "node_modules"), { recursive: true });
    await writeFile(path.join(cwd, "docs", "nested", "a.md"), "no heading here");
    await writeFile(path.join(cwd, "docs", "node_modules", "skip.md"), "# Skip me");

    const source = createInternalSpecsSource({ cwd, dirs: ["docs"] });
    const docs = await source.fetch();

    assert.equal(docs.length, 1);
    assert.equal(docs[0]?.title, path.join("docs", "nested", "a.md")); // no heading -> falls back to path
  });
});

test("returns an empty array for a dir that doesn't exist rather than throwing", async () => {
  await withTempDir(async (cwd) => {
    const source = createInternalSpecsSource({ cwd, dirs: ["does-not-exist"] });
    assert.deepEqual(await source.fetch(), []);
  });
});
