export type { EmbeddingProvider } from "./embedding/types.js";
export { NoopEmbeddingProvider } from "./embedding/noop.js";

export type {
  VectorNamespace,
  VectorRecord,
  ScoredRecord,
  VectorQueryOptions,
  VectorStore,
} from "./vector-store/types.js";
export { cosineSimilarity } from "./vector-store/similarity.js";
export { LocalJsonlVectorStore } from "./vector-store/local-jsonl-store.js";

export type { SourceDocument, DocumentSource } from "./sources/types.js";
export { createInternalSpecsSource } from "./sources/internal-specs.js";
export type { InternalSpecsSourceOptions } from "./sources/internal-specs.js";
export { createTestCatalogSource, buildTestId, extractTags } from "./sources/test-catalog.js";
export type { TestCatalogSourceOptions, DiscoveredTest } from "./sources/test-catalog.js";
export { createJiraSource, normalizeJiraIssues } from "./sources/jira.js";
export type { JiraIssueInput, JiraSourceOptions } from "./sources/jira.js";
export { createConfluenceSource, normalizeConfluencePages } from "./sources/confluence.js";
export type { ConfluencePageInput, ConfluenceSourceOptions } from "./sources/confluence.js";
export {
  createZephyrSourceFromTestCases,
  createZephyrScaleApiSource,
  normalizeZephyrTestCases,
} from "./sources/zephyr.js";
export type { ZephyrTestCaseInput, ZephyrScaleApiSourceOptions } from "./sources/zephyr.js";

export { chunkDocument } from "./indexing/chunk.js";
export type { Chunk, ChunkOptions } from "./indexing/chunk.js";
export { indexDocuments } from "./indexing/index.js";
export type { IndexOptions, IndexSummary } from "./indexing/index.js";

export { computeSpecToTestMapping } from "./mapping/spec-to-test.js";
export type { SpecToTestMappingOptions } from "./mapping/spec-to-test.js";
export type {
  CoverageStatus,
  MatchedTest,
  CoverageMapping,
  OrphanTest,
  CoverageResult,
} from "./mapping/types.js";

export { buildCoverageReportMarkdown } from "./reporters/coverage-report.js";
export type { CoverageReportInputs } from "./reporters/coverage-report.js";

export { symbolizeFailure } from "./failure-clustering/symbolize.js";
export { clusterFailure, summarizeClusters } from "./failure-clustering/cluster.js";
export type { ClusterOptions, ClusterResult } from "./failure-clustering/cluster.js";
export type { FailureRecord, ClusterSummary } from "./failure-clustering/types.js";

export { buildRootCauseReportMarkdown } from "./reporters/root-cause-report.js";
export type { RootCauseReportInputs } from "./reporters/root-cause-report.js";

export { default as FailureReporter } from "./reporters/failure-reporter.js";

export { createVectorHealingProvider } from "./locator-healing/vector-healing-provider.js";
export type { VectorHealingProviderOptions } from "./locator-healing/vector-healing-provider.js";
