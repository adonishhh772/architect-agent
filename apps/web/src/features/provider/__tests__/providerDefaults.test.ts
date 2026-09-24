import { PROVIDER_ID } from "@sentinel/schema";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_REASONING_MODEL_BY_PROVIDER,
  getDefaultReasoningModelId,
  getReasoningPresetsForProvider,
  inferReasoningEffort,
  modelIdForReasoningEffort,
  REASONING_EFFORT,
  resolveSelectedEffort,
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

  it("maps each effort preset to a provider model without exposing the choice in the label", () => {
    expect(modelIdForReasoningEffort(PROVIDER_ID.OPENAI, REASONING_EFFORT.LOW)).toBe("gpt-4.1-mini");
    expect(modelIdForReasoningEffort(PROVIDER_ID.OPENAI, REASONING_EFFORT.MEDIUM)).toBe("gpt-5-mini");
    expect(modelIdForReasoningEffort(PROVIDER_ID.OPENAI, REASONING_EFFORT.HIGH)).toBe("gpt-5");
    expect(modelIdForReasoningEffort(PROVIDER_ID.DEEPSEEK, REASONING_EFFORT.HIGH)).toBe("deepseek-v4-pro");
    expect(modelIdForReasoningEffort(PROVIDER_ID.GEMINI, REASONING_EFFORT.MEDIUM)).toBe("gemini-2.5-flash");
  });

  it("infers effort from a known model and falls back to high", () => {
    expect(inferReasoningEffort(PROVIDER_ID.OPENAI, "gpt-5-mini")).toBe(REASONING_EFFORT.MEDIUM);
    expect(inferReasoningEffort(PROVIDER_ID.OPENAI, "unknown-model")).toBe(REASONING_EFFORT.HIGH);
  });

  it("keeps a stored effort even when the model id does not match that tier", () => {
    expect(resolveSelectedEffort(PROVIDER_ID.GEMINI, "gemini-2.5-pro", REASONING_EFFORT.LOW)).toBe(
      REASONING_EFFORT.LOW,
    );
    expect(resolveSelectedEffort(PROVIDER_ID.GEMINI, "gemini-2.5-flash", undefined)).toBe(REASONING_EFFORT.MEDIUM);
    expect(resolveSelectedEffort("not-a-provider", "gemini-2.5-pro", undefined)).toBe(REASONING_EFFORT.HIGH);
  });
});
