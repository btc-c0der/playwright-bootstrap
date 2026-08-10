import { test, expect } from "@qaf/core";

/**
 * Contract-style example against the demo server's mock /api/posts endpoints
 * (tests/fixtures/server) — runs under the dedicated "api" project (no
 * browser). Replace with real endpoint contracts once you have a backend.
 */
test.describe("Posts API", () => {
  test("lists posts", async ({ apiClient }) => {
    const response = await apiClient.request.get("/api/posts");
    expect(response.ok()).toBe(true);
    const posts = (await response.json()) as Array<{ id: number; title: string }>;
    expect(Array.isArray(posts)).toBe(true);
    expect(posts.length).toBeGreaterThan(0);
  });

  test("creates and reads back a post", async ({ apiClient, testNamespace }) => {
    const created = await apiClient.request.post("/api/posts", {
      data: { title: `Post ${testNamespace}`, body: "example body" },
    });
    expect(created.ok()).toBe(true);
    const post = (await created.json()) as { id: number; title: string };

    const fetched = await apiClient.request.get(`/api/posts/${post.id}`);
    expect(fetched.ok()).toBe(true);
    expect((await fetched.json()).title).toBe(`Post ${testNamespace}`);
  });
});
