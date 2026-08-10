import type { Rule } from "eslint";
import requireDataTestId from "./rules/require-data-testid.js";
import noConsole from "./rules/no-console.js";

export interface QafPlugin {
  meta: { name: string; version: string };
  rules: Record<string, Rule.RuleModule>;
  // Loosely typed on purpose: ESLint's own `Linter.Plugin`/`ESLint.Plugin` types
  // require this plugin object to satisfy a strict self-referential shape
  // (`plugins: { qaf: <this plugin> }`) that isn't worth fighting here — a
  // consumer's own flat config (via `tseslint.config(...)`) is what actually
  // gets type-checked against `Linter.Config` at the point of use.
  configs: Record<string, Array<Record<string, unknown>>>;
}

const plugin: QafPlugin = {
  meta: { name: "@qaf/eslint-plugin-qaf", version: "0.1.0" },
  rules: {
    "require-data-testid": requireDataTestId,
    "no-console": noConsole,
  },
  configs: {},
};

plugin.configs.recommended = [
  {
    plugins: { qaf: plugin },
    rules: {
      "qaf/require-data-testid": "error",
      "qaf/no-console": "error",
    },
  },
];

export default plugin;
