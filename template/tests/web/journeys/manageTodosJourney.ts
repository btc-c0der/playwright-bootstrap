import type { TodoPage } from "../pages/TodoPage.js";

/**
 * A "journey" composes multiple page-object steps into one reusable, named
 * user flow — shared across specs instead of copy-pasted step sequences.
 * Keep journeys thin: they call page object methods, they don't contain
 * assertions (those belong in the spec) or raw locator/page access.
 */
export async function runAddThreeAndCompleteFirstTwoJourney(
  todoPage: TodoPage,
  titles: [string, string, string],
): Promise<void> {
  await todoPage.open();
  for (const title of titles) {
    await todoPage.addTodo(title);
  }
  await todoPage.toggleTodo(1);
  await todoPage.toggleTodo(2);
}
