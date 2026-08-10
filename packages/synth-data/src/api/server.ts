import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import type { EmbeddingProvider } from "@qaf/rag-core";
import type { EntitySchema } from "../ingestion/types.js";
import type { ConstraintVectorStore } from "../registry/types.js";
import { generateSyntheticPayload } from "../generation/generate.js";
import type { LLMProvider } from "../generation/llm-provider.js";
import { createIsolationContext } from "../isolation/isolation-key.js";
import type { SeedTarget } from "../seeding/seed-target.js";
import type { ErrorResponseBody, GenerateRequestBody, GenerateResponseBody, TeardownResponseBody } from "./types.js";

export interface SynthDataServerOptions {
  entitySchemas: EntitySchema[];
  llmProvider: LLMProvider;
  embeddingProvider: EmbeddingProvider;
  constraintStore: ConstraintVectorStore;
  /** Optional — omit to run generation-only (no `POST /teardown/:isolationKey`, no live DB writes). */
  seedTarget?: SeedTarget;
}

/**
 * The "Expose a generation interface (REST API...)" half of requirement 2 —
 * plain `node:http`, no web framework dependency, matching this monorepo's
 * "dependency-free default, opt-in for anything heavier" convention (see
 * `@qaf/rag-core`'s `LocalJsonlVectorStore`). A Python (or any other language)
 * test suite talks to this exactly like any other REST API — `requests.post`
 * against `/generate` — no client library required; `client.ts` is a thin
 * convenience wrapper for TypeScript callers, not a protocol requirement.
 */
export function createSynthDataServer(options: SynthDataServerOptions): Server {
  return createServer((req, res) => {
    handleRequest(req, res, options).catch((error) => {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) } satisfies ErrorResponseBody);
    });
  });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, options: SynthDataServerOptions): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  if (req.method === "POST" && url.pathname === "/generate") {
    await handleGenerate(req, res, options);
    return;
  }

  const teardownMatch = /^\/teardown\/([^/]+)$/.exec(url.pathname);
  if (req.method === "POST" && teardownMatch?.[1]) {
    await handleTeardown(decodeURIComponent(teardownMatch[1]), res, options);
    return;
  }

  sendJson(res, 404, { error: `No route for ${req.method} ${url.pathname}` } satisfies ErrorResponseBody);
}

async function handleGenerate(req: IncomingMessage, res: ServerResponse, options: SynthDataServerOptions): Promise<void> {
  const body = (await readJsonBody(req)) as Partial<GenerateRequestBody>;
  if (!body.request || !body.primaryEntity || !body.workerId) {
    sendJson(res, 400, { error: '"request", "primaryEntity", and "workerId" are required.' } satisfies ErrorResponseBody);
    return;
  }

  const isolation = createIsolationContext({ workerId: body.workerId, runId: body.runId });
  const result = await generateSyntheticPayload({
    request: body.request,
    primaryEntity: body.primaryEntity,
    entitySchemas: options.entitySchemas,
    llmProvider: options.llmProvider,
    embeddingProvider: options.embeddingProvider,
    constraintStore: options.constraintStore,
    isolationKey: isolation.isolationKey,
    maxRetries: body.maxRetries,
    topK: body.topK,
  });

  sendJson(res, 200, result satisfies GenerateResponseBody);
}

async function handleTeardown(isolationKey: string, res: ServerResponse, options: SynthDataServerOptions): Promise<void> {
  if (!options.seedTarget) {
    sendJson(res, 501, { error: "No SeedTarget configured for this server — nothing to tear down." } satisfies ErrorResponseBody);
    return;
  }
  const failures = await options.seedTarget.teardown(isolationKey);
  sendJson(res, 200, {
    isolation_key: isolationKey,
    torn_down: failures.length === 0,
    failures: failures.map((f) => ({ type: f.type, id: f.id, error: f.error })),
  } satisfies TeardownResponseBody);
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (raw.trim().length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error(`Invalid JSON request body: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}
