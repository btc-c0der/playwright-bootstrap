import type { Page } from "@playwright/test";
import type { Logger } from "../logger/Logger.js";
import type { Resolve } from "../locator-resolver/resolve.js";
import type { LocatorDescriptor } from "../locator-resolver/types.js";

/**
 * Every page object extends this. Subclasses must NOT reach for `page.locator(...)`
 * with raw CSS/XPath directly — `@qaf/eslint-plugin-qaf`'s `require-data-testid`
 * rule enforces routing all element lookups through `this.find()` (the resolver).
 */
export abstract class BasePage {
  constructor(
    protected readonly page: Page,
    protected readonly resolve: Resolve,
    protected readonly logger: Logger,
  ) {}

  /** The only sanctioned way to locate an element from a page object. */
  protected find(descriptor: LocatorDescriptor) {
    return this.resolve(descriptor);
  }

  async goto(path: string): Promise<void> {
    this.logger.info("navigating", { path });
    await this.page.goto(path);
  }

  async waitForUrlContains(fragment: string): Promise<void> {
    await this.page.waitForURL((url) => url.pathname.includes(fragment));
  }
}
