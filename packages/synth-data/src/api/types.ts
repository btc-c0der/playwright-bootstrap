import type { ValidationIssue } from "../validation/types.js";
import type { EntityTreePayload } from "../validation/referential-integrity.js";

export interface GenerateRequestBody {
  /** The natural-language data request — see `generation/generate.ts`. */
  request: string;
  primaryEntity: string;
  /** Folded into the returned `isolation_key`'s scope — see `isolation/isolation-key.ts`. Required so two parallel CI workers calling the same server never share one isolation context. */
  workerId: string;
  runId?: string;
  maxRetries?: number;
  topK?: number;
}

/** The exact JSON shape requirement 5 asks for. */
export interface GenerateResponseBody {
  generated_data: EntityTreePayload;
  validation_status: boolean;
  isolation_key: string;
  attempts: number;
  issues: ValidationIssue[];
}

export interface TeardownResponseBody {
  isolation_key: string;
  torn_down: boolean;
  failures: Array<{ type: string; id: string; error: string }>;
}

export interface ErrorResponseBody {
  error: string;
}
