import { buildRepositoryStore } from "@sentinel/ingestion";
import type { AiProviderAdapter, CompletionRequest } from "@sentinel/providers";
import { ProviderError } from "@sentinel/providers";
import { AUDIT_AGENT, AGENT_RUN_STATUS, type ProviderSettings } from "@sentinel/schema";
import { extractArchitectureFromTypeScript } from "@sentinel/graph";
import { describe, expect, it } from "vitest";
import { AUDIT_MESSAGE, runAuditSpecialist } from "../audit-specialist.js";

const SETTINGS: ProviderSettings = {
  providerId: "openai",
  modelId: "mock-model",
  customEndpointConfirmed: false,
  requestTimeoutMs: 120_000,
  maxConcurrency: 1,
  maxRetries: 0,
};

const FILE_TEXT = `${"export const reviewed = true;\n".repeat(80)}`;

describe("code reader timeouts", () => {
  it("retries a timed out batch with a shorter file window and then completes", async () => {
    const prompts: string[] = [];
    let attempts = 0;
    const outputTokens: number[] = [];
    const provider = createProvider(async (_apiKey, request) => {
      attempts += 1;
      prompts.push(userContent(request));
      outputTokens.push(request.maxOutputTokens ?? 0);
      if (attempts < 3) {
        throw new ProviderError("openai", "timeout", "Request timed out", { retryable: true });
      }
      return {
        text: JSON.stringify({ threatModelOverview: "Reviewed the shorter window.", findings: [], attackPaths: [] }),
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        model: "mock-model",
        finishReason: "stop",
      };
    });

    const result = await runAuditSpecialist(specialistOptions(provider));

    expect(attempts).toBe(3);
    expect(prompts[0]).toContain("Read this window only.");
    expect(prompts[0]).not.toContain("Graph:");
    expect(prompts[1]?.length).toBeLessThan(prompts[0]?.length ?? 0);
    expect(outputTokens.every((tokens) => tokens === 1_024)).toBe(true);
    expect(result.trace.status).toBe(AGENT_RUN_STATUS.COMPLETED);
    expect(result.trace.detail).not.toBe(AUDIT_MESSAGE.READER_TIMEOUT_CONTINUED);
    expect(result.overview).toBe("Reviewed the shorter window.");
  });

  it("skips the batch after repeated timeouts so later files can still be read", async () => {
    let attempts = 0;
    const provider = createProvider(async () => {
      attempts += 1;
      throw new ProviderError("openai", "timeout", "Request timed out", { retryable: true });
    });

    const result = await runAuditSpecialist(specialistOptions(provider));

    expect(attempts).toBe(3);
    expect(result.trace.status).toBe(AGENT_RUN_STATUS.COMPLETED);
    expect(result.trace.detail).toBe(AUDIT_MESSAGE.READER_TIMEOUT_CONTINUED);
    expect(result.findings).toEqual([]);
  });
});

describe("code reader windows", () => {
  it("calls the model once on a short window and gathers that answer", async () => {
    let attempts = 0;
    const prompts: string[] = [];
    const provider = createProvider(async (_apiKey, request) => {
      attempts += 1;
      prompts.push(userContent(request));
      return {
        text: JSON.stringify({
          threatModelOverview: "The login helper returns a session.",
          findings: [
            {
              stableKey: "login-session",
              title: "Session returned without a check",
              category: "security",
              scenario: "A caller receives a session.",
              mitigation: "Require an auth check.",
              confidence: 0.6,
              references: [{ path: "src/app.ts" }],
            },
          ],
          attackPaths: [],
        }),
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        model: "mock-model",
        finishReason: "stop",
      };
    });

    const result = await runAuditSpecialist(specialistOptions(provider));

    expect(attempts).toBe(1);
    expect(prompts[0]).toContain("Read this window only.");
    expect(prompts[0]?.length ?? 0).toBeLessThanOrEqual(`Read this window only.\n\n`.length + 1_600);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.title).toBe("Session returned without a check");
    expect(result.evidenceNotes?.[0]).toContain("The login helper returns a session.");
    expect(result.evidenceNotes?.[0]).toContain("Session returned without a check");
    expect(result.evidenceNotes?.[0]).not.toContain("export const reviewed");
    expect(result.trace.detail).toBe(AUDIT_MESSAGE.READER_COMPLETE);
  });
});

describe("code reader connection drops", () => {
  it("retries a dropped connection and then saves the window", async () => {
    let attempts = 0;
    const steps: string[] = [];
    const provider = createProvider(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new ProviderError("openai", "network", "Failed to fetch", { retryable: true });
      }
      return {
        text: JSON.stringify({ threatModelOverview: "Reviewed after the connection returned.", findings: [], attackPaths: [] }),
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        model: "mock-model",
        finishReason: "stop",
      };
    });

    const result = await runAuditSpecialist({
      ...specialistOptions(provider),
      onAgentStep: (update) => {
        steps.push(update.step);
      },
    });

    expect(attempts).toBe(2);
    expect(steps).toContain(AUDIT_MESSAGE.READER_FETCH_RETRY);
    expect(result.trace.status).toBe(AGENT_RUN_STATUS.COMPLETED);
    expect(result.overview).toBe("Reviewed after the connection returned.");
    expect(result.trace.detail).toBe(AUDIT_MESSAGE.READER_COMPLETE);
  });

  it("skips one window after repeated connection drops so the reader can continue", async () => {
    let attempts = 0;
    const provider = createProvider(async () => {
      attempts += 1;
      throw new TypeError("Failed to fetch");
    });

    const result = await runAuditSpecialist(specialistOptions(provider));

    expect(attempts).toBe(3);
    expect(result.trace.status).toBe(AGENT_RUN_STATUS.COMPLETED);
    expect(result.trace.detail).toBe(AUDIT_MESSAGE.READER_FETCH_CONTINUED);
    expect(result.findings).toEqual([]);
  });
});

describe("specialist review timeouts", () => {
  it("continues after a shared-evidence timeout instead of failing the agent", async () => {
    let attempts = 0;
    const outputTokens: number[] = [];
    const provider = createProvider(async (_apiKey, request) => {
      attempts += 1;
      outputTokens.push(request.maxOutputTokens ?? 0);
      throw new ProviderError("openai", "timeout", "Request timed out", { retryable: true });
    });

    const result = await runAuditSpecialist({
      ...specialistOptions(provider),
      agentId: AUDIT_AGENT.STRIDE,
      sharedEvidence: ["src/auth.ts\nfunction login() { return true; }"],
    });

    expect(attempts).toBe(2);
    expect(outputTokens.every((tokens) => tokens === 2_048)).toBe(true);
    expect(result.trace.status).toBe(AGENT_RUN_STATUS.COMPLETED);
    expect(result.trace.detail).toContain("Reviewed 1 file windows");
    expect(result.findings).toEqual([]);
  });
});

function specialistOptions(provider: AiProviderAdapter) {
  const store = buildRepositoryStore([{ path: "src/app.ts", content: FILE_TEXT }]);
  const graph = extractArchitectureFromTypeScript({ files: store.contents });
  return {
    agentId: AUDIT_AGENT.CODE_READER,
    context: { contents: store.contents, graph },
    provider,
    apiKey: "test-key",
    architectureBrief: "",
    graphSummary: "graph",
    manifest: "- src/app.ts",
    priorFindingKeys: [],
    budget: { maxRequests: 10, maxTokens: 100_000 },
    getUsage: () => ({ requestsUsed: 0, tokensUsed: 0 }),
  };
}

function createProvider(
  complete: AiProviderAdapter["complete"],
): AiProviderAdapter {
  return {
    providerId: "openai",
    settings: SETTINGS,
    testConnection: async () => ({ ok: true }),
    listModels: async () => [],
    complete,
  };
}

function userContent(request: CompletionRequest): string {
  const message = request.messages.find((item) => item.role === "user");
  return message?.content ?? "";
}
