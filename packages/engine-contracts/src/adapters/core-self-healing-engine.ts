import type { AiRepairProvider, VectorHealingProvider } from "@qaf/core";
import type { AutoPrResult, GitAutoPrProvider } from "../git-auto-pr.js";
import type { ProposeRepairRequest, RepairProposal, SelfHealingEngine } from "../self-healing-engine.js";
import type { EngineContext } from "../types.js";

export interface CoreSelfHealingEngineOptions {
  aiRepairProvider: AiRepairProvider;
  vectorHealingProvider: VectorHealingProvider;
  gitAutoPrProvider: GitAutoPrProvider;
  /** Repo-relative path the patch summary is written to when a PR is opened. */
  patchFilePath?: string;
  baseBranch?: string;
}

const DEFAULT_PATCH_FILE = "locator-repair-suggestions.patch.md";

/**
 * `SelfHealingEngine` implemented directly against `@qaf/core`'s
 * `AiRepairProvider`/`VectorHealingProvider`, plus the Git auto-PR hook this
 * platform adds on top (`@qaf/core` itself only ever suggests — see
 * docs/self-healing-engine.md).
 */
export class CoreSelfHealingEngine implements SelfHealingEngine {
  constructor(private readonly options: CoreSelfHealingEngineOptions) {}

  async proposeRepair(request: ProposeRepairRequest, _context: EngineContext): Promise<RepairProposal> {
    const [aiSuggestion, vectorHeal] = await Promise.all([
      this.options.aiRepairProvider.suggest({
        descriptor: request.descriptor,
        domSnapshot: request.domSnapshot,
        screenshot: request.screenshot,
      }),
      this.options.vectorHealingProvider.attemptHeal({
        descriptor: request.descriptor,
        candidates: request.candidates,
      }),
    ]);
    return { aiSuggestion, vectorHeal, file: request.file, testTitle: request.testTitle };
  }

  async openAutoPr(proposals: RepairProposal[], context: EngineContext): Promise<AutoPrResult> {
    const actionable = proposals.filter((p) => p.aiSuggestion || p.vectorHeal);
    if (actionable.length === 0) {
      return { opened: false, reason: "No locator repairs proposed this run." };
    }

    const patchBody = actionable.map(describeSuggestion).join("\n\n");

    return this.options.gitAutoPrProvider.openPr({
      title: `qaf: locator self-heal (${actionable.length} suggestion${actionable.length === 1 ? "" : "s"})`,
      body: `Automated locator repair suggestions from orchestrator run \`${context.runId}\`.\n\n${patchBody}`,
      branchName: `qaf/self-heal-${context.runId}`,
      baseBranch: this.options.baseBranch,
      patches: [{ path: this.options.patchFilePath ?? DEFAULT_PATCH_FILE, contents: patchBody }],
    });
  }
}

function describeSuggestion(proposal: RepairProposal): string {
  if (proposal.aiSuggestion) {
    return (
      `- **${proposal.testTitle ?? proposal.aiSuggestion.fallbackLabel}** (${proposal.file ?? "unknown file"}): ` +
      `${proposal.aiSuggestion.rationale}\n  \`${proposal.aiSuggestion.suggestedSelector}\` ` +
      `(confidence ${proposal.aiSuggestion.confidence})`
    );
  }
  if (proposal.vectorHeal) {
    return (
      `- **${proposal.testTitle ?? "unknown test"}** (${proposal.file ?? "unknown file"}): ` +
      `vector-fingerprint match, confidence ${proposal.vectorHeal.confidence}`
    );
  }
  return "";
}
