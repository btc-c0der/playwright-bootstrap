import type { Rule } from "eslint";
import type { CallExpression, MemberExpression } from "estree";

const RAW_LOOKUP_METHODS = new Set(["locator", "$", "$$", "waitForSelector"]);
const SANCTIONED_METHODS = new Set([
  "getByTestId",
  "getByRole",
  "getByLabel",
  "getByPlaceholder",
  "getByAltText",
  "getByTitle",
  "getByText",
]);

/**
 * Flags raw `page.locator("...")` / `.$("...")` / `.waitForSelector("...")` calls —
 * these bypass the LocatorResolver's fallback-chain + drift logging entirely.
 * Element lookups must go through `this.find(descriptor)` (BasePage/BaseComponent)
 * or the `resolve()` fixture, which itself calls Playwright's sanctioned
 * `getBy*` methods internally (those are allowed since that's the resolver's
 * own implementation).
 */
const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Require element lookups to be routed through the LocatorResolver (data-testid first).",
    },
    schema: [],
    messages: {
      rawLookup:
        'Raw "{{method}}(...)" bypasses the LocatorResolver. Use `this.find({ testId: "..." })` (BasePage/BaseComponent) or the `resolve()` fixture instead, so fallback strategies and drift logging apply.',
    },
  },
  create(context) {
    return {
      CallExpression(node: CallExpression) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression") return;
        const member = callee as MemberExpression;
        if (member.property.type !== "Identifier") return;
        const methodName = member.property.name;

        if (SANCTIONED_METHODS.has(methodName)) return;
        if (!RAW_LOOKUP_METHODS.has(methodName)) return;

        context.report({
          node: node as unknown as Rule.Node,
          messageId: "rawLookup",
          data: { method: methodName },
        });
      },
    };
  },
};

export default rule;
