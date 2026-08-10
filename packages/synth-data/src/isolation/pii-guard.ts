/**
 * Requirement 4: "zero real Production PII data shall be read or transmitted."
 * This pipeline is synthetic-only *by construction* — ingestion (see
 * `ingestion/`) only ever reads schema/DDL/OpenAPI/JSON-Schema *definitions*,
 * never a row of real data, and generation (`generation/generate.ts`) only
 * ever sends the LLM a natural-language request plus retrieved constraint
 * *descriptions* (field names, types, regexes, enum values) — never a
 * production record. Nothing here re-derives structure by sampling live rows.
 *
 * The two guards below are defense-in-depth on top of that architectural
 * guarantee, not a substitute for it: `assertSyntheticSource` rejects an
 * ingestion input a caller mislabeled as coming from a production dump, and
 * `assertNoDeniedValues` catches the one way a real value could still leak in
 * despite all that — a business rule's free text (`EntitySchema.businessRules`,
 * hand-authored by whoever wrote the DDL/spec) quoting a real example.
 */
export class ProductionDataGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionDataGuardError";
  }
}

export type IngestionSourceOrigin = "schema-definition" | "production-sample" | "unknown";

export interface IngestionSourceLabel {
  origin: IngestionSourceOrigin;
  description?: string;
}

/** Called at the ingestion boundary (`bin/qaf-synth-ingest.ts`) — a source explicitly labeled as a production sample is refused outright, regardless of format. */
export function assertSyntheticSource(label: IngestionSourceLabel): void {
  if (label.origin === "production-sample") {
    throw new ProductionDataGuardError(
      `Refusing to ingest source${label.description ? ` "${label.description}"` : ""}: labeled as a production data sample. ` +
        "This pipeline ingests schema/constraint definitions only (DDL, OpenAPI, JSON Schema) — never real rows. " +
        "See docs/synthetic-data-engine.md's LGPD/GDPR section.",
    );
  }
}

export interface PiiGuardOptions {
  /** Real-world values (CPFs/CNPJs/emails/whatever a team considers sensitive) that must never appear in generated output — digits-only and case-insensitive matching, so a formatted "111.444.777-35" still matches a denylisted "11144477735". */
  denylist: Iterable<string>;
}

/**
 * Recursively scans every string leaf of a generated payload tree against a
 * caller-supplied denylist. Throws (rather than returning issues, like
 * `validation/`) because this isn't a correctness defect a retry can fix by
 * trying again with the same denylist context — it's a hard stop.
 */
export function assertNoDeniedValues(payload: unknown, options: PiiGuardOptions): void {
  const denied = new Set([...options.denylist].map(normalize).filter((v) => v.length > 0));
  if (denied.size === 0) return;

  const matches = new Set<string>();
  collectMatches(payload, denied, matches);
  if (matches.size > 0) {
    throw new ProductionDataGuardError(
      `Generated payload contains ${matches.size} value(s) present in the real-data denylist — refusing to serve. ` +
        "This is a defense-in-depth check on top of never reading real rows in the first place; see docs/synthetic-data-engine.md.",
    );
  }
}

function collectMatches(node: unknown, denied: Set<string>, found: Set<string>): void {
  if (typeof node === "string") {
    const normalized = normalize(node);
    if (denied.has(normalized)) found.add(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectMatches(item, denied, found);
    return;
  }
  if (node && typeof node === "object") {
    for (const value of Object.values(node as Record<string, unknown>)) collectMatches(value, denied, found);
  }
}

function normalize(value: string): string {
  const digitsOnly = value.replace(/\D/g, "");
  return digitsOnly.length >= 5 ? digitsOnly : value.trim().toLowerCase();
}
