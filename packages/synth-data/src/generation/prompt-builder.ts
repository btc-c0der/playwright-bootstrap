import type { EntitySchema } from "../ingestion/types.js";
import type { ConstraintRule } from "../registry/types.js";
import type { ValidationResult } from "../validation/types.js";

export interface PromptBuilderInput {
  /** The tester's natural-language request, verbatim — e.g. "a corporate account user from Santa Catarina with a suspended state registration, negative balance, and 3 failed PIX attempts". */
  request: string;
  primaryEntity: string;
  /** The primary entity's schema plus every entity it's FK-connected to, close enough to build a self-contained relational tree (see `generate.ts`'s `relatedEntitySchemas`). */
  entitySchemas: EntitySchema[];
  /** RAG-retrieved constraint rule descriptions for this request — see `registry/constraint-registry.ts`'s `retrieveConstraints`. */
  retrievedConstraints: ConstraintRule[];
  isolationKey: string;
  /** Set on retry attempts — the self-correction loop's "pass the error trace back to the LLM to patch the payload" (requirement 3). */
  priorAttempt?: { payload: unknown; validation: ValidationResult };
}

/**
 * Pure text-in/text-out — no LLM call here, which is what makes this testable
 * without a fake provider. Deliberately verbose about output format (a single
 * fenced-free JSON object) since `parse-llm-json.ts` still has to cope with a
 * model ignoring that, but every degree of ambiguity removed here is one
 * fewer self-correction retry spent on a formatting mistake instead of an
 * actual constraint violation.
 */
export function buildGenerationPrompt(input: PromptBuilderInput): string {
  const sections = [
    taskSection(input.request, input.primaryEntity),
    schemaSection(input.entitySchemas),
    constraintsSection(input.retrievedConstraints),
    isolationSection(input.isolationKey),
    input.priorAttempt ? correctionSection(input.priorAttempt) : undefined,
    outputFormatSection(),
  ];
  return sections.filter((s): s is string => s !== undefined).join("\n\n");
}

function taskSection(request: string, primaryEntity: string): string {
  return (
    `You are generating synthetic test data for a Software Integration Testing (SIT) suite.\n` +
    `Primary entity to generate: "${primaryEntity}".\n` +
    `Request: ${request}`
  );
}

function schemaSection(entitySchemas: EntitySchema[]): string {
  const lines = entitySchemas.map((schema) => {
    const fields = schema.fields
      .map((f) => {
        const bits = [f.type, f.required ? "required" : "optional"];
        if (f.enum) bits.push(`enum(${f.enum.join("|")})`);
        if (f.pattern) bits.push(`pattern(${f.pattern})`);
        if (f.format) bits.push(`format(${f.format})`);
        return `${f.name}: ${bits.join(", ")}`;
      })
      .join("; ");
    const fks = schema.foreignKeys
      .map((fk) => `${fk.field} -> ${fk.referencesEntity}.${fk.referencesField}`)
      .join("; ");
    const pk = schema.primaryKey ? ` (primary key: ${schema.primaryKey})` : "";
    return (
      `### ${schema.name}${pk}\n` +
      `Fields: ${fields || "(none)"}\n` +
      (fks ? `Foreign keys: ${fks}\n` : "") +
      (schema.businessRules.length ? `Business rules: ${schema.businessRules.join("; ")}\n` : "")
    );
  });
  return `## Entity schemas\n${lines.join("\n")}`;
}

function constraintsSection(rules: ConstraintRule[]): string {
  if (rules.length === 0) return "## Retrieved constraints\n(none retrieved)";
  const bullets = rules.map((r) => `- ${r.description}`).join("\n");
  return `## Retrieved constraints (most relevant to this request)\n${bullets}`;
}

function isolationSection(isolationKey: string): string {
  const suffix = isolationKey.slice(0, 8);
  return (
    `## Isolation\n` +
    `This bundle's isolation key is ${isolationKey}. Fold "${suffix}" into any field that must be ` +
    `unique per test run (emails, usernames, external reference codes) — e.g. "user.${suffix}@example.test" — ` +
    `so this data never collides with another parallel test worker's data.`
  );
}

function correctionSection(priorAttempt: { payload: unknown; validation: ValidationResult }): string {
  const issues = priorAttempt.validation.issues
    .map((i) => `- ${i.field ? `${i.field}: ` : ""}${i.message}`)
    .join("\n");
  return (
    `## Your previous attempt failed validation\n` +
    `Previous JSON:\n${JSON.stringify(priorAttempt.payload)}\n\n` +
    `Validation errors:\n${issues}\n\n` +
    `Fix ONLY what is necessary to resolve every error above. Keep every other field's value ` +
    `exactly as it was unless an error requires changing it. Respond with the full corrected JSON object.`
  );
}

function outputFormatSection(): string {
  return (
    `## Output format\n` +
    `Respond with a single JSON object and nothing else — no markdown code fences, no commentary, ` +
    `no explanation before or after it. Top-level keys are entity names; each value is either one ` +
    `record object or an array of record objects for that entity. Every foreign key value must match ` +
    `the primary key of a record you also include for the referenced entity, unless the request clearly ` +
    `refers to a pre-existing record outside this bundle.`
  );
}
