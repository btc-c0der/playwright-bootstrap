import Fastify, { type FastifyInstance } from "fastify";
import type { CiFailurePayload } from "@qaf/engine-contracts";
import type { QAAgentOrchestrator, QAWorkflowStateType } from "@qaf/orchestrator";
import type { ExecutionStore } from "@qaf/storage-core";
import { normalizeAzureDevOpsPayload } from "./webhooks/azure-devops.js";
import type { AzureDevOpsFailureBody } from "./webhooks/azure-devops.js";
import { normalizeGithubActionsPayload } from "./webhooks/github-actions.js";
import type { GithubActionsFailureBody } from "./webhooks/github-actions.js";

export interface RestAppOptions {
  orchestrator: QAAgentOrchestrator;
  executionStore?: ExecutionStore;
}

/**
 * Layer 1's REST surface: CI/CD webhook receivers (GitHub Actions / Azure
 * DevOps) plus a direct trigger endpoint for any client that already has a
 * normalized `CiFailurePayload` — the demo script, a future Web UI, or the
 * MCP server's `trigger_qa_workflow` tool could just as easily call this
 * over HTTP instead of holding its own `QAAgentOrchestrator` reference.
 * Fastify's built-in `pino` logger stands in for `console.*`, which this
 * monorepo's ESLint config bans everywhere, services included.
 */
export function createRestApp(options: RestAppOptions): FastifyInstance {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ status: "ok" }));

  app.post<{ Body: GithubActionsFailureBody }>("/webhooks/github-actions", async (request, reply) => {
    const payload = normalizeGithubActionsPayload(request.body);
    const result = await options.orchestrator.run(payload);
    reply.send(toRunSummary(result));
  });

  app.post<{ Body: AzureDevOpsFailureBody }>("/webhooks/azure-devops", async (request, reply) => {
    const payload = normalizeAzureDevOpsPayload(request.body);
    const result = await options.orchestrator.run(payload);
    reply.send(toRunSummary(result));
  });

  app.post<{ Body: CiFailurePayload }>("/api/v1/qa-runs", async (request, reply) => {
    const result = await options.orchestrator.run(request.body);
    reply.send(toRunSummary(result));
  });

  app.get<{ Params: { runId: string } }>("/api/v1/qa-runs/:runId", async (request, reply) => {
    if (!options.executionStore) {
      reply.code(501).send({ error: "No ExecutionStore configured — nothing to query." });
      return;
    }
    const history = await options.executionStore.query({ runId: request.params.runId });
    reply.send({ runId: request.params.runId, history });
  });

  return app;
}

function toRunSummary(result: QAWorkflowStateType) {
  return {
    runId: result.runId,
    impactRadiusScore: result.impact?.impactRadiusScore,
    selectedTests: result.impact?.selectedTests,
    generationValidated: result.generatedData?.validation_status,
    testPassed: result.execution?.passed,
    repairProposalCount: result.repairProposals.length,
    autoPr: result.autoPr,
    rootCause: result.rootCause,
  };
}
