import { appendFile, readFile } from "node:fs/promises";
import type { HealCandidateRecipe, LocatorDescriptor, VectorHealingProvider, VectorHealingSuggestion } from "./types.js";

/** Default provider — vector-healing is opt-in, so the shipped default heals nothing. */
export class NoopVectorHealingProvider implements VectorHealingProvider {
  async captureOnSuccess(): Promise<void> {
    // intentionally no-op
  }

  async attemptHeal(): Promise<null> {
    return null;
  }
}

function describeRecipe(recipe: HealCandidateRecipe): string {
  switch (recipe.kind) {
    case "testId":
      return `testId: "${recipe.value}"`;
    case "role":
      return `role: { role: "${recipe.role}"${recipe.name ? `, name: "${recipe.name}"` : ""} }`;
    case "nth":
      return `nth: ${recipe.tag} #${recipe.index}`;
  }
}

/**
 * Renders a human-readable before/after so `vector-healing-suggestions.jsonl` reads like a
 * review-ready diff, not raw JSON a human has to mentally parse — same intent as a git patch.
 */
export function buildSuggestedPatch(descriptor: LocatorDescriptor, recipe: HealCandidateRecipe): string {
  const before = describeRecipe(
    descriptor.testId
      ? { kind: "testId", value: descriptor.testId }
      : descriptor.role
        ? { kind: "role", role: descriptor.role.role, name: String(descriptor.role.name ?? "") }
        : { kind: "nth", tag: "*", index: -1 },
  );
  return `- ${before}\n+ ${describeRecipe(recipe)}`;
}

/**
 * JSON Lines, not a single JSON array — same rationale as `locator-repair-suggestions.jsonl`:
 * `appendFile` is atomic-enough for concurrent Playwright workers, a read-modify-write on one
 * array would race under parallel execution. Written on *every* heal attempt that finds a
 * candidate at all (even below `minConfidence`) so the confidence trail is complete — the
 * `audit` skill and CI annotations decide what's actionable, this file just records what
 * happened.
 */
export async function appendVectorHealingSuggestion(suggestion: VectorHealingSuggestion): Promise<void> {
  const path = process.env.QAF_VECTOR_HEALING_SUGGESTIONS_PATH ?? "vector-healing-suggestions.jsonl";
  await appendFile(path, JSON.stringify(suggestion) + "\n", "utf-8");
}

export async function readVectorHealingSuggestions(path: string): Promise<VectorHealingSuggestion[]> {
  try {
    const raw = await readFile(path, "utf-8");
    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as VectorHealingSuggestion);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
