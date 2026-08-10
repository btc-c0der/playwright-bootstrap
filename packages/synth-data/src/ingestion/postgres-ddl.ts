import type { EntitySchema, FieldConstraint, FieldType } from "./types.js";
import { emptyEntitySchema } from "./types.js";
import { dedupeForeignKeys } from "./merge.js";

/**
 * Lightweight PostgreSQL DDL reader — not a SQL grammar. Handles the subset that
 * carries constraint information (`CREATE TYPE ... AS ENUM`, `CREATE TABLE` column
 * and table-level constraints) using paren-depth-aware splitting rather than a full
 * parser dependency, matching this monorepo's "shape reader, not a database driver"
 * posture (see `@qaf/graph-rag`'s `ingestion/openapi.ts`). Anything it doesn't
 * recognize (views, functions, triggers, partial/expression indexes) is ignored
 * rather than throwing — a schema dump has plenty of statements that carry no
 * constraint information for synthetic generation.
 */
export function parsePostgresDdl(sql: string): EntitySchema[] {
  const cleaned = stripComments(sql);
  const enums = collectEnumTypes(cleaned);
  const tables = collectTableBlocks(cleaned);
  return tables.map((table) => parseTable(table, enums));
}

function stripComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join("\n");
}

const ENUM_TYPE_RE = /CREATE\s+TYPE\s+"?(\w+)"?\s+AS\s+ENUM\s*\(([^)]*)\)/gi;

function collectEnumTypes(sql: string): Map<string, string[]> {
  const enums = new Map<string, string[]>();
  for (const match of sql.matchAll(ENUM_TYPE_RE)) {
    const name = match[1];
    const body = match[2];
    if (!name || body === undefined) continue;
    enums.set(name.toLowerCase(), splitTopLevel(body, ",").map(unquote));
  }
  return enums;
}

interface TableBlock {
  name: string;
  body: string;
}

/** Finds every `CREATE TABLE <name> (...)` statement, matching parens by depth so nested types (`NUMERIC(12,2)`, `CHECK (...)`) don't truncate the body early. */
function collectTableBlocks(sql: string): TableBlock[] {
  const blocks: TableBlock[] = [];
  const headerRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?\s*\(/gi;
  for (const match of sql.matchAll(headerRe)) {
    const name = match[1];
    if (!name) continue;
    const openParenIndex = match.index + match[0].length - 1;
    const body = extractBalanced(sql, openParenIndex);
    if (body !== undefined) blocks.push({ name, body });
  }
  return blocks;
}

/** Given the index of an opening `(`, returns the text strictly between it and its matching `)`. */
function extractBalanced(text: string, openParenIndex: number): string | undefined {
  let depth = 0;
  for (let i = openParenIndex; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) return text.slice(openParenIndex + 1, i);
    }
  }
  return undefined;
}

/** Splits on a top-level separator only — ignores separators nested inside `(...)`. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(") depth++;
    else if (char === ")") depth--;
    if (char === separator && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim().length > 0) parts.push(current);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

function unquote(value: string): string {
  const trimmed = value.trim();
  return trimmed.replace(/^'(.*)'$/, "$1");
}

/**
 * `CHECK (...)` bodies routinely nest a further `(...)` (`col ~ 'regex'` is safe,
 * but `col IN (...)` or a length check on a computed expression isn't) — a naive
 * `/CHECK\s*\(([^)]*)\)/` stops at the *first* `)`, silently truncating those.
 * Locates the keyword, then reuses the same balanced-paren extraction as table
 * blocks so a `CHECK (region IN ('SC', 'SP'))` yields its whole expression.
 */
function extractCheckExpr(text: string): string | undefined {
  const keywordMatch = /CHECK\s*\(/i.exec(text);
  if (!keywordMatch) return undefined;
  const openParenIndex = keywordMatch.index + keywordMatch[0].length - 1;
  return extractBalanced(text, openParenIndex);
}

const TABLE_CONSTRAINT_KEYWORDS = /^(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|CONSTRAINT)\b/i;

function parseTable(table: TableBlock, enums: Map<string, string[]>): EntitySchema {
  const schema = emptyEntitySchema(table.name, "postgres-ddl");
  const lines = splitTopLevel(table.body, ",");
  const fieldsByName = new Map<string, FieldConstraint>();

  for (const line of lines) {
    if (TABLE_CONSTRAINT_KEYWORDS.test(line)) {
      applyTableConstraint(line, schema, fieldsByName);
    } else {
      const parsed = parseColumn(line, enums);
      if (parsed) {
        fieldsByName.set(parsed.field.name, parsed.field);
        schema.fields.push(parsed.field);
        if (parsed.foreignKey) schema.foreignKeys.push(parsed.foreignKey);
      }
    }
  }
  // A column can declare its own FK inline (`user_id UUID REFERENCES users(id)`)
  // in addition to — or instead of — a table-level `FOREIGN KEY (...)`
  // constraint; both are recognized above, so dedupe here handles either style
  // (or, redundantly, both) yielding the same result.
  schema.foreignKeys = dedupeForeignKeys(schema.foreignKeys);
  return schema;
}

const COLUMN_RE = /^"?(\w+)"?\s+([\w]+(?:\s*\([^)]*\))?)\s*(.*)$/s;

interface ParsedColumn {
  field: FieldConstraint;
  foreignKey?: EntitySchema["foreignKeys"][number];
}

function parseColumn(line: string, enums: Map<string, string[]>): ParsedColumn | undefined {
  const match = COLUMN_RE.exec(line.trim());
  if (!match) return undefined;
  const [, rawName, rawType, rest] = match;
  if (!rawName || !rawType) return undefined;
  // The `(.*)$` group always matches (even as an empty string) given the `s` flag, but
  // TS types every capture group as possibly-`undefined` regardless — normalize once.
  const restText = rest ?? "";

  const enumValues = enums.get(rawType.toLowerCase());
  const field: FieldConstraint = {
    name: rawName,
    type: enumValues ? "enum" : mapSqlType(rawType),
    required: /NOT\s+NULL/i.test(restText) || /PRIMARY\s+KEY/i.test(restText),
    ...(enumValues ? { enum: enumValues } : {}),
  };

  const varcharLength = /^(?:VARCHAR|CHAR)\s*\(\s*(\d+)\s*\)/i.exec(rawType.trim());
  if (varcharLength?.[1]) field.maxLength = Number(varcharLength[1]);

  if (/PRIMARY\s+KEY/i.test(restText)) field.nullable = false;
  if (/UNIQUE/i.test(restText)) field.description = appendDescription(field.description, "must be unique");

  const checkExpr = extractCheckExpr(restText);
  if (checkExpr !== undefined) applyCheckExpression(checkExpr, field);

  const referencesMatch = /REFERENCES\s+"?(\w+)"?\s*\(\s*"?(\w+)"?\s*\)/i.exec(restText);
  let foreignKey: EntitySchema["foreignKeys"][number] | undefined;
  if (referencesMatch?.[1] && referencesMatch[2]) {
    field.description = appendDescription(
      field.description,
      `references ${referencesMatch[1]}.${referencesMatch[2]}`,
    );
    foreignKey = {
      field: rawName,
      referencesEntity: referencesMatch[1],
      referencesField: referencesMatch[2],
    };
  }

  return { field, foreignKey };
}

/** Recognizes the two CHECK shapes that carry machine-usable constraint info: a regex test (`col ~ 'pattern'`) and an inline enumeration (`col IN ('a','b')`). Anything else is preserved only as free text via `description`. */
function applyCheckExpression(expr: string, field: FieldConstraint): void {
  const regexMatch = /~\s*'([^']*)'/.exec(expr);
  if (regexMatch?.[1]) {
    field.pattern = regexMatch[1];
    return;
  }
  const inMatch = /IN\s*\(([^)]*)\)/i.exec(expr);
  if (inMatch?.[1]) {
    field.enum = splitTopLevel(inMatch[1], ",").map(unquote);
    return;
  }
  field.description = appendDescription(field.description, `CHECK (${expr.trim()})`);
}

function applyTableConstraint(
  line: string,
  schema: EntitySchema,
  fieldsByName: Map<string, FieldConstraint>,
): void {
  const pk = /PRIMARY\s+KEY\s*\(\s*"?(\w+)"?\s*\)/i.exec(line);
  if (pk?.[1]) {
    schema.primaryKey = pk[1];
    const field = fieldsByName.get(pk[1]);
    if (field) field.required = true;
    return;
  }

  const fk = /FOREIGN\s+KEY\s*\(\s*"?(\w+)"?\s*\)\s*REFERENCES\s+"?(\w+)"?\s*\(\s*"?(\w+)"?\s*\)/i.exec(
    line,
  );
  if (fk?.[1] && fk[2] && fk[3]) {
    schema.foreignKeys.push({ field: fk[1], referencesEntity: fk[2], referencesField: fk[3] });
    return;
  }

  const checkExpr = extractCheckExpr(line);
  if (checkExpr !== undefined) schema.businessRules.push(`CHECK (${checkExpr.trim()})`);
}

const SQL_TYPE_MAP: Record<string, FieldType> = {
  uuid: "uuid",
  boolean: "boolean",
  bool: "boolean",
  date: "date",
  timestamp: "timestamp",
  timestamptz: "timestamp",
  "timestamp with time zone": "timestamp",
  "timestamp without time zone": "timestamp",
  int: "integer",
  int2: "integer",
  int4: "integer",
  int8: "integer",
  integer: "integer",
  smallint: "integer",
  bigint: "integer",
  serial: "integer",
  bigserial: "integer",
  numeric: "number",
  decimal: "number",
  real: "number",
  float: "number",
  "double precision": "number",
  money: "number",
  text: "string",
  varchar: "string",
  char: "string",
  json: "object",
  jsonb: "object",
};

function mapSqlType(rawType: string): FieldType {
  const base = rawType.replace(/\(.*\)/, "").trim().toLowerCase();
  return SQL_TYPE_MAP[base] ?? "string";
}

function appendDescription(existing: string | undefined, addition: string): string {
  return existing ? `${existing}; ${addition}` : addition;
}
