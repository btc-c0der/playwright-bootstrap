import type { VectorNamespace } from "../vector-store/types.js";

export type CoverageStatus = "covered" | "partial" | "gap";

export interface MatchedTest {
  testId: string;
  score: number;
}

export interface CoverageMapping {
  specId: string;
  specTitle: string;
  specNamespace: VectorNamespace;
  matchedTests: MatchedTest[];
  status: CoverageStatus;
}

export interface OrphanTest {
  testId: string;
  testTitle: string;
}

export interface CoverageResult {
  mappings: CoverageMapping[];
  orphans: OrphanTest[];
}
