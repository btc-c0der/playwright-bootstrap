import type { AiRepairProvider, LocatorDescriptor, RepairSuggestion } from "@qaf/core";
import type { LLMGateway } from "@qaf/llm-gateway";

export interface GatewayAiRepairProviderOptions {
  gateway: LLMGateway;
  /** `"<prefix>:<model-name>"` — must be a vision-capable model; the screenshot is sent as an inline image content part. */
  model: string;
  requestedBy?: string;
  runId?: string;
}

interface ParsedSuggestion {
  suggestedSelector: string;
  confidence: number;
  rationale: string;
}

const SYSTEM_PROMPT =
  "You repair broken Playwright locators. Given the element's original descriptor, the current DOM " +
  "snapshot, and (if provided) a screenshot, respond with ONLY a JSON object " +
  '{"suggestedSelector": string, "confidence": number between 0 and 1, "rationale": string} — no prose, no markdown fences.';

/**
 * `@qaf/core`'s `AiRepairProvider` implemented over `@qaf/llm-gateway`'s
 * `LLMGateway` instead of a bespoke API client — this is what actually
 * routes the self-healing pillar's LLM calls through Layer 5's shared audit
 * trail + PII redaction, instead of holding its own unaudited provider.
 * `NoopAiRepairProvider` remains the right default for anyone who hasn't
 * wired a gateway — see `apps/gateway-api/src/config.ts`'s
 * `buildEnginesWithGateway`.
 */
export class GatewayAiRepairProvider implements AiRepairProvider {
  constructor(private readonly options: GatewayAiRepairProviderOptions) {}

  async suggest(context: {
    descriptor: LocatorDescriptor;
    domSnapshot: string;
    screenshot: Buffer;
  }): Promise<RepairSuggestion | null> {
    const response = await this.options.gateway.complete({
      model: this.options.model,
      requestedBy: this.options.requestedBy ?? "self-healing-engine",
      runId: this.options.runId,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Original descriptor: ${JSON.stringify(context.descriptor)}\n\nCurrent DOM:\n${context.domSnapshot}`,
            },
            ...(context.screenshot.length > 0
              ? [
                  {
                    type: "image" as const,
                    mediaType: "image/png",
                    data: context.screenshot.toString("base64"),
                  },
                ]
              : []),
          ],
        },
      ],
    });

    const parsed = parseSuggestion(response.content);
    if (!parsed) return null;

    return {
      descriptor: context.descriptor,
      fallbackLabel: context.descriptor.fallbackLabel,
      suggestedSelector: parsed.suggestedSelector,
      confidence: parsed.confidence,
      rationale: parsed.rationale,
      timestamp: new Date().toISOString(),
    };
  }
}

function parseSuggestion(text: string): ParsedSuggestion | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as ParsedSuggestion;
  } catch {
    return null;
  }
}
