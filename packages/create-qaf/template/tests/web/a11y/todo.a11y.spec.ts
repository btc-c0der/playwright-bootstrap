import { test, expect, runA11yAudit } from "@qaf/core";
import { TodoPage } from "../pages/TodoPage.js";

test.describe("Todo list — accessibility", () => {
  test("has no serious/critical a11y violations", async ({ page, resolve, logger }) => {
    const todoPage = new TodoPage(page, resolve, logger);
    await todoPage.open();
    await todoPage.addTodo("Buy milk");

    const result = await runA11yAudit(page, logger);
    // Violations below the failOn threshold are logged (see runA11yAudit) but
    // don't fail the test — only serious/critical do.
    for (const violation of result.violations) {
      logger.info("a11y finding", violation);
    }
    expect(result.passed, `a11y violations: ${JSON.stringify(result.violations)}`).toBe(true);
  });
});
