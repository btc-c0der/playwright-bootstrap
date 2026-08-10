import path from "node:path";
import { readFile } from "node:fs/promises";
import { NoopEmbeddingProvider } from "../embedding/noop.js";
import type { EmbeddingProvider } from "../embedding/types.js";

/**
 * `@qaf/rag-core` ships no real `EmbeddingProvider` (no default credentials,
 * same posture as `AiRepairProvider`) — wiring one is a consuming-repo
 * choice. Since there's no Playwright fixture system to override in a plain
 * CLI, the equivalent extension point is a JS module path: set
 * `QAF_RAG_PROVIDER_MODULE` to a module whose default export is either an
 * `EmbeddingProvider` or a zero-arg factory returning one. See
 * docs/rag-coverage.md for an example.
 */
export async function loadProviderFromEnv(): Promise<EmbeddingProvider> {
  const modulePath = process.env.QAF_RAG_PROVIDER_MODULE;
  if (!modulePath) return new NoopEmbeddingProvider();

  const resolved = path.isAbsolute(modulePath)
    ? modulePath
    : path.resolve(process.cwd(), modulePath);
  const mod = (await import(resolved)) as { default?: unknown };
  const exported = mod.default;
  if (typeof exported === "function") {
    return (exported as () => EmbeddingProvider)();
  }
  if (exported && typeof exported === "object" && "embed" in exported) {
    return exported as EmbeddingProvider;
  }
  throw new Error(
    `QAF_RAG_PROVIDER_MODULE ("${modulePath}") must default-export an EmbeddingProvider or a factory returning one.`,
  );
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}
