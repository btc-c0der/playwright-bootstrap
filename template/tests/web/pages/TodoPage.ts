import { BasePage } from "@qaf/core";
import { TodoItemRow } from "./components/TodoItemRow.js";

/**
 * Example page object for the bundled demo app (tests/fixtures/todo-app.html,
 * served by tests/fixtures/server). Notice every lookup goes through
 * `this.find(descriptor)` — never `this.page.locator(...)` directly, which is
 * exactly what `@qaf/eslint-plugin-qaf`'s `require-data-testid` rule enforces.
 */
export class TodoPage extends BasePage {
  async open(): Promise<void> {
    await this.goto("/");
  }

  async addTodo(title: string): Promise<void> {
    await this.find({ testId: "new-todo-input", fallbackLabel: "new todo input" }).then((l) => l.fill(title));
    await this.find({ testId: "add-todo-button", fallbackLabel: "add todo button" }).then((l) => l.click());
  }

  /** Deliberately resolved via role (no data-testid on this element) — see todo-app.html. */
  async deleteTodo(title: string): Promise<void> {
    const button = await this.find({
      role: { role: "button", name: `Delete ${title}` },
      fallbackLabel: `delete button for "${title}"`,
    });
    await button.click();
  }

  async toggleTodo(id: number): Promise<void> {
    const toggle = await this.find({
      testId: `todo-toggle-${id}`,
      fallbackLabel: `toggle checkbox for todo #${id}`,
    });
    await toggle.check();
  }

  todoItem(id: number) {
    return this.find({ testId: `todo-item-${id}`, fallbackLabel: `todo item #${id}` });
  }

  /** BaseComponent example — scoped to one row so `data-testid="todo-label"` (repeated per row) resolves correctly. */
  todoItemRow(id: number): TodoItemRow {
    const root = this.page.getByTestId(`todo-item-${id}`);
    return new TodoItemRow(root, this.resolve, this.logger);
  }

  /** Deliberately resolved via text (no data-testid or role on this element) — see todo-app.html. */
  remainingCountText() {
    return this.find({ text: /item(s)? left/, fallbackLabel: "remaining count" });
  }
}
