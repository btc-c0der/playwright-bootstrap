import { test, expect } from "@qaf/core";
import { TodoPage } from "../pages/TodoPage.js";
import { runAddThreeAndCompleteFirstTwoJourney } from "../journeys/manageTodosJourney.js";

test("completing a multi-step journey leaves one item remaining", async ({ page, resolve, logger }) => {
  const todoPage = new TodoPage(page, resolve, logger);

  await runAddThreeAndCompleteFirstTwoJourney(todoPage, ["Buy milk", "Walk the dog", "Write report"]);

  const remaining = await todoPage.remainingCountText();
  await expect(remaining).toHaveText("1 item left");
});
