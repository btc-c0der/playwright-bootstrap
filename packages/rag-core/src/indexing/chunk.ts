import { createHash } from "node:crypto";
import type { SourceDocument } from "../sources/types.js";
import type { VectorNamespace } from "../vector-store/types.js";

export interface Chunk {
  /** `sourceId` unchanged if the doc fit in one chunk, else `${sourceId}#${index}`. */
  id: string;
  namespace: VectorNamespace;
  text: string;
  /** sha256 of the trimmed chunk text — what `indexing/index.ts` diffs against a prior run. */
  contentHash: string;
  metadata: Record<string, unknown>;
  sourceId: string;
  sourceUrl?: string;
  sourceUpdatedAt?: string;
}

export interface ChunkOptions {
  /** Docs (or sections, once split) under this length are kept as one chunk. */
  maxChars?: number;
}

/**
 * Prose-document namespaces get split by markdown heading when long; the
 * rest (test/jira/zephyr/ci-failure) are already-small, intent-sized units
 * where further splitting would just fragment one idea across chunks.
 */
const HEADING_CHUNKED_NAMESPACES: ReadonlySet<VectorNamespace> = new Set(["spec", "confluence"]);

const DEFAULT_MAX_CHARS = 4000;

/**
 * Chunking strategy dominates result quality more than embedding model
 * choice (see docs/rag-coverage-plan.md's Risks section) — this is
 * deliberately a small, inspectable function rather than something buried in
 * `indexing/index.ts`, so it's the first thing to tune/replace per-namespace.
 */
export function chunkDocument(doc: SourceDocument, options: ChunkOptions = {}): Chunk[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const pieces =
    HEADING_CHUNKED_NAMESPACES.has(doc.namespace) && doc.text.length > maxChars
      ? splitByHeading(doc.text, maxChars)
      : [{ heading: doc.title, text: doc.text }];

  return pieces.map((piece, index) => ({
    id: pieces.length > 1 ? `${doc.id}#${index}` : doc.id,
    namespace: doc.namespace,
    text: piece.text,
    contentHash: hashText(piece.text),
    metadata: { ...doc.metadata, title: piece.heading ?? doc.title, chunkIndex: index },
    sourceId: doc.id,
    sourceUrl: doc.url,
    sourceUpdatedAt: doc.updatedAt,
  }));
}

interface Section {
  heading?: string;
  text: string;
}

function splitByHeading(text: string, maxChars: number): Section[] {
  const lines = text.split("\n");
  const sections: Section[] = [];
  let currentHeading: string | undefined;
  let currentLines: string[] = [];

  const flush = (): void => {
    const body = currentLines.join("\n").trim();
    if (body.length > 0) sections.push({ heading: currentHeading, text: body });
    currentLines = [];
  };

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[2]?.trim();
    }
    currentLines.push(line);
  }
  flush();

  return mergeSmallSections(sections, maxChars);
}

/** Coalesces adjacent short sections so frequent headings don't flood the index with near-empty chunks. */
function mergeSmallSections(sections: Section[], maxChars: number): Section[] {
  const merged: Section[] = [];
  for (const section of sections) {
    const last = merged[merged.length - 1];
    if (last && last.text.length + section.text.length <= maxChars) {
      last.text = `${last.text}\n\n${section.text}`;
    } else {
      merged.push({ ...section });
    }
  }
  return merged;
}

function hashText(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}
