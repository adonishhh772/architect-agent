import { PROVIDER_ID, type ProviderSettings } from "@sentinel/schema";
import { describe, expect, it } from "vitest";
import { createOpenAiAdapter, openAiModelUsesCompletionTokens, readCompletionText } from "../openai-adapter.js";
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

describe("readCompletionText", () => {
  it("uses the answer when it is present", () => {
    expect(readCompletionText("{\"findings\":[]}", "thinking")).toBe("{\"findings\":[]}");
  });

  it("falls back to reasoning text when the answer is empty", () => {
    expect(readCompletionText("", "{\"findings\":[]}")).toBe("{\"findings\":[]}");
    expect(readCompletionText(null, "  ")).toBe("");
  });
});

describe("createOpenAiAdapter", () => {
  it("sends max_completion_tokens and omits temperature for o3", async () => {
    const captured = await captureChatBody("o3");
    expect(captured.max_completion_tokens).toBe(4_224);
    expect(captured.reasoning_effort).toBe("medium");
    expect(captured.max_tokens).toBeUndefined();
    expect(captured.temperature).toBeUndefined();
  });

  it("adds the high reasoning budget for gpt-5", async () => {
    const captured = await captureChatBody("gpt-5", "high");
    expect(captured.max_completion_tokens).toBe(8_320);
    expect(captured.reasoning_effort).toBe("high");
  });

  it("reserves answer tokens for DeepSeek reasoner", async () => {
    const captured = await captureChatBody("deepseek-v4-pro", "high");
    expect(captured.max_tokens).toBe(8_320);
    expect(captured.reasoning_effort).toBe("high");
    expect(captured.temperature).toBeUndefined();
  });

  it("reads an answer split across content parts", () => {
    expect(readCompletionText([{ text: "{\"findings\":[]}" }], null)).toBe("{\"findings\":[]}");
    expect(readCompletionText(null, "", "{\"findings\":[]}")).toBe("{\"findings\":[]}");
  });

  it("sends max_tokens and temperature for gpt-4o", async () => {
    const captured = await captureChatBody("gpt-4o");
    expect(captured.max_tokens).toBe(128);
    expect(captured.max_completion_tokens).toBeUndefined();
    expect(captured.temperature).toBe(0.2);
  });
});

async function captureChatBody(modelId: string, reasoningEffort?: "low" | "medium" | "high"): Promise<Record<string, unknown>> {
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
  const adapter = createOpenAiAdapter(settingsFor(modelId, reasoningEffort), fetchFn);
  await adapter.complete("test-key", {
    messages: [{ role: "user", content: "review" }],
    maxOutputTokens: 128,
  });
  return body;
}

function settingsFor(modelId: string, reasoningEffort?: "low" | "medium" | "high"): ProviderSettings {
  return {
    providerId: PROVIDER_ID.OPENAI,
    modelId,
    reasoningEffort,
    customEndpointConfirmed: false,
    requestTimeoutMs: 1_000,
    maxConcurrency: 1,
    maxRetries: 0,
  };
}
