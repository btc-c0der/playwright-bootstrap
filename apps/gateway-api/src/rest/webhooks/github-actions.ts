import { randomUUID } from "node:crypto";
import type { CiFailurePayload } from "@qaf/engine-contracts";

/**
 * GitHub's own workflow-run/check-run webhook events don't carry per-test
 * failure detail — this expects a workflow step that POSTs this richer
 * shape (e.g. a small script run after `playwright test` on failure, using
 * `@qaf/core`'s `HistoryReporter` output) rather than the raw GitHub webhook
 * event. See docs/gateway-api.md for the workflow snippet.
 */
export interface GithubActionsFailureBody {
  repository: { full_name: string };
  head_sha: string;
  changed_files?: string[];
  test?: {
    id: string;
    file: string;
    project: string;
    error_message: string;
    stack_trace: string;
    failing_node_id: string;
  };
}

export function normalizeGithubActionsPayload(body: GithubActionsFailureBody): CiFailurePayload {
  if (!body.test) {
    throw new Error(
      'GitHub Actions payload is missing "test" — POST the shape docs/gateway-api.md documents, not the raw GitHub webhook event.',
    );
  }
  return {
    runId: randomUUID(),
    source: "github-actions",
    repository: body.repository.full_name,
    commitSha: body.head_sha,
    changedRefs: body.changed_files ?? [],
    failure: {
      testId: body.test.id,
      file: body.test.file,
      project: body.test.project,
      errorMessage: body.test.error_message,
      stackTrace: body.test.stack_trace,
      failingNodeId: body.test.failing_node_id,
      timestamp: new Date().toISOString(),
    },
  };
}
