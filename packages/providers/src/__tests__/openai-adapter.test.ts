import { PROVIDER_ID, type ProviderSettings } from "@sentinel/schema";
import { describe, expect, it } from "vitest";
import { createOpenAiAdapter, openAiModelUsesCompletionTokens } from "../openai-adapter.js";
import type { FetchFn } from "../types.js";

describe("openAiModelUsesCompletionTokens", () => {
  it("selects completion tokens for reasoning and gpt-5 models", () => {
    expect(openAiModelUsesCompletionTokens("o3")).toBe(true);
    expect(openAiModelUsesCompletionTokens("o3-mini")).toBe(true);
    expect(openAiModelUsesCompletionTokens("o4-mini")).toBe(true);
    expect(openAiModelUsesCompletionTokens("gpt-5")).toBe(true);
  });

  it("keeps max_tokens for older chat models", () => {
    expect(openAiModelUsesCompletionTokens("gpt-4o")).toBe(false);
    expect(openAiModelUsesCompletionTokens("gpt-4.1")).toBe(true);
    expect(openAiModelUsesCompletionTokens("gpt-4.1-mini")).toBe(true);
  });
});

describe("createOpenAiAdapter", () => {
  it("sends max_completion_tokens and omits temperature for o3", async () => {
    const captured = await captureChatBody("o3");
    expect(captured.max_completion_tokens).toBe(128);
    expect(captured.max_tokens).toBeUndefined();
    expect(captured.temperature).toBeUndefined();
  });

  it("sends max_tokens and temperature for gpt-4o", async () => {
    const captured = await captureChatBody("gpt-4o");
    expect(captured.max_tokens).toBe(128);
    expect(captured.max_completion_tokens).toBeUndefined();
    expect(captured.temperature).toBe(0.2);
  });
});

async function captureChatBody(modelId: string): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> = {};
  const fetchFn: FetchFn = (_input, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "{\"ok\":true}" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          model: modelId,
        }),
        { status: 200 },
      ),
    );
  };
  const adapter = createOpenAiAdapter(settingsFor(modelId), fetchFn);
  await adapter.complete("test-key", {
    messages: [{ role: "user", content: "review" }],
    maxOutputTokens: 128,
  });
  return body;
}

function settingsFor(modelId: string): ProviderSettings {
  return {
    providerId: PROVIDER_ID.OPENAI,
    modelId,
    customEndpointConfirmed: false,
    requestTimeoutMs: 1_000,
    maxConcurrency: 1,
    maxRetries: 0,
  };
}
