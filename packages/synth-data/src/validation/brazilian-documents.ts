/**
 * CPF/CNPJ mod-11 checksum — the concrete "valid CPF/CNPJ checksums" guardrail
 * requirement 3 asks for. An LLM asked for "a CNPJ" reliably produces something
 * *shaped* like one (14 digits) but not something that actually passes this
 * checksum, since it's a deterministic arithmetic property, not a pattern a
 * language model has memorized instances of — this is exactly the class of
 * defect `validation/validate.ts` exists to catch before a payload reaches a
 * seed target, and the reason `generateValidCpf`/`generateValidCnpj` below
 * exist: a self-correction retry can ask the LLM to keep everything else and
 * substitute a document number this module *generates* rather than iterate
 * blindly.
 */

const REPEATED_DIGITS_11 = /^(\d)\1{10}$/;
const REPEATED_DIGITS_14 = /^(\d)\1{13}$/;

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidCpf(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || REPEATED_DIGITS_11.test(digits)) return false;
  const nums = digits.split("").map(Number);
  const dv1 = cpfCheckDigit(nums.slice(0, 9));
  const dv2 = cpfCheckDigit(nums.slice(0, 9).concat(dv1));
  return nums[9] === dv1 && nums[10] === dv2;
}

export function isValidCnpj(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 14 || REPEATED_DIGITS_14.test(digits)) return false;
  const nums = digits.split("").map(Number);
  const dv1 = cnpjCheckDigit(nums.slice(0, 12));
  const dv2 = cnpjCheckDigit(nums.slice(0, 12).concat(dv1));
  return nums[12] === dv1 && nums[13] === dv2;
}

function cpfCheckDigit(nums: number[]): number {
  let sum = 0;
  let weight = nums.length + 1;
  for (const n of nums) sum += n * weight--;
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

const CNPJ_WEIGHTS_12 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_WEIGHTS_13 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function cnpjCheckDigit(nums: number[]): number {
  const weights = nums.length === 12 ? CNPJ_WEIGHTS_12 : CNPJ_WEIGHTS_13;
  let sum = 0;
  for (let i = 0; i < nums.length; i++) sum += (nums[i] as number) * (weights[i] as number);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function formatCpf(digits: string): string {
  const d = onlyDigits(digits);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

export function formatCnpj(digits: string): string {
  const d = onlyDigits(digits);
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

/**
 * Deterministically completes a checksum-valid CPF from an 9-digit (or
 * shorter, zero-padded) base — not random, so a self-correction retry that
 * feeds the same base back gets the same document every time. `seed` lets a
 * caller vary the base per generated entity without a random source (see
 * `isolation/isolation-key.ts` for why this codebase avoids `Math.random`
 * inside anything that has to stay reproducible in a workflow re-run).
 */
export function generateValidCpf(seed = 0): string {
  const base = String(Math.abs(seed) % 1_000_000_000).padStart(9, "0");
  const nums = base.split("").map(Number);
  const dv1 = cpfCheckDigit(nums);
  const dv2 = cpfCheckDigit(nums.concat(dv1));
  return `${base}${dv1}${dv2}`;
}

export function generateValidCnpj(seed = 0): string {
  const base = String(Math.abs(seed) % 100_000_000).padStart(8, "0") + "0001";
  const nums = base.split("").map(Number);
  const dv1 = cnpjCheckDigit(nums);
  const dv2 = cnpjCheckDigit(nums.concat(dv1));
  return `${base}${dv1}${dv2}`;
}
