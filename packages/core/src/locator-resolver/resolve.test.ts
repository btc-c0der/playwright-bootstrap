import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import type { Locator, Page } from "@playwright/test";
import { createLocatorResolver, LocatorResolutionError } from "./resolve.js";
import { Logger } from "../logger/Logger.js";
import type {
  AiRepairProvider,
  ElementSnapshot,
  RepairSuggestion,
  VectorHealingProvider,
  VectorHealResult,
} from "./types.js";

process.env.QAF_LOG_LEVEL = "silent";
const logger = Logger.root();

const FAKE_SNAPSHOT: ElementSnapshot = {
  tag: "button",
  textContent: "Submit",
  ariaLabel: null,
  role: null,
  testId: "submit",
  boundingBox: null,
  parentTag: null,
  parentTestId: null,
  childTags: [],
  neighborText: [],
};

class FakeLocator {
  constructor(private readonly exists: boolean) {}
  first() {
    return this;
  }
  async waitFor(_opts: { state: string; timeout: number }): Promise<void> {
    if (!this.exists) throw new Error("not found");
  }
  async evaluate(): Promise<ElementSnapshot> {
    return FAKE_SNAPSHOT;
  }
}

function fakePage(config: {
  testId?: boolean | ((id: string) => boolean);
  role?: boolean;
  text?: boolean;
}): Page {
  const testIdConfig = config.testId;
  const testIdMatch = typeof testIdConfig === "function" ? testIdConfig : () => testIdConfig ?? false;
  return {
    getByTestId: (id: string) => new FakeLocator(testIdMatch(id)) as unknown as Locator,
    getByRole: () => new FakeLocator(config.role ?? false) as unknown as Locator,
    getByText: () => new FakeLocator(config.text ?? false) as unknown as Locator,
    content: async () => "<html></html>",
    screenshot: async () => Buffer.from(""),
    evaluate: async () => [],
  } as unknown as Page;
}

test("resolves via testId first when it exists, without trying role/text", async () => {
  const page = fakePage({ testId: true, role: false, text: false });
  const resolve = createLocatorResolver({ page }, logger);

  const locator = await resolve({ testId: "submit", fallbackLabel: "submit button" });
  assert.ok(locator);
});

test("falls back to role when testId is absent", async () => {
  const page = fakePage({ role: true });
  const resolve = createLocatorResolver({ page }, logger);

  const locator = await resolve({
    role: { role: "button", name: "Delete" },
    fallbackLabel: "delete button",
  });
  assert.ok(locator);
});

test("falls back to text when testId and role are absent/not found", async () => {
  const page = fakePage({ testId: false, role: false, text: true });
  const resolve = createLocatorResolver({ page }, logger);

  const locator = await resolve({
    testId: "missing",
    role: { role: "button", name: "Missing" },
    text: "found me",
    fallbackLabel: "some element",
  });
  assert.ok(locator);
});

test("throws LocatorResolutionError when every strategy is exhausted", async () => {
  const page = fakePage({});
  const resolve = createLocatorResolver({ page }, logger);

  await assert.rejects(
    () => resolve({ testId: "nope", fallbackLabel: "nothing" }),
    LocatorResolutionError,
  );
});

test("AI-repair suggestion is recorded advisory-only and never blocks the thrown error", async () => {
  const suggestionsPath = "./repair-suggestions.test.jsonl";
  process.env.QAF_REPAIR_SUGGESTIONS_PATH = suggestionsPath;
  await rm(suggestionsPath, { force: true });

  const provider: AiRepairProvider = {
    async suggest(): Promise<RepairSuggestion> {
      return {
        descriptor: { fallbackLabel: "x" },
        fallbackLabel: "x",
        suggestedSelector: '[data-testid="x"]',
        confidence: 0.5,
        rationale: "test",
        timestamp: new Date().toISOString(),
      };
    },
  };

  const page = fakePage({});
  const resolve = createLocatorResolver({ page }, logger);

  await assert.rejects(
    () => resolve({ testId: "nope", fallbackLabel: "x" }, { aiRepair: { enabled: true, provider } }),
    LocatorResolutionError,
  );

  const written = await readFile(suggestionsPath, "utf-8");
  assert.match(written, /data-testid/);
  assert.match(written, /suggestedSelector/);

  await rm(suggestionsPath, { force: true });
  delete process.env.QAF_REPAIR_SUGGESTIONS_PATH;
});

test("vector-healing captures a snapshot after a successful resolution", async () => {
  const page = fakePage({ testId: true });
  const resolve = createLocatorResolver({ page }, logger);

  let captured: ElementSnapshot | undefined;
  const provider: VectorHealingProvider = {
    async captureOnSuccess({ snapshot }) {
      captured = snapshot;
    },
    async attemptHeal() {
      return null;
    },
  };

  await resolve(
    { testId: "submit", fallbackLabel: "submit button" },
    { vectorHealing: { enabled: true, provider } },
  );

  assert.deepEqual(captured, FAKE_SNAPSHOT);
});

test("a vector-healing capture failure never blocks the successful resolution it followed", async () => {
  const page = fakePage({ testId: true });
  const resolve = createLocatorResolver({ page }, logger);

  const provider: VectorHealingProvider = {
    async captureOnSuccess() {
      throw new Error("embedding API down");
    },
    async attemptHeal() {
      return null;
    },
  };

  const locator = await resolve(
    { testId: "submit", fallbackLabel: "submit button" },
    { vectorHealing: { enabled: true, provider } },
  );
  assert.ok(locator);
});

test("vector-healing below minConfidence still throws, but records an advisory (non-executed) suggestion", async () => {
  const suggestionsPath = "./vector-healing-suggestions.advisory.test.jsonl";
  process.env.QAF_VECTOR_HEALING_SUGGESTIONS_PATH = suggestionsPath;
  await rm(suggestionsPath, { force: true });

  const page = fakePage({});
  const resolve = createLocatorResolver({ page }, logger);

  const result: VectorHealResult = {
    candidate: { snapshot: FAKE_SNAPSHOT, recipe: { kind: "testId", value: "healed-id" } },
    confidence: 0.4,
  };
  const provider: VectorHealingProvider = {
    async captureOnSuccess() {},
    async attemptHeal() {
      return result;
    },
  };

  await assert.rejects(
    () =>
      resolve(
        { testId: "missing", fallbackLabel: "x" },
        { vectorHealing: { enabled: true, provider, autoExecute: true } },
      ),
    LocatorResolutionError,
  );

  const written = await readFile(suggestionsPath, "utf-8");
  assert.match(written, /"autoExecuted":false/);
  assert.match(written, /healed-id/);

  await rm(suggestionsPath, { force: true });
  delete process.env.QAF_VECTOR_HEALING_SUGGESTIONS_PATH;
});

test("vector-healing at/above minConfidence with autoExecute returns a substitute Locator instead of throwing", async () => {
  const suggestionsPath = "./vector-healing-suggestions.auto.test.jsonl";
  process.env.QAF_VECTOR_HEALING_SUGGESTIONS_PATH = suggestionsPath;
  await rm(suggestionsPath, { force: true });

  const page = fakePage({ testId: (id) => id === "healed-id" });
  const resolve = createLocatorResolver({ page }, logger);

  const result: VectorHealResult = {
    candidate: { snapshot: FAKE_SNAPSHOT, recipe: { kind: "testId", value: "healed-id" } },
    confidence: 0.91,
  };
  const provider: VectorHealingProvider = {
    async captureOnSuccess() {},
    async attemptHeal() {
      return result;
    },
  };

  const locator = await resolve(
    { testId: "renamed-away", fallbackLabel: "submit button" },
    { vectorHealing: { enabled: true, provider, autoExecute: true, minConfidence: 0.85 } },
  );
  assert.ok(locator);

  const written = await readFile(suggestionsPath, "utf-8");
  assert.match(written, /"autoExecuted":true/);

  await rm(suggestionsPath, { force: true });
  delete process.env.QAF_VECTOR_HEALING_SUGGESTIONS_PATH;
});

test("vector-healing above minConfidence without autoExecute still throws (advisory-only default)", async () => {
  const suggestionsPath = "./vector-healing-suggestions.default.test.jsonl";
  process.env.QAF_VECTOR_HEALING_SUGGESTIONS_PATH = suggestionsPath;
  await rm(suggestionsPath, { force: true });

  const page = fakePage({ testId: (id) => id === "healed-id" });
  const resolve = createLocatorResolver({ page }, logger);

  const result: VectorHealResult = {
    candidate: { snapshot: FAKE_SNAPSHOT, recipe: { kind: "testId", value: "healed-id" } },
    confidence: 0.97,
  };
  const provider: VectorHealingProvider = {
    async captureOnSuccess() {},
    async attemptHeal() {
      return result;
    },
  };

  await assert.rejects(
    () =>
      resolve(
        { testId: "renamed-away", fallbackLabel: "submit button" },
        { vectorHealing: { enabled: true, provider } },
      ),
    LocatorResolutionError,
  );

  const written = await readFile(suggestionsPath, "utf-8");
  assert.match(written, /"autoExecuted":false/);

  await rm(suggestionsPath, { force: true });
  delete process.env.QAF_VECTOR_HEALING_SUGGESTIONS_PATH;
});
