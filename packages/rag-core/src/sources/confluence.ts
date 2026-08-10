import type { DocumentSource, SourceDocument } from "./types.js";

/**
 * Shape only, same rationale as jira.ts: the `/rag-coverage` skill fetches
 * pages via the Atlassian MCP tools (`getConfluencePage`,
 * `searchConfluenceUsingCql`), normalizes to `ConfluencePageInput[]`, and this
 * source just reads that. No Confluence HTTP client ships in this package.
 */
export interface ConfluencePageInput {
  id: string;
  title: string;
  /** Page body, already converted to plain text/markdown by whatever fetched it. */
  body: string;
  spaceKey?: string;
  updated?: string;
  url?: string;
}

export interface ConfluenceSourceOptions {
  loadPages: () => Promise<ConfluencePageInput[]>;
}

export function normalizeConfluencePages(pages: ConfluencePageInput[]): SourceDocument[] {
  return pages.map((page) => ({
    id: `confluence:${page.id}`,
    namespace: "confluence",
    title: page.title,
    text: page.body,
    url: page.url,
    updatedAt: page.updated,
    metadata: { spaceKey: page.spaceKey },
  }));
}

export function createConfluenceSource(options: ConfluenceSourceOptions): DocumentSource {
  return {
    namespace: "confluence",
    async fetch(): Promise<SourceDocument[]> {
      const pages = await options.loadPages();
      return normalizeConfluencePages(pages);
    },
  };
}
