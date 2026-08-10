import type { Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import type { Logger } from "../logger/Logger.js";

export type AxeSeverity = "minor" | "moderate" | "serious" | "critical";

export interface A11yPolicy {
  /** Violations at or above this severity fail the audit; below it, only logged. */
  failOn: AxeSeverity[];
  /** Rule IDs to skip entirely (documented, allowlisted exceptions only). */
  disabledRules: string[];
}

export const DEFAULT_A11Y_POLICY: A11yPolicy = {
  failOn: ["serious", "critical"],
  disabledRules: [],
};

export interface A11yResult {
  passed: boolean;
  violations: Array<{ id: string; impact: AxeSeverity | null; help: string; nodes: number }>;
}

export async function runA11yAudit(
  page: Page,
  logger: Logger,
  policy: A11yPolicy = DEFAULT_A11Y_POLICY,
): Promise<A11yResult> {
  const results = await new AxeBuilder({ page }).disableRules(policy.disabledRules).analyze();

  const violations = results.violations.map((v) => ({
    id: v.id,
    impact: (v.impact ?? null) as AxeSeverity | null,
    help: v.help,
    nodes: v.nodes.length,
  }));

  const blocking = violations.filter((v) => v.impact && policy.failOn.includes(v.impact));
  for (const v of violations) {
    logger.warn("a11y violation", { rule: v.id, impact: v.impact, help: v.help, nodes: v.nodes });
  }

  return { passed: blocking.length === 0, violations };
}
