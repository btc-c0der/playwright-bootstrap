{
  "name": "{{PROJECT_NAME}}",
  "version": "0.1.0",
  "private": true,
  "description": "QA automation suite for {{PROJECT_NAME}}, generated from create-qaf.",
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "test": "playwright test --project=chromium --project=firefox --project=webkit --project=mobile-chrome --project=mobile-safari --project=api",
    "test:web": "playwright test --project=chromium --project=firefox --project=webkit",
    "test:api": "playwright test --project=api",
    "test:mobile": "playwright test --project=mobile-chrome --project=mobile-safari",
    "test:quarantine": "playwright test --project=chromium-quarantine",
    "test:visual": "playwright test --project=visual",
    "test:visual:update": "playwright test --project=visual --update-snapshots",
    "test:a11y": "playwright test --project=a11y",
    "test:affected": "node scripts/run-affected-tests.mjs",
    "test:ui": "playwright test --ui",
    "test:headed": "playwright test --headed",
    "report": "playwright show-report",
    "check-quarantine": "qaf-check-quarantine",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --write .",
    "prepare": "husky"
  },
  "dependencies": {},
  "devDependencies": {
    "@eslint/js": "^9.17.0",
    "@playwright/test": "^1.49.1",
    "@types/node": "^22.10.2",
    "dotenv": "^16.4.7",
    "eslint": "^9.17.0",
    "eslint-config-prettier": "^9.1.0",
    "globals": "^15.14.0",
    "husky": "^9.1.7",
    "lint-staged": "^15.3.0",
    "prettier": "^3.4.2",
    "typescript": "^5.7.2",
    "typescript-eslint": "^8.18.2"
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix"],
    "*.{ts,tsx,js,jsx,json,md,yml,yaml}": ["prettier --write"]
  }
}
