import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { DocumentSource, SourceDocument } from "./types.js";

export interface InternalSpecsSourceOptions {
  /** Directories to walk, relative to `cwd`. Defaults to the common `docs/` layout. */
  dirs?: string[];
  cwd?: string;
  /** Directory names never descended into, regardless of depth. */
  ignoreDirs?: string[];
}

/**
 * Treats this repo's own markdown docs as "specs" — the zero-external-dependency
 * source for phase 1 (see docs/rag-coverage-plan.md). One `SourceDocument` per
 * file; `indexing/chunk.ts` splits by heading for anything long enough to need it.
 */
export function createInternalSpecsSource(
  options: InternalSpecsSourceOptions = {},
): DocumentSource {
  const cwd = options.cwd ?? process.cwd();
  const dirs = options.dirs ?? ["docs"];
  const ignoreDirs = new Set(options.ignoreDirs ?? ["node_modules", "dist", ".git", ".qaf"]);

  return {
    namespace: "spec",
    async fetch(): Promise<SourceDocument[]> {
      const files: string[] = [];
      for (const dir of dirs) {
        await collectMarkdownFiles(path.join(cwd, dir), ignoreDirs, files);
      }
      const docs: SourceDocument[] = [];
      for (const file of files) {
        const text = await readFile(file, "utf-8");
        const relPath = path.relative(cwd, file);
        docs.push({
          id: `spec:${relPath}`,
          namespace: "spec",
          title: extractTitle(text) ?? relPath,
          text,
          metadata: { file: relPath, source: "internal-spec" },
        });
      }
      return docs;
    },
  };
}

async function collectMarkdownFiles(
  dir: string,
  ignoreDirs: Set<string>,
  out: string[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (ignoreDirs.has(entry.name)) continue;
      await collectMarkdownFiles(path.join(dir, entry.name), ignoreDirs, out);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(path.join(dir, entry.name));
    }
  }
}

/** First `# Heading` in the file, if any — falls back to the file path as the title. */
function extractTitle(text: string): string | undefined {
  const match = /^#\s+(.+)$/m.exec(text);
  return match?.[1]?.trim();
}
