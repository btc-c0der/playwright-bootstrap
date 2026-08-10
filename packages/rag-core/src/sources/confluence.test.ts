import { test } from "node:test";
import assert from "node:assert/strict";
import { createConfluenceSource, normalizeConfluencePages } from "./confluence.js";

test("normalizeConfluencePages maps page body to text and namespaces as confluence", () => {
  const docs = normalizeConfluencePages([
    {
      id: "98765",
      title: "Login spec",
      body: "Users must provide a valid password.",
      spaceKey: "ENG",
    },
  ]);
  assert.equal(docs[0]?.id, "confluence:98765");
  assert.equal(docs[0]?.namespace, "confluence");
  assert.equal(docs[0]?.text, "Users must provide a valid password.");
  assert.equal(docs[0]?.metadata.spaceKey, "ENG");
});

test("createConfluenceSource fetches via the injected loader", async () => {
  const source = createConfluenceSource({
    loadPages: async () => [{ id: "1", title: "T", body: "B" }],
  });
  const docs = await source.fetch();
  assert.equal(docs.length, 1);
});
