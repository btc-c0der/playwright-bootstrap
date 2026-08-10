import { appendFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import type { AiRepairProvider, LocatorDescriptor, RepairSuggestion } from "./types.js";

/** Default provider — AI-repair is opt-in, so the shipped default does nothing. */
export class NoopAiRepairProvider implements AiRepairProvider {
  async suggest(): Promise<RepairSuggestion | null> {
    return null;
  }
}

export async function captureAndSuggestRepair(
  page: Page,
  descriptor: LocatorDescriptor,
  provider: AiRepairProvider,
): Promise<RepairSuggestion | null> {
  const [domSnapshot, screenshot] = await Promise.all([
    page.content(),
    page.screenshot({ type: "png" }),
  ]);
  const suggestion = await provider.suggest({ descriptor, domSnapshot, screenshot });
  if (suggestion) {
    await appendSuggestion(suggestion);
  }
  return suggestion;
}

/**
 * JSON Lines, not a single JSON array: appendFile is atomic-enough for concurrent
 * Playwright workers, whereas a read-modify-write on one JSON array would race and
 * drop suggestions under parallel execution. `qaf-check-quarantine`'s CI step and
 * the `audit` skill both read this file to post PR annotations / health reports —
 * suggestions are advisory only and are never applied back to test source.
 */
async function appendSuggestion(suggestion: RepairSuggestion): Promise<void> {
  const path = process.env.QAF_REPAIR_SUGGESTIONS_PATH ?? "locator-repair-suggestions.jsonl";
  await appendFile(path, JSON.stringify(suggestion) + "\n", "utf-8");
}
