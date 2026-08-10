import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestCatalogSource, extractTags, buildTestId } from "./test-catalog.js";

test("extractTags finds one or more @tags in a title segment", () => {
  assert.deepEqual(extractTags("logs in @quarantined @smoke"), ["@quarantined", "@smoke"]);
  assert.deepEqual(extractTags("no tags here"), []);
});

test("buildTestId matches @qaf/core's buildEntryId shape and drops the duplicated file segment", () => {
  const id = buildTestId({
    titlePath: ["file.spec.ts", "Suite", "does a thing"],
    file: "file.spec.ts",
    project: "chromium",
  });
  assert.equal(id, "file.spec.ts::chromium::Suite > does a thing");
});

test("createTestCatalogSource produces one SourceDocument per discovered test, text carries title + tags", async () => {
  const source = createTestCatalogSource({
    discover: () => [
      {
        titlePath: ["auth.spec.ts", "Login", "rejects invalid password @smoke"],
        file: "auth.spec.ts",
        project: "chromium",
      },
    ],
  });
  const docs = await source.fetch();
  assert.equal(docs.length, 1);
  assert.equal(docs[0]?.namespace, "test");
  assert.equal(docs[0]?.id, "auth.spec.ts::chromium::Login > rejects invalid password @smoke");
  assert.match(docs[0]?.text ?? "", /Login > rejects invalid password @smoke/);
  assert.match(docs[0]?.text ?? "", /Tags: @smoke/);
  assert.deepEqual(docs[0]?.metadata.tags, ["@smoke"]);
});

test("createTestCatalogSource omits the Tags line entirely when there are none", async () => {
  const source = createTestCatalogSource({
    discover: () => [{ titlePath: ["a.spec.ts", "plain test"], file: "a.spec.ts", project: "api" }],
  });
  const docs = await source.fetch();
  assert.doesNotMatch(docs[0]?.text ?? "", /Tags:/);
});
