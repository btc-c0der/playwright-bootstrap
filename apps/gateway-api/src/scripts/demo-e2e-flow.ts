/**
 * End-to-end demonstration: one CI/CD test-failure payload traveling
 * Layer 1 (a webhook payload, normalized) -> Layer 2
 * (`QAAgentOrchestrator`'s StateGraph) -> Layer 3 (the four pillars) ->
 * Layer 4 (`LocalJsonlExecutionStore` recording every stage) -> Layer 5
 * (`@qaf/llm-gateway`'s PII redaction + token audit).
 *
 * Unlike an earlier version of this script, every pillar's LLM/embedding
 * calls below go through *one* `GatewayClient` (`buildEnginesWithGateway`,
 * not `buildDefaultEngines`) — the data-generation stage's completion, the
 * healing stage's vision-capable repair-suggestion completion, and every
 * embedding call all land in the *same* `TokenUsageStore`, which is the
 * "one consistent audit trail across every pillar" this demo exists to
 * prove. `FakeGatewayLlmProvider`/`FakeGatewayEmbeddingProvider` below are
 * deterministic stand-ins for a real OpenAI/Anthropic/Ollama backend — swap
 * them for `@qaf/llm-gateway`'s `OpenAiCompatibleProvider`/
 * `AnthropicProvider`/`OpenAiCompatibleEmbeddingProvider` to run this for
 * real.
 *
 * Run with `pnpm --filter @qaf/gateway-api demo` — no API keys, no Docker,
 * no network calls.
 */
import { createGatewayClient } from "@qaf/llm-gateway";
import type {
  ChatMessage,
  CompletionRequest,
  CompletionResponse,
  EmbeddingGatewayProvider,
  EmbeddingRequest,
  EmbeddingResponse,
  LLMGatewayProvider,
} from "@qaf/llm-gateway";
import { QAAgentOrchestrator } from "@qaf/orchestrator";
import { LocalJsonlTokenUsageStore } from "@qaf/storage-core";
import { emptyEntitySchema } from "@qaf/synth-data";
import { buildEnginesWithGateway } from "../config.js";
import { normalizeGithubActionsPayload } from "../rest/webhooks/github-actions.js";
import type { GithubActionsFailureBody } from "../rest/webhooks/github-actions.js";

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

/** A deterministic embedding, not a real one — same idea as `hashToVector` in the pre-gateway version of this demo, just implemented at the `EmbeddingGatewayProvider` level now. */
function hashToVector(text: string, dimensions: number): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  for (let i = 0; i < text.length; i++) {
    const slot = i % dimensions;
    vector[slot] = (vector[slot] ?? 0) + text.charCodeAt(i);
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

function flattenText(message: ChatMessage): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

/**
 * One fake `LLMGatewayProvider` standing in for every pillar's completion
 * call — it branches on the prompt's content because three different
 * callers (`@qaf/engine-contracts`'s `GatewayLLMProvider` for synthetic-data
 * generation, `GatewayAiRepairProvider` for locator repair, and this
 * script's own standalone call) all share the one "demo" model registered
 * below, which is exactly the point: one provider, one audit trail,
 * regardless of which pillar is calling.
 */
class FakeGatewayLlmProvider implements LLMGatewayProvider {
  readonly prefix = "demo";

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const text = request.messages.map(flattenText).join("\n");
    let content: string;
    if (text.includes("repair broken Playwright locators")) {
      content = JSON.stringify({
        suggestedSelector: 'button[data-testid="submit-button-v2"]',
        confidence: 0.91,
        rationale: "The submit button's data-testid gained a -v2 suffix after the last deploy.",
      });
    } else if (text.includes("Software Integration Testing")) {
      content = JSON.stringify({ web: { id: "demo-1234" } });
    } else {
      content = `Summary for a human: ${request.messages.at(-1) ? flattenText(request.messages.at(-1)!) : ""}`;
    }
    return { model: request.model, content, usage: { promptTokens: 42, completionTokens: 18, totalTokens: 60 } };
  }
}

class FakeGatewayEmbeddingProvider implements EmbeddingGatewayProvider {
  readonly prefix = "demo";

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    return {
      model: request.model,
      vectors: request.texts.map((text) => hashToVector(text, 8)),
      usage: {
        promptTokens: request.texts.reduce((sum, t) => sum + t.length, 0),
        totalTokens: request.texts.reduce((sum, t) => sum + t.length, 0),
      },
    };
  }
}

async function main(): Promise<void> {
  // ---- Layer 1: a CI/CD webhook payload arrives -------------------------
  const rawWebhookBody: GithubActionsFailureBody = {
    repository: { full_name: "acme/checkout-web" },
    head_sha: "a1b2c3d",
    changed_files: ["src/services/payment-service.ts"],
    test: {
      id: "checkout.spec.ts:should-complete-purchase",
      file: "e2e/checkout.spec.ts",
      project: "web",
      error_message: 'Timed out waiting for locator(\'[data-testid="submit-button"]\')',
      stack_trace: "TimeoutError: locator.click: Timeout 5000ms exceeded.",
      failing_node_id: "Endpoint:POST:/api/checkout",
    },
  };
  const payload = normalizeGithubActionsPayload(rawWebhookBody);
  print(`[Layer 1 · Entrypoints]      Normalized GitHub Actions webhook -> CiFailurePayload (runId=${payload.runId})`);

  // ---- Layer 5: one gateway, shared by every pillar below ----------------
  const tokenUsageStore = new LocalJsonlTokenUsageStore(".qaf/demo-token-usage.jsonl");
  const gateway = createGatewayClient({
    providers: [new FakeGatewayLlmProvider()],
    embeddingProviders: [new FakeGatewayEmbeddingProvider()],
    audit: {
      sink: tokenUsageStore,
      costTable: {
        "demo:chat": { inputPer1k: 0.001, outputPer1k: 0.002 },
        "demo:embed": { inputPer1k: 0.0001, outputPer1k: 0 },
      },
    },
    redaction: {
      onRedacted: (matches, context) =>
        print(`[Layer 5 · Foundation]       Redacted ${matches.length} PII match(es) before "${context.model}" saw them.`),
    },
  });

  // ---- Layer 2 + Layer 3 + Layer 4: the orchestrator run, every pillar's
  // LLM/embedding calls routed through the one `gateway` above -------------
  const webEntitySchema = emptyEntitySchema("web", "json-schema");
  webEntitySchema.fields.push({ name: "id", type: "string", required: true });

  const engines = buildEnginesWithGateway({
    gateway,
    embeddingModel: "demo:embed",
    embeddingDimensions: 8,
    llmModel: "demo:chat",
    entitySchemas: [webEntitySchema],
    runId: payload.runId,
  });

  const orchestrator = new QAAgentOrchestrator(engines);
  const result = await orchestrator.run(payload);

  print("[Layer 2 · Orchestration]    QAAgentOrchestrator finished:");
  print(`  impact.selectedTests       = ${JSON.stringify(result.impact?.selectedTests)}`);
  print(`  impact.impactRadiusScore   = ${result.impact?.impactRadiusScore}`);
  print(`  generatedData.validated    = ${result.generatedData?.validation_status}`);
  print(`  execution.passed           = ${result.execution?.passed}`);
  print(`  repairProposals            = ${result.repairProposals.length}`);
  print(`  autoPr.opened              = ${result.autoPr?.opened} (${result.autoPr?.reason ?? "n/a"})`);
  print(`  rootCause.root_cause_node  = ${result.rootCause?.root_cause_node}`);
  print(`  rootCause.confidence       = ${result.rootCause?.confidence}%`);

  const history = await engines.executionStore?.query({ runId: payload.runId });
  print(`[Layer 4 · Data & Storage]   ExecutionStore recorded ${history?.length ?? 0} stage transitions for this run.`);

  // ---- Layer 5, continued: one direct completion, still through `gateway` -
  // (shows PII redaction explicitly; lands in the same audit trail as above)
  const response = await gateway.llm.complete({
    model: "demo:chat",
    requestedBy: "demo-script",
    runId: payload.runId,
    messages: [
      {
        role: "user",
        content:
          `Failure on ${payload.failure.testId}: ${payload.failure.errorMessage}. ` +
          "Escalate to oncall@acme.test or +1 415-555-0199 if this recurs.",
      },
    ],
  });
  print("[Layer 5 · Foundation]       Direct LLMGateway call (PII already redacted before it left the process):");
  print(`  ${response.content}`);

  // ---- The point of this whole rewrite: ONE audit trail, every pillar ----
  const runUsage = await tokenUsageStore.query({ runId: payload.runId });
  const byRequester = new Map<string, number>();
  for (const record of runUsage) {
    const key = record.requestedBy ?? "(unattributed)";
    byRequester.set(key, (byRequester.get(key) ?? 0) + 1);
  }
  print(
    `[Layer 5 · Foundation]       TokenUsageStore recorded ${runUsage.length} call(s) for this run, across every pillar that used the gateway:`,
  );
  for (const [requestedBy, count] of byRequester) {
    print(`  ${requestedBy.padEnd(20)} ${count} call(s)`);
  }
  const summary = await tokenUsageStore.summarize({ runId: payload.runId });
  print(`  total: ${summary.totalTokens} tokens, $${summary.estimatedCostUsd.toFixed(6)} estimated.`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
