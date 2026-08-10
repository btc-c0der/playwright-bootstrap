/**
 * LLMs reliably wrap JSON in a markdown code fence and/or a sentence of
 * preamble even when explicitly told "respond with JSON only" — this strips
 * both rather than trusting the instruction, since a self-correction retry
 * that fails on a parse error (not a validation error) wastes an attempt on
 * something formatting alone should never cause.
 */
export function extractJson(text: string): unknown {
  const candidate = stripCodeFence(text.trim());
  const jsonSlice = sliceOutermostJson(candidate);
  try {
    return JSON.parse(jsonSlice);
  } catch (error) {
    throw new Error(
      `Could not parse JSON from LLM output: ${error instanceof Error ? error.message : String(error)}\n---\n${text}`,
    );
  }
}

const CODE_FENCE_RE = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i;

function stripCodeFence(text: string): string {
  const match = CODE_FENCE_RE.exec(text);
  return match?.[1] !== undefined ? match[1].trim() : text;
}

/**
 * Finds the first `{`/`[` and its matching close, discarding any leading/
 * trailing prose the model added despite instructions not to. Tracks whether
 * the scan is inside a JSON string literal (respecting `\"` escapes) so a
 * brace/bracket that's just part of a string value's *text* — `{"note": "a
 * {tricky} string"}` — doesn't throw off the depth count.
 */
function sliceOutermostJson(text: string): string {
  const start = text.search(/[[{]/);
  if (start === -1) return text;
  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === opener) {
      depth++;
    } else if (char === closer) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}
