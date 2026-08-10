export type ValidationIssueCode =
  | "required"
  | "type"
  | "enum"
  | "pattern"
  | "min-length"
  | "max-length"
  | "minimum"
  | "maximum"
  | "format"
  | "foreign-key"
  | "unresolvable-foreign-key";

export interface ValidationIssue {
  /** Dotted field name the issue is about — absent for entity-level issues. */
  field?: string;
  code: ValidationIssueCode;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export function combineValidationResults(results: ValidationResult[]): ValidationResult {
  const issues = results.flatMap((r) => r.issues);
  return { valid: issues.length === 0, issues };
}
