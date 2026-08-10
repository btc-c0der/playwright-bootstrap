import type { ValidationResult } from "./types.js";

export interface SelfCorrectContext<T> {
  /** 1 on the first attempt, incrementing on each retry. */
  attempt: number;
  priorPayload?: T;
  priorValidation?: ValidationResult;
}

export interface SelfCorrectOptions<T> {
  /** Requirement 3: "max 3 retries" — 3 additional attempts after the first, 4 total at most. */
  maxRetries?: number;
  produce: (context: SelfCorrectContext<T>) => Promise<T>;
  validate: (payload: T) => Promise<ValidationResult> | ValidationResult;
}

export interface SelfCorrectResult<T> {
  payload: T;
  validation: ValidationResult;
  /** Total attempts actually made (1 if the first attempt already validated). */
  attempts: number;
}

const DEFAULT_MAX_RETRIES = 3;

/**
 * The generic "Self-Correction Loop" requirement 3 asks for, independent of
 * what's being produced or how it's validated — `generate.ts` is the only
 * caller today (an LLM completion + `validatePayload`), but the loop itself
 * doesn't know that, so it's straightforward to unit-test without a fake LLM.
 * On failure the validation's error trace is hard-appended to the *next*
 * `produce()` call via `priorPayload`/`priorValidation` — the caller decides
 * how to turn that into a better prompt (see `generation/prompt-builder.ts`).
 * Exhausting all retries still returns the last attempt rather than throwing —
 * `validation.valid === false` is the signal a caller (or `seeding/`) uses to
 * refuse to inject it, not an exception during generation itself.
 */
export async function generateWithSelfCorrection<T>(
  options: SelfCorrectOptions<T>,
): Promise<SelfCorrectResult<T>> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  let attempt = 1;
  let payload = await options.produce({ attempt });
  let validation = await options.validate(payload);

  while (!validation.valid && attempt <= maxRetries) {
    attempt++;
    payload = await options.produce({ attempt, priorPayload: payload, priorValidation: validation });
    validation = await options.validate(payload);
  }

  return { payload, validation, attempts: attempt };
}
