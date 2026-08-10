import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GraphRagEngine } from "@qaf/engine-contracts";
import type { QAAgentOrchestrator } from "@qaf/orchestrator";
import type { ExecutionStore } from "@qaf/storage-core";

export interface McpServerOptions {
  orchestrator: QAAgentOrchestrator;
  graphRag: GraphRagEngine;
  executionStore?: ExecutionStore;
}

const CiFailurePayloadShape = {
  runId: z.string(),
  source: z.enum(["github-actions", "azure-devops", "manual"]),
  repository: z.string(),
  commitSha: z.string(),
  changedRefs: z.array(z.string()),
  failure: z.object({
    testId: z.string(),
    file: z.string(),
    project: z.string(),
    errorMessage: z.string(),
    stackTrace: z.string(),
    failingNodeId: z.string(),
    timestamp: z.string(),
  }),
};

/**
 * Layer 1's MCP server — the IDE-integration entrypoint (Claude Code, or any
 * other MCP-speaking editor extension) alongside the REST/webhook surface
 * in `rest/app.ts`. Runs over stdio (see `bin/mcp-server.ts`), so it's a
 * separate process from the REST server, not another route on it — an IDE
 * spawns this directly rather than making HTTP calls.
 */
export function createMcpServer(options: McpServerOptions): McpServer {
  const server = new McpServer({ name: "qaf-gateway-api", version: "0.1.0" });

  server.tool(
    "trigger_qa_workflow",
    "Runs the QA orchestrator end-to-end for one CI/CD test-failure payload: impact analysis, synthetic data generation, test execution, self-healing (on failure), and root-cause analysis.",
    CiFailurePayloadShape,
    async (payload) => {
      const result = await options.orchestrator.run(payload);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "analyze_pr_impact",
    "Pre-merge impact analysis: given a PR's changed endpoint/service refs or file paths, returns the regression test subset and blast-radius score without running anything.",
    { changedRefs: z.array(z.string()) },
    async ({ changedRefs }) => {
      const impact = await options.graphRag.analyzeImpact(
        { changedRefs },
        { runId: `mcp-${Date.now()}`, startedAt: new Date().toISOString() },
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(impact, null, 2) }] };
    },
  );

  server.tool(
    "get_execution_history",
    "Looks up recorded orchestrator stage history for a run id.",
    { runId: z.string() },
    async ({ runId }) => {
      const history = (await options.executionStore?.query({ runId })) ?? [];
      return { content: [{ type: "text" as const, text: JSON.stringify(history, null, 2) }] };
    },
  );

  return server;
}
