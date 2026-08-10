import type { Locator, Page } from "@playwright/test";
import type { AriaRole, ElementSnapshot, HealCandidate, HealCandidateRecipe } from "./types.js";

const INTERACTIVE_SELECTOR =
  'a[href], button, input, select, textarea, [role], [data-testid], [onclick], [tabindex]:not([tabindex="-1"])';
const MAX_TEXT_LENGTH = 200;
const MAX_NEIGHBORS = 5;

/**
 * Snapshots the single element a strategy just resolved — called right after a successful
 * `resolve()` so `VectorHealingProvider.captureOnSuccess()` has something to embed and store.
 * Duplicated (rather than sharing a helper) with `snapshotInteractiveElements` below by
 * necessity: `Locator.evaluate`/`Page.evaluate` callbacks run in the browser and can't close
 * over anything from this module — each must be a fully self-contained function body.
 */
export async function snapshotElement(locator: Locator): Promise<ElementSnapshot> {
  return locator.first().evaluate((el: Element) => {
    const MAX_TEXT = 200;
    const MAX_NEIGHBORS_INNER = 5;
    const text = (el.textContent ?? "").trim().slice(0, MAX_TEXT);
    const parent = el.parentElement;
    const neighborText = parent
      ? Array.from(parent.children)
          .filter((sibling) => sibling !== el)
          .slice(0, MAX_NEIGHBORS_INNER)
          .map((sibling) => (sibling.textContent ?? "").trim().slice(0, MAX_TEXT))
          .filter((t) => t.length > 0)
      : [];
    const rect = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      textContent: text,
      ariaLabel: el.getAttribute("aria-label"),
      role: el.getAttribute("role"),
      testId: el.getAttribute("data-testid"),
      boundingBox:
        rect.width > 0 || rect.height > 0
          ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          : null,
      parentTag: parent ? parent.tagName.toLowerCase() : null,
      parentTestId: parent ? parent.getAttribute("data-testid") : null,
      childTags: Array.from(el.children)
        .slice(0, MAX_NEIGHBORS_INNER)
        .map((child) => child.tagName.toLowerCase()),
      neighborText,
    };
  });
}

/**
 * Snapshots every currently-interactive element on the page, each paired with the
 * `HealCandidateRecipe` that can deterministically re-find it (preferring `data-testid`, then
 * role+approximate-name, then a positional `tag.nth(index)` last resort). This is what the
 * healing interceptor calls once every static strategy in `resolve()` has been exhausted.
 *
 * The "role name" here is an approximation (`aria-label` or trimmed text content) — not the
 * full ARIA accessible-name computation `getByRole` itself uses — accurate enough to build a
 * working `Locator` recipe, not a substitute for a real accname algorithm.
 */
export async function snapshotInteractiveElements(
  page: Page,
  selector: string = INTERACTIVE_SELECTOR,
): Promise<HealCandidate[]> {
  return page.evaluate(([sel, maxText, maxNeighbors]: [string, number, number]) => {
    const elements = Array.from(document.querySelectorAll(sel));

    // Index within *all* elements sharing a tag name — must match the ordering
    // `page.locator(tag).nth(index)` will see later when resolving the "nth" recipe.
    const nthOf = (el: Element): number =>
      Array.from(document.getElementsByTagName(el.tagName.toLowerCase())).indexOf(el);

    return elements.map((el) => {
      const text = (el.textContent ?? "").trim().slice(0, maxText);
      const parent = el.parentElement;
      const neighborText = parent
        ? Array.from(parent.children)
            .filter((sibling) => sibling !== el)
            .slice(0, maxNeighbors)
            .map((sibling) => (sibling.textContent ?? "").trim().slice(0, maxText))
            .filter((t) => t.length > 0)
        : [];
      const rect = el.getBoundingClientRect();
      const testId = el.getAttribute("data-testid");
      const role = el.getAttribute("role");
      const ariaLabel = el.getAttribute("aria-label");
      const tag = el.tagName.toLowerCase();

      const snapshot = {
        tag,
        textContent: text,
        ariaLabel,
        role,
        testId,
        boundingBox:
          rect.width > 0 || rect.height > 0
            ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            : null,
        parentTag: parent ? parent.tagName.toLowerCase() : null,
        parentTestId: parent ? parent.getAttribute("data-testid") : null,
        childTags: Array.from(el.children)
          .slice(0, maxNeighbors)
          .map((child) => child.tagName.toLowerCase()),
        neighborText,
      };

      const recipe = testId
        ? { kind: "testId" as const, value: testId }
        : role
          ? { kind: "role" as const, role: role as unknown as AriaRole, name: ariaLabel ?? text ?? undefined }
          : { kind: "nth" as const, tag, index: nthOf(el) };

      return { snapshot, recipe };
    });
  }, [selector, MAX_TEXT_LENGTH, MAX_NEIGHBORS] as [string, number, number]);
}

/**
 * The inverse of extraction: turns a `HealCandidateRecipe` (captured while every element was
 * still live) back into a real `Locator` at heal time. `root` is whatever the failed
 * resolution was scoped to (`Page`, or a component's root `Locator` via `resolve.within`).
 */
export function buildLocatorFromRecipe(root: Page | Locator, recipe: HealCandidateRecipe): Locator {
  switch (recipe.kind) {
    case "testId":
      return root.getByTestId(recipe.value);
    case "role":
      return root.getByRole(recipe.role, recipe.name ? { name: recipe.name } : undefined);
    case "nth":
      return root.locator(recipe.tag).nth(recipe.index);
  }
}
