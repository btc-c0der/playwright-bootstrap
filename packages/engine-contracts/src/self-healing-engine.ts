import type { HealCandidate, LocatorDescriptor, RepairSuggestion, VectorHealResult } from "@qaf/core";
import type { AutoPrResult } from "./git-auto-pr.js";
import type { EngineContext } from "./types.js";

export interface ProposeRepairRequest {
  descriptor: LocatorDescriptor;
  domSnapshot: string;
  screenshot: Buffer;
  candidates: HealCandidate[];
  file?: string;
  testTitle?: string;
}

export interface RepairProposal {
  aiSuggestion: RepairSuggestion | null;
  vectorHeal: VectorHealResult | null;
  file?: string;
  testTitle?: string;
}

/**
 * Engine 2 — Self-Healing Interceptor: DOM vector fingerprinting + cosine
 * similarity locators (`@qaf/core`'s `locator-resolver`), plus the Git
 * auto-PR hook (`GitAutoPrProvider`, see git-auto-pr.ts) that turns confirmed
 * repairs into an open pull request instead of a suggestion file nobody reads.
 */
export interface SelfHealingEngine {
  /** Runs both repair strategies (LLM-suggested + vector-fingerprint match) for one broken locator and returns whichever fired. Never mutates the running test — same "propose, don't silently swap" posture as `@qaf/core`. */
  proposeRepair(request: ProposeRepairRequest, context: EngineContext): Promise<RepairProposal>;
  /** Opens (or reports why it didn't) a pull request applying every repair proposal collected since the last flush — called once per orchestrator run, not once per locator. */
  openAutoPr(proposals: RepairProposal[], context: EngineContext): Promise<AutoPrResult>;
}
