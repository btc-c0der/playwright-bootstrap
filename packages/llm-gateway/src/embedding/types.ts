export interface EmbeddingRequest {
  /** `"<prefix>:<model-name>"`, same shape as `CompletionRequest.model`. */
  model: string;
  texts: string[];
  requestedBy?: string;
  runId?: string;
}

export interface EmbeddingUsage {
  promptTokens: number;
  totalTokens: number;
}

export interface EmbeddingResponse {
  model: string;
  vectors: number[][];
  usage: EmbeddingUsage;
}

/**
 * One concrete embedding backend's shape — mirrors `LLMGatewayProvider` but
 * for `/embeddings`-style endpoints, which are a genuinely different API
 * from chat completions (even within the same provider: OpenAI's
 * `/embeddings` isn't `/chat/completions`) and so get their own router
 * rather than being folded into `LLMGatewayProvider`.
 */
export interface EmbeddingGatewayProvider {
  readonly prefix: string;
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}

/** The seam every engine/orchestrator node calls through for embeddings — Layer 5's Foundation & Security Gateway's embedding half. */
export interface EmbeddingGateway {
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}
