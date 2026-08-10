// Root ESLint flat config for the monorepo's own source (packages/*).
// The `template/` directory ships its own eslint.config.js (using the published
// @qaf/eslint-plugin-qaf) since it represents a *consumer* repo, not this monorepo.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.test-dist/**", "**/node_modules/**", "template/**", "**/.turbo/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": "error",
    },
  },
  prettier,
);
