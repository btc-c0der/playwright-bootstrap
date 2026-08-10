import type { Locator, Page } from "@playwright/test";
import type { LocatorDescriptor, StrategyName } from "./types.js";

export const STRATEGY_ORDER: StrategyName[] = ["testId", "role", "text"];

export function buildLocator(
  root: Page | Locator,
  descriptor: LocatorDescriptor,
  strategy: StrategyName,
): Locator | null {
  switch (strategy) {
    case "testId":
      return descriptor.testId ? root.getByTestId(descriptor.testId) : null;
    case "role":
      return descriptor.role ? root.getByRole(descriptor.role.role, { name: descriptor.role.name }) : null;
    case "text":
      return descriptor.text !== undefined ? root.getByText(descriptor.text) : null;
    default:
      return null;
  }
}

/** Short existence probe — this is a fallback chain, not a substitute for waiting/retries. */
export async function probe(locator: Locator, timeoutMs: number): Promise<boolean> {
  try {
    await locator.first().waitFor({ state: "attached", timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}
