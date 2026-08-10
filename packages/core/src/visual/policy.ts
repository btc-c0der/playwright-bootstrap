export interface VisualPolicy {
  /**
   * Baselines are pinned to one canonical, dedicated project (by convention
   * named "visual") to avoid a combinatorial explosion of PNGs across
   * browsers x OSes x devices — every other project skips visual assertions
   * rather than failing on a baseline that was never meant to exist for it.
   */
  canonicalProjects: string[];
  maxDiffPixelRatio: number;
  animations: "disabled" | "allow";
}

export const DEFAULT_VISUAL_POLICY: VisualPolicy = {
  canonicalProjects: ["visual"],
  maxDiffPixelRatio: 0.01,
  animations: "disabled",
};

export function isCanonicalVisualProject(projectName: string, policy = DEFAULT_VISUAL_POLICY): boolean {
  return policy.canonicalProjects.includes(projectName);
}
