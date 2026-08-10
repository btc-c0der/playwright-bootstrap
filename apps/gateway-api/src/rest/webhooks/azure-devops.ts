import { randomUUID } from "node:crypto";
import type { CiFailurePayload } from "@qaf/engine-contracts";

/** Same posture as `github-actions.ts`'s normalizer: expects a pipeline step that POSTs this shape, not Azure DevOps' raw service-hook event. */
export interface AzureDevOpsFailureBody {
  project: { name: string };
  resource: { repository: { name: string }; sourceVersion: string };
  changedFiles?: string[];
  test?: {
    id: string;
    file: string;
    project: string;
    errorMessage: string;
    stackTrace: string;
    failingNodeId: string;
  };
}

export function normalizeAzureDevOpsPayload(body: AzureDevOpsFailureBody): CiFailurePayload {
  if (!body.test) {
    throw new Error('Azure DevOps payload is missing "test" — see docs/gateway-api.md.');
  }
  return {
    runId: randomUUID(),
    source: "azure-devops",
    repository: `${body.project.name}/${body.resource.repository.name}`,
    commitSha: body.resource.sourceVersion,
    changedRefs: body.changedFiles ?? [],
    failure: {
      testId: body.test.id,
      file: body.test.file,
      project: body.test.project,
      errorMessage: body.test.errorMessage,
      stackTrace: body.test.stackTrace,
      failingNodeId: body.test.failingNodeId,
      timestamp: new Date().toISOString(),
    },
  };
}
