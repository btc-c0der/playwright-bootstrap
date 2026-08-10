import type { GenerationResult, SeededRecord, SeedTeardownFailure } from "@qaf/synth-data";
import type { EngineContext } from "./types.js";

export interface GenerateDataRequest {
  /** The tester's (or orchestrator's) natural-language request. */
  request: string;
  /** Which ingested entity this request is primarily about. */
  primaryEntity: string;
  /** Drives per-worker isolation-key derivation — see `@qaf/synth-data`'s `createIsolationContext`. */
  workerId: string;
  runId?: string;
  maxRetries?: number;
}

/**
 * Engine 4 — Synthetic Data Generation Engine: LLM + constraint-solver-backed
 * generation (`@qaf/synth-data`'s Constraint Rules Registry) with dynamic
 * per-worker data isolation, plus seed/teardown against a live staging target.
 */
export interface SyntheticDataEngine {
  generate(request: GenerateDataRequest, context: EngineContext): Promise<GenerationResult>;
  /** Throws if no `SeedTarget` is configured — a generation-only engine has nothing to seed into. */
  seed(result: GenerationResult, context: EngineContext): Promise<SeededRecord[]>;
  /** No-ops (returns `[]`) if no `SeedTarget` is configured — nothing was seeded, so there's nothing to tear down. */
  teardown(isolationKey: string, context: EngineContext): Promise<SeedTeardownFailure[]>;
}
