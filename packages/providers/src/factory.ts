import { PROVIDER_ID, ProviderSettingsSchema, type ProviderSettings } from "@sentinel/schema";
import { createAnthropicAdapter } from "./anthropic-adapter.js";
import { createDeepSeekAdapter } from "./deepseek-adapter.js";
import { createGeminiAdapter } from "./gemini-adapter.js";
import { createOpenAiAdapter } from "./openai-adapter.js";
import type { AiProviderAdapter, FetchFn } from "./types.js";
import { ProviderError } from "./types.js";

export function createProviderAdapter(
  settings: ProviderSettings,
  fetchFn?: FetchFn,
): AiProviderAdapter {
  const parsed = ProviderSettingsSchema.parse(settings);

  if (parsed.providerId === PROVIDER_ID.OPENAI_COMPATIBLE) {
    if (!parsed.endpoint) {
      throw new ProviderError(
        PROVIDER_ID.OPENAI_COMPATIBLE,
        "malformed_response",
        "Custom OpenAI-compatible endpoint is required",
      );
    }
    if (!parsed.customEndpointConfirmed) {
      throw new ProviderError(
        PROVIDER_ID.OPENAI_COMPATIBLE,
        "authentication",
        "Confirm the custom endpoint before sending credentials",
      );
    }
  }

  switch (parsed.providerId) {
    case PROVIDER_ID.OPENAI:
      return createOpenAiAdapter(parsed, fetchFn);
    case PROVIDER_ID.OPENAI_COMPATIBLE:
      return createOpenAiAdapter(parsed, fetchFn, parsed.endpoint);
    case PROVIDER_ID.ANTHROPIC:
      return createAnthropicAdapter(parsed, fetchFn);
    case PROVIDER_ID.GEMINI:
      return createGeminiAdapter(parsed, fetchFn);
    case PROVIDER_ID.DEEPSEEK:
      return createDeepSeekAdapter(parsed, fetchFn);
    default:
      throw new ProviderError(parsed.providerId, "unsupported_model", "Unknown provider");
  }
}
