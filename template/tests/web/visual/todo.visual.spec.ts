import { test, expectMatchesBaseline } from "@qaf/core";
import { TodoPage } from "../pages/TodoPage.js";

test.describe("Todo list — visual", () => {
  test("matches the empty-state baseline", async ({ page, resolve, logger }, testInfo) => {
    const todoPage = new TodoPage(page, resolve, logger);
    await todoPage.open();

    // Skips on every project except the canonical one (chromium) — see
    // packages/core/src/visual/policy.ts and docs/visual-testing.md.
    await expectMatchesBaseline(page, "todo-empty-state.png", testInfo);
  });

  test("matches the baseline with two todos added", async ({ page, resolve, logger }, testInfo) => {
    const todoPage = new TodoPage(page, resolve, logger);
    await todoPage.open();
    await todoPage.addTodo("Buy milk");
    await todoPage.addTodo("Walk the dog");

    await expectMatchesBaseline(page, "todo-two-items.png", testInfo);
  });
});
