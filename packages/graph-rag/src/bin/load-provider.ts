import path from "node:path";
import { NoopEmbeddingProvider } from "@qaf/rag-core";
import type { EmbeddingProvider } from "@qaf/rag-core";

/**
 * Same extension point as `@qaf/rag-core`'s `bin/load-provider.ts`, under
 * this package's own env var name (`QAF_GRAPH_PROVIDER_MODULE`) — kept
 * separate rather than sharing rag-core's `QAF_RAG_PROVIDER_MODULE` because a
 * team may legitimately want a different embedding model for root-cause
 * diagnosis than for spec-to-test coverage.
 */
export async function loadProviderFromEnv(): Promise<EmbeddingProvider> {
  const modulePath = process.env.QAF_GRAPH_PROVIDER_MODULE;
  if (!modulePath) return new NoopEmbeddingProvider();

  const resolved = path.isAbsolute(modulePath) ? modulePath : path.resolve(process.cwd(), modulePath);
  const mod = (await import(resolved)) as { default?: unknown };
  const exported = mod.default;
  if (typeof exported === "function") {
    return (exported as () => EmbeddingProvider)();
  }
  if (exported && typeof exported === "object" && "embed" in exported) {
    return exported as EmbeddingProvider;
  }
  throw new Error(
    `QAF_GRAPH_PROVIDER_MODULE ("${modulePath}") must default-export an EmbeddingProvider or a factory returning one.`,
  );
}
