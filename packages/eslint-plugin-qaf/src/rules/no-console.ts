import type { Rule } from "eslint";
import type { CallExpression, MemberExpression } from "estree";

/**
 * A framework-specific `no-console` (rather than reusing ESLint's built-in) so the
 * message points at the actual replacement: the `logger` fixture / `Logger` class,
 * which structures output per test/worker/shard for the flaky and health reporters.
 */
const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow console.* — use the Logger fixture so output is structured and correlated.",
    },
    schema: [],
    messages: {
      noConsole:
        'Use the `logger` fixture (or `Logger` class) instead of "console.{{method}}" — console output isn\'t structured, worker/shard-scoped, or consumed by the flaky/health reporters.',
    },
  },
  create(context) {
    return {
      CallExpression(node: CallExpression) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression") return;
        const member = callee as MemberExpression;
        if (member.object.type !== "Identifier" || member.object.name !== "console") return;
        if (member.property.type !== "Identifier") return;

        context.report({
          node: node as unknown as Rule.Node,
          messageId: "noConsole",
          data: { method: member.property.name },
        });
      },
    };
  },
};

export default rule;
