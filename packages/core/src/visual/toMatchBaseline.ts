import { expect, type Page, type TestInfo } from "@playwright/test";
import { DEFAULT_VISUAL_POLICY, isCanonicalVisualProject, type VisualPolicy } from "./policy.js";

/**
 * Skips (rather than fails) on non-canonical projects per `VisualPolicy` —
 * see policy.ts. Baseline updates only ever happen via the `visual.yml`
 * `workflow_dispatch` job, never automatically in a normal test run.
 */
export async function expectMatchesBaseline(
  page: Page,
  name: string,
  testInfo: TestInfo,
  policy: VisualPolicy = DEFAULT_VISUAL_POLICY,
): Promise<void> {
  if (!isCanonicalVisualProject(testInfo.project.name, policy)) {
    testInfo.skip(true, `Visual baseline is only maintained for: ${policy.canonicalProjects.join(", ")}`);
    return;
  }
  await expect(page).toHaveScreenshot(name, {
    maxDiffPixelRatio: policy.maxDiffPixelRatio,
    animations: policy.animations,
  });
}
