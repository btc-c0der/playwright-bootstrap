import type { Locator } from "@playwright/test";
import type { Logger } from "../logger/Logger.js";
import type { Resolve } from "../locator-resolver/resolve.js";
import type { LocatorDescriptor } from "../locator-resolver/types.js";

/**
 * For reusable sub-trees (a nav bar, a modal, a data-table row) shared across
 * multiple page objects/journeys. Resolution is scoped to `root` via
 * `resolve.within(root)`, so a `data-testid` reused across multiple component
 * instances on the same page (e.g. every row in a table) still resolves uniquely
 * per instance instead of colliding against the whole page.
 */
export abstract class BaseComponent {
  protected readonly resolve: Resolve;

  constructor(
    protected readonly root: Locator,
    resolve: Resolve,
    protected readonly logger: Logger,
  ) {
    this.resolve = resolve.within(root);
  }

  protected find(descriptor: LocatorDescriptor) {
    return this.resolve(descriptor);
  }

  async isVisible(): Promise<boolean> {
    return this.root.isVisible();
  }
}
