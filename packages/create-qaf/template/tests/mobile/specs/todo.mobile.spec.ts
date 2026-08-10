import { test, expect } from "@qaf/core";
import { TodoPage } from "../../web/pages/TodoPage.js";

/**
 * Same POM reused across web and mobile projects — page objects should be
 * viewport-agnostic; anything genuinely mobile-specific (a hamburger menu that
 * only exists below a breakpoint) belongs in its own component/page rather
 * than branching inside a shared one.
 */
test.describe("Todo list — mobile", () => {
  test("adds a todo on a mobile viewport", async ({ page, resolve, logger }) => {
    const todoPage = new TodoPage(page, resolve, logger);
    await todoPage.open();

    await todoPage.addTodo("Buy milk");
    await expect(page.getByText("Buy milk")).toBeVisible();
  });
});
