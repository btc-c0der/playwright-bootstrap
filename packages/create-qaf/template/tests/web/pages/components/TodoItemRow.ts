import { BaseComponent } from "@qaf/core";

/**
 * Example BaseComponent: scoped to one `<li data-testid="todo-item-N">` row.
 * Resolution inside a component is automatically scoped to `root` (see
 * BaseComponent), so `find({ testId: "todo-label" })` resolves THIS row's
 * label even though the same `data-testid` value repeats on every row.
 */
export class TodoItemRow extends BaseComponent {
  async isCompleted(): Promise<boolean> {
    const classAttr = await this.root.getAttribute("class");
    return classAttr?.includes("completed") ?? false;
  }

  async label(): Promise<string> {
    const label = await this.find({ testId: "todo-label", fallbackLabel: "todo label" });
    return (await label.textContent()) ?? "";
  }
}
