import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiraSource, normalizeJiraIssues } from "./jira.js";

test("normalizeJiraIssues joins summary/description/acceptanceCriteria and namespaces as jira", () => {
  const docs = normalizeJiraIssues([
    {
      key: "PROJ-1",
      summary: "Login rejects invalid passwords",
      description: "As a user I should see an error.",
      acceptanceCriteria: "Given invalid password, then show error.",
      labels: ["auth"],
      status: "Done",
      updated: "2026-01-01T00:00:00.000Z",
      url: "https://example.atlassian.net/browse/PROJ-1",
    },
  ]);
  assert.equal(docs.length, 1);
  assert.equal(docs[0]?.id, "jira:PROJ-1");
  assert.equal(docs[0]?.namespace, "jira");
  assert.match(docs[0]?.text ?? "", /Login rejects invalid passwords/);
  assert.match(docs[0]?.text ?? "", /Given invalid password/);
  assert.deepEqual(docs[0]?.metadata.labels, ["auth"]);
});

test("createJiraSource fetches via the injected loader", async () => {
  const source = createJiraSource({
    loadIssues: async () => [{ key: "PROJ-2", summary: "Second issue" }],
  });
  const docs = await source.fetch();
  assert.equal(docs[0]?.id, "jira:PROJ-2");
});
