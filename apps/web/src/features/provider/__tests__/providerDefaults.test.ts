import { PROVIDER_ID } from "@sentinel/schema";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_REASONING_MODEL_BY_PROVIDER,
  getDefaultReasoningModelId,
  getReasoningPresetsForProvider,
} from "../providerDefaults";

describe("providerDefaults reasoning models", () => {
  it("defines a top reasoning default for every provider", () => {
    for (const providerId of Object.values(PROVIDER_ID)) {
      expect(getDefaultReasoningModelId(providerId)).toBe(
        DEFAULT_REASONING_MODEL_BY_PROVIDER[providerId],
      );
      expect(getDefaultReasoningModelId(providerId).length).toBeGreaterThan(0);
    }
  });

  it("includes flagship reasoning presets per provider", () => {
    expect(getReasoningPresetsForProvider(PROVIDER_ID.DEEPSEEK)[0]?.id).toBe("deepseek-v4-pro");
    expect(getReasoningPresetsForProvider(PROVIDER_ID.GEMINI)[0]?.id).toBe("gemini-2.5-pro");
    expect(getReasoningPresetsForProvider(PROVIDER_ID.OPENAI)[0]?.id).toBe("gpt-5");
    expect(getReasoningPresetsForProvider(PROVIDER_ID.OPENAI).map((preset) => preset.id)).toEqual([
      "gpt-5",
      "gpt-5-mini",
      "gpt-4.1",
      "gpt-4.1-mini",
    ]);
  });
});
