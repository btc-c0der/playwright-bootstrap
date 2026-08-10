/**
 * The normalized shape every Layer 1 entrypoint (REST webhook, MCP tool
 * call) converts a CI/CD test failure into before handing it to
 * `@qaf/orchestrator`'s `QAAgentOrchestrator` — one shape regardless of
 * whether the failure came from a GitHub Actions run, an Azure DevOps
 * pipeline, or a direct API call. Layer 1's webhook handlers own translating
 * GitHub's/Azure's own payload shape into this; this package only defines
 * what's on the other side of that translation.
 */
export interface CiFailurePayload {
  runId: string;
  source: "github-actions" | "azure-devops" | "manual";
  repository: string;
  commitSha: string;
  /** PR-changed endpoint/service refs or file paths — feeds `GraphRagEngine.analyzeImpact`. */
  changedRefs: string[];
  failure: {
    testId: string;
    file: string;
    project: string;
    errorMessage: string;
    stackTrace: string;
    /** The system-topology node this failure surfaced on — feeds `GraphRagEngine.diagnoseRootCause`. */
    failingNodeId: string;
    timestamp: string;
  };
}
