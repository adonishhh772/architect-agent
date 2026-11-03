import { describe, expect, it } from "vitest";
import { readAnthropicText } from "../anthropic-adapter.js";
import {
  anthropicModelThinks,
  completionTokenLimit,
  modelReservesReasoning,
  thinkingTokensForEffort,
} from "../completion-budget.js";

describe("completion budget", () => {
  it("reserves reasoning tokens for OpenAI, DeepSeek, and Anthropic thinking models", () => {
    expect(modelReservesReasoning("gpt-5")).toBe(true);
    expect(modelReservesReasoning("deepseek-reasoner")).toBe(true);
    expect(modelReservesReasoning("deepseek-v4-flash")).toBe(true);
    expect(modelReservesReasoning("gpt-4o")).toBe(false);
    expect(anthropicModelThinks("claude-opus-4-20250514")).toBe(true);
    expect(anthropicModelThinks("claude-3-5-sonnet-20241022")).toBe(false);
  });

  it("keeps the requested answer tokens on top of the thinking budget", () => {
    expect(thinkingTokensForEffort("low")).toBe(1_024);
    expect(thinkingTokensForEffort("high")).toBe(8_192);
    expect(completionTokenLimit(8_192, 8_192)).toBe(16_384);
    expect(completionTokenLimit(128, 0)).toBe(128);
  });

  it("uses Anthropic text and falls back to the thinking block", () => {
    expect(readAnthropicText([{ type: "thinking", thinking: "draft" }, { type: "text", text: "{\"findings\":[]}" }])).toBe(
      "{\"findings\":[]}",
    );
    expect(readAnthropicText([{ type: "thinking", thinking: "{\"findings\":[]}" }])).toBe("{\"findings\":[]}");
    expect(readAnthropicText([])).toBe("");
  });
});
