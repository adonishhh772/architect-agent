import { describe, expect, it } from "vitest";
import type { AiProviderAdapter, CompletionRequest } from "@sentinel/providers";
import { compactOverallSummary, overviewNeedsCompaction } from "../compact-overall-summary.js";

const WINDOW_NOTES =
  "This window exposes a Celery task enqueue helper that accepts a broker URL. This window shows dependency metadata from a lockfile.";

describe("overviewNeedsCompaction", () => {
  it("asks for a model summary when the text is a list of window notes", () => {
    expect(overviewNeedsCompaction(WINDOW_NOTES)).toBe(true);
  });

  it("keeps a short finished summary as it is", () => {
    expect(overviewNeedsCompaction("The API checks the session before it writes.")).toBe(false);
  });
});

describe("compactOverallSummary", () => {
  it("returns the model summary instead of a trimmed window note", async () => {
    const provider = fakeProvider("The service enqueues ingest work and records lockfile metadata.");
    const result = await compactOverallSummary({
      provider,
      apiKey: "test-key",
      overview: WINDOW_NOTES,
    });
    expect(result.text).toBe("The service enqueues ingest work and records lockfile metadata.");
    expect(result.text.includes("…")).toBe(false);
    expect(provider.prompts[0]).toContain("Celery task");
  });

  it("rejects an empty model summary", async () => {
    const provider = fakeProvider("   ");
    await expect(
      compactOverallSummary({
        provider,
        apiKey: "test-key",
        overview: WINDOW_NOTES,
      }),
    ).rejects.toThrow("The model returned an empty summary.");
  });
});

function fakeProvider(text: string): AiProviderAdapter & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    providerId: "openai",
    settings: {
      providerId: "openai",
      modelId: "test-model",
      customEndpointConfirmed: false,
      requestTimeoutMs: 1_000,
      maxConcurrency: 1,
      maxRetries: 0,
    },
    testConnection: () => Promise.reject(new Error("unused")),
    complete: (_apiKey: string, request: CompletionRequest) => {
      const userMessage = request.messages.find((message) => message.role === "user");
      prompts.push(userMessage?.content ?? "");
      return Promise.resolve({
        text,
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        model: "test-model",
        finishReason: "stop",
      });
    },
  };
}
