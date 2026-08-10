import type { ErrorResponseBody, GenerateRequestBody, GenerateResponseBody, TeardownResponseBody } from "./types.js";

export interface SynthDataClient {
  generate(body: GenerateRequestBody): Promise<GenerateResponseBody>;
  teardown(isolationKey: string): Promise<TeardownResponseBody>;
}

/**
 * Thin `fetch` wrapper for TypeScript test suites calling a running
 * `qaf-synth-serve` instance — not a protocol requirement (requirement 2's
 * "REST API / Python Client" alternative just means "plain HTTP/JSON", so a
 * Python suite is exactly as well served by `requests.post(f"{base}/generate",
 * json=...)`, see docs/synthetic-data-engine.md for that example) but
 * convenient enough that most TS suites will want it over raw `fetch` calls.
 */
export function createSynthDataClient(baseUrl: string): SynthDataClient {
  const root = baseUrl.replace(/\/$/, "");

  return {
    async generate(body) {
      return postJson<GenerateResponseBody>(`${root}/generate`, body);
    },
    async teardown(isolationKey) {
      return postJson<TeardownResponseBody>(`${root}/teardown/${encodeURIComponent(isolationKey)}`);
    },
  };
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const parsed = (await res.json()) as T | ErrorResponseBody;
  if (!res.ok) {
    const message = (parsed as ErrorResponseBody).error ?? `Request to ${url} failed with status ${res.status}`;
    throw new Error(message);
  }
  return parsed as T;
}
