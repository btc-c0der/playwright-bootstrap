import type { EmbeddingProvider } from "@qaf/rag-core";
import type { EntitySchema } from "../ingestion/types.js";
import type { ConstraintVectorStore } from "../registry/types.js";
import { retrieveConstraints } from "../registry/constraint-registry.js";
import { generateWithSelfCorrection } from "../validation/self-correct.js";
import { validatePayload, type ValidatePayloadOptions } from "../validation/validate.js";
import type { EntityTreePayload } from "../validation/referential-integrity.js";
import type { ValidationIssue } from "../validation/types.js";
import type { LLMProvider } from "./llm-provider.js";
import { buildGenerationPrompt } from "./prompt-builder.js";
import { extractJson } from "./parse-llm-json.js";

export interface GenerateOptions {
  /** The tester's natural-language request. */
  request: string;
  /** Which ingested entity this request is primarily about — must exist in `entitySchemas`. */
  primaryEntity: string;
  /** Every entity ingested so far — `generateSyntheticPayload` narrows this to `primaryEntity` plus its FK neighborhood (see `relatedEntitySchemas`) for both prompting and validation. */
  entitySchemas: EntitySchema[];
  llmProvider: LLMProvider;
  embeddingProvider: EmbeddingProvider;
  constraintStore: ConstraintVectorStore;
  isolationKey: string;
  /** Requirement 3: "max 3 retries" — defaults to 3 in `validation/self-correct.ts`. */
  maxRetries?: number;
  /** Constraint rules retrieved per generation call — defaults to 15. */
  topK?: number;
  validation?: ValidatePayloadOptions;
}

/** The JSON payload requirement 5 asks every generation call to return. */
export interface GenerationResult {
  generated_data: EntityTreePayload;
  validation_status: boolean;
  isolation_key: string;
  /** Total LLM completions actually made (1 if the first attempt already validated, up to 1 + maxRetries). */
  attempts: number;
  issues: ValidationIssue[];
}

/**
 * The Just-In-Time generation entry point (requirement 2): retrieves the
 * constraint rules relevant to `request` from the registry (RAG), builds a
 * prompt scoped to `primaryEntity` and its immediate foreign-key neighborhood,
 * and runs the LLM completion through `validation/self-correct.ts`'s retry
 * loop until it validates or retries are exhausted. Never throws on a
 * validation failure — `validation_status: false` in the returned result is
 * the signal; `seeding/` refuses to insert a payload with that flag set.
 */
export async function generateSyntheticPayload(options: GenerateOptions): Promise<GenerationResult> {
  const primarySchema = options.entitySchemas.find((s) => s.name === options.primaryEntity);
  if (!primarySchema) {
    throw new Error(
      `Unknown primary entity "${options.primaryEntity}" — ingest its schema first (see ingestion/ingest.ts).`,
    );
  }

  const scopedSchemas = relatedEntitySchemas(primarySchema, options.entitySchemas);
  const retrieved = await retrieveConstraints(options.request, options.embeddingProvider, options.constraintStore, {
    topK: options.topK ?? 15,
  });
  const retrievedRules = retrieved.map((r) => r.rule);

  const result = await generateWithSelfCorrection<EntityTreePayload>({
    maxRetries: options.maxRetries,
    produce: async (ctx) => {
      const prompt = buildGenerationPrompt({
        request: options.request,
        primaryEntity: options.primaryEntity,
        entitySchemas: scopedSchemas,
        retrievedConstraints: retrievedRules,
        isolationKey: options.isolationKey,
        priorAttempt:
          ctx.priorPayload !== undefined && ctx.priorValidation
            ? { payload: ctx.priorPayload, validation: ctx.priorValidation }
            : undefined,
      });
      const raw = await options.llmProvider.complete(prompt);
      return extractJson(raw) as EntityTreePayload;
    },
    validate: (payload) => validatePayload(payload, scopedSchemas, options.validation),
  });

  return {
    generated_data: result.payload,
    validation_status: result.validation.valid,
    isolation_key: options.isolationKey,
    attempts: result.attempts,
    issues: result.validation.issues,
  };
}

/**
 * Narrows the full ingested schema set to what a single generation call
 * actually needs: `primary`'s full FK ancestor chain (forward — an account
 * needs its owning user to exist), plus entities that directly reference
 * `primary` (reverse, one hop only — an account's PIX attempts) so "3 failed
 * PIX attempts" is generatable without also pulling in *that* entity's own
 * unrelated children. Bounded on purpose — a dense schema graph walked
 * transitively in both directions would drag the whole system into every
 * prompt.
 */
function relatedEntitySchemas(primary: EntitySchema, all: EntitySchema[]): EntitySchema[] {
  const byName = new Map(all.map((s) => [s.name, s]));
  const included = new Map<string, EntitySchema>([[primary.name, primary]]);

  const frontier: EntitySchema[] = [primary];
  while (frontier.length > 0) {
    const current = frontier.pop() as EntitySchema;
    for (const fk of current.foreignKeys) {
      const target = byName.get(fk.referencesEntity);
      if (target && !included.has(target.name)) {
        included.set(target.name, target);
        frontier.push(target);
      }
    }
  }

  for (const schema of all) {
    if (!included.has(schema.name) && schema.foreignKeys.some((fk) => fk.referencesEntity === primary.name)) {
      included.set(schema.name, schema);
    }
  }

  return [...included.values()];
}
