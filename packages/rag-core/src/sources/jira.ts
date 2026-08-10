import type { DocumentSource, SourceDocument } from "./types.js";

/**
 * Shape only — `@qaf/rag-core` deliberately does not ship an Atlassian HTTP
 * client (no stored credentials/base-URL config inside this package). The
 * `/rag-coverage` skill fetches issues via the Atlassian MCP tools already
 * connected in Claude Code (`searchJiraIssuesUsingJql`, `getJiraIssue`) and
 * writes their normalized output to a JSON file matching `JiraIssueInput[]`;
 * `createJiraSource` just reads that file. Teams without the MCP connector
 * can populate the same file via their own Jira REST script and get
 * identical downstream behavior — see docs/rag-coverage.md.
 */
export interface JiraIssueInput {
  key: string;
  summary: string;
  description?: string;
  /** Acceptance criteria / requirements text, when tracked in a separate field than description. */
  acceptanceCriteria?: string;
  labels?: string[];
  status?: string;
  updated?: string;
  url?: string;
}

export interface JiraSourceOptions {
  loadIssues: () => Promise<JiraIssueInput[]>;
}

export function normalizeJiraIssues(issues: JiraIssueInput[]): SourceDocument[] {
  return issues.map((issue) => ({
    id: `jira:${issue.key}`,
    namespace: "jira",
    title: `${issue.key}: ${issue.summary}`,
    text: [issue.summary, issue.description, issue.acceptanceCriteria].filter(Boolean).join("\n\n"),
    url: issue.url,
    updatedAt: issue.updated,
    metadata: { key: issue.key, labels: issue.labels ?? [], status: issue.status },
  }));
}

export function createJiraSource(options: JiraSourceOptions): DocumentSource {
  return {
    namespace: "jira",
    async fetch(): Promise<SourceDocument[]> {
      const issues = await options.loadIssues();
      return normalizeJiraIssues(issues);
    },
  };
}
