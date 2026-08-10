import { test, expect } from "@qaf/core";
import { TodoPage } from "../pages/TodoPage.js";

test.describe("Todo list", () => {
  test("adds and completes a todo", async ({ page, resolve, logger }) => {
    const todoPage = new TodoPage(page, resolve, logger);
    await todoPage.open();

    await todoPage.addTodo("Buy milk");
    await expect(page.getByText("Buy milk")).toBeVisible();

    const remainingBefore = await todoPage.remainingCountText();
    await expect(remainingBefore).toHaveText("1 item left");

    const row = todoPage.todoItemRow(1);
    expect(await row.isCompleted()).toBe(false);
    expect(await row.label()).toBe("Buy milk");

    await todoPage.toggleTodo(1);
    const remainingAfter = await todoPage.remainingCountText();
    await expect(remainingAfter).toHaveText("0 items left");
    expect(await row.isCompleted()).toBe(true);
  });

  test("deletes a todo via the role-resolved delete button", async ({ page, resolve, logger }) => {
    const todoPage = new TodoPage(page, resolve, logger);
    await todoPage.open();

    await todoPage.addTodo("Buy milk");
    await todoPage.addTodo("Walk the dog");
    await todoPage.deleteTodo("Buy milk");

    await expect(page.getByText("Buy milk")).toHaveCount(0);
    await expect(page.getByText("Walk the dog")).toBeVisible();
  });
});
