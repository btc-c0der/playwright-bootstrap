export type {
  FieldType,
  FieldFormat,
  FieldConstraint,
  ForeignKeyRef,
  SchemaSourceKind,
  EntitySchema,
} from "./ingestion/types.js";
export { emptyEntitySchema } from "./ingestion/types.js";
export { parsePostgresDdl } from "./ingestion/postgres-ddl.js";
export { parseMongoJsonSchema, parseMongoCollections } from "./ingestion/mongo-schema.js";
export type { MongoCollectionValidator, MongoSchemaIngestInput } from "./ingestion/mongo-schema.js";
export { parseOpenApiSchemas } from "./ingestion/openapi.js";
export type { OpenApiSchemaDocument, OpenApiSchemaIngestInput } from "./ingestion/openapi.js";
export { parseJsonSchema } from "./ingestion/json-schema.js";
export type { JsonSchemaLike, ParseJsonSchemaOptions } from "./ingestion/json-schema.js";
export { mergeEntitySchemas, dedupeForeignKeys } from "./ingestion/merge.js";
export { ingestAll } from "./ingestion/ingest.js";
export type { IngestSources, IngestSummary, JsonSchemaIngestInput } from "./ingestion/ingest.js";

export type {
  ConstraintKind,
  ConstraintRule,
  ConstraintVectorRecord,
  ScoredConstraintRecord,
  ConstraintQueryOptions,
  ConstraintVectorStore,
} from "./registry/types.js";
export { LocalConstraintStore } from "./registry/local-constraint-store.js";
export {
  deriveConstraintRules,
  buildConstraintRegistry,
  retrieveConstraints,
  reconstructEntitySchemas,
} from "./registry/constraint-registry.js";
export type {
  BuildRegistryOptions,
  BuildRegistrySummary,
  RetrieveConstraintsOptions,
} from "./registry/constraint-registry.js";

export { NoopLLMProvider } from "./generation/llm-provider.js";
export type { LLMProvider, LLMCompletionOptions } from "./generation/llm-provider.js";
export { buildGenerationPrompt } from "./generation/prompt-builder.js";
export type { PromptBuilderInput } from "./generation/prompt-builder.js";
export { extractJson } from "./generation/parse-llm-json.js";
export { generateSyntheticPayload } from "./generation/generate.js";
export type { GenerateOptions, GenerationResult } from "./generation/generate.js";

export type { ValidationIssueCode, ValidationIssue, ValidationResult } from "./validation/types.js";
export { combineValidationResults } from "./validation/types.js";
export { validateFields } from "./validation/json-schema-validator.js";
export {
  isValidCpf,
  isValidCnpj,
  formatCpf,
  formatCnpj,
  generateValidCpf,
  generateValidCnpj,
  onlyDigits,
} from "./validation/brazilian-documents.js";
export { isRfc3339Timestamp, isUuid, isEmail } from "./validation/format-validators.js";
export {
  entityRecords,
  validateForeignKeys,
} from "./validation/referential-integrity.js";
export type {
  EntityTreePayload,
  ResolveExternalForeignKey,
  ValidateForeignKeysOptions,
} from "./validation/referential-integrity.js";
export { validatePayload } from "./validation/validate.js";
export type { ValidatePayloadOptions } from "./validation/validate.js";
export { generateWithSelfCorrection } from "./validation/self-correct.js";
export type { SelfCorrectContext, SelfCorrectOptions, SelfCorrectResult } from "./validation/self-correct.js";

export { createIsolationContext, scopeUniqueValue } from "./isolation/isolation-key.js";
export type { IsolationScope, IsolationContext } from "./isolation/isolation-key.js";
export { assertSyntheticSource, assertNoDeniedValues, ProductionDataGuardError } from "./isolation/pii-guard.js";
export type { IngestionSourceOrigin, IngestionSourceLabel, PiiGuardOptions } from "./isolation/pii-guard.js";

export { IsolationTeardownStack } from "./seeding/teardown.js";
export type { TrackedSeedResource, SeedTeardownFailure } from "./seeding/teardown.js";
export { createSeedTarget, topoSortEntities } from "./seeding/seed-target.js";
export type { SeedTarget, SeededRecord, EntityWriter } from "./seeding/seed-target.js";
export { createPostgresSeedTarget, buildSqlInsertScript } from "./seeding/postgres-seed-target.js";
export type { PostgresExecutor } from "./seeding/postgres-seed-target.js";
export { createMongoSeedTarget } from "./seeding/mongo-seed-target.js";
export type { MongoExecutor } from "./seeding/mongo-seed-target.js";

export { createSynthDataServer } from "./api/server.js";
export type { SynthDataServerOptions } from "./api/server.js";
export type {
  GenerateRequestBody,
  GenerateResponseBody,
  TeardownResponseBody,
  ErrorResponseBody,
} from "./api/types.js";
