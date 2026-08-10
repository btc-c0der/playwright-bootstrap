import path from "node:path";
import { readFile } from "node:fs/promises";
import type { EmbeddingProvider } from "@qaf/rag-core";
import { NoopLLMProvider } from "../generation/llm-provider.js";
import type { LLMProvider } from "../generation/llm-provider.js";
import type { SeedTarget } from "../seeding/seed-target.js";

/**
 * Same module-path extension mechanism as `@qaf/rag-core`'s
 * `loadProviderFromEnv` — no default credentials shipped, so wiring a real
 * LLM (OpenAI/Anthropic/a local Ollama model) is a consuming-repo choice. Kept
 * as its own env var (`QAF_SYNTH_LLM_PROVIDER_MODULE`, not reusing
 * `QAF_RAG_PROVIDER_MODULE`) since a team may reasonably want a cheaper/faster
 * model for embeddings than for generation.
 */
export async function loadLlmProviderFromEnv(): Promise<LLMProvider> {
  const modulePath = process.env.QAF_SYNTH_LLM_PROVIDER_MODULE;
  if (!modulePath) return new NoopLLMProvider();
  const exported = await importDefault(modulePath);
  if (typeof exported === "function") return (exported as () => LLMProvider)();
  if (exported && typeof exported === "object" && "complete" in exported) return exported as LLMProvider;
  throw new Error(
    `QAF_SYNTH_LLM_PROVIDER_MODULE ("${modulePath}") must default-export an LLMProvider or a factory returning one.`,
  );
}

/** Embeddings for the Constraint Rules Registry — a separate provider from generation itself, since retrieval is a much cheaper/smaller model than what actually writes the JSON payload. */
export async function loadEmbeddingProviderFromEnv(): Promise<EmbeddingProvider> {
  const modulePath = process.env.QAF_SYNTH_EMBEDDING_PROVIDER_MODULE;
  if (!modulePath) {
    throw new Error(
      "QAF_SYNTH_EMBEDDING_PROVIDER_MODULE is not set — the Constraint Rules Registry needs a real " +
        "EmbeddingProvider to embed constraint rules. See docs/synthetic-data-engine.md.",
    );
  }
  const exported = await importDefault(modulePath);
  if (typeof exported === "function") return (exported as () => EmbeddingProvider)();
  if (exported && typeof exported === "object" && "embed" in exported) return exported as EmbeddingProvider;
  throw new Error(
    `QAF_SYNTH_EMBEDDING_PROVIDER_MODULE ("${modulePath}") must default-export an EmbeddingProvider or a factory returning one.`,
  );
}

/**
 * `qaf-synth-serve`'s optional live-injection backend — no default, since
 * writing to a real staging Postgres/Mongo instance always means importing a
 * driver this package deliberately doesn't depend on (see
 * `seeding/postgres-seed-target.ts`/`mongo-seed-target.ts`). Omitting this env
 * var runs the server generation-only: `/generate` works, `/teardown` 501s.
 */
export async function loadSeedTargetFromEnv(): Promise<SeedTarget | undefined> {
  const modulePath = process.env.QAF_SYNTH_SEED_TARGET_MODULE;
  if (!modulePath) return undefined;
  const exported = await importDefault(modulePath);
  if (typeof exported === "function") return (exported as () => SeedTarget)();
  if (exported && typeof exported === "object" && "seed" in exported) return exported as SeedTarget;
  throw new Error(
    `QAF_SYNTH_SEED_TARGET_MODULE ("${modulePath}") must default-export a SeedTarget or a factory returning one.`,
  );
}

async function importDefault(modulePath: string): Promise<unknown> {
  const resolved = path.isAbsolute(modulePath) ? modulePath : path.resolve(process.cwd(), modulePath);
  const mod = (await import(resolved)) as { default?: unknown };
  return mod.default;
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}
