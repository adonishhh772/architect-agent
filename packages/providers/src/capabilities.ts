import { PROVIDER_ID } from "@sentinel/schema";
import type { ProviderCapabilities } from "@sentinel/schema";

export function getProviderCapabilities(
  providerId: (typeof PROVIDER_ID)[keyof typeof PROVIDER_ID],
): ProviderCapabilities {
  switch (providerId) {
    case PROVIDER_ID.OPENAI:
      return {
        browserCallable: false,
        structuredOutput: true,
        modelDiscovery: true,
        toolCalling: true,
        notes: [
          "OpenAI API does not allow browser CORS for API keys; use Deep Runner or a server proxy in production.",
        ],
      };
    case PROVIDER_ID.ANTHROPIC:
      return {
        browserCallable: false,
        structuredOutput: false,
        modelDiscovery: true,
        toolCalling: true,
        notes: [
          "Anthropic Messages API is not intended for direct browser use due to CORS and key exposure.",
        ],
      };
    case PROVIDER_ID.GEMINI:
      return {
        browserCallable: true,
        structuredOutput: true,
        modelDiscovery: true,
        toolCalling: true,
        notes: [
          "Gemini API keys in the browser are still exposed to anyone with access to the session; prefer Deep Runner for private repos.",
        ],
      };
    case PROVIDER_ID.DEEPSEEK:
      return {
        browserCallable: false,
        structuredOutput: true,
        modelDiscovery: true,
        toolCalling: true,
        notes: ["DeepSeek uses an OpenAI-compatible API; browser CORS is typically blocked."],
      };
    case PROVIDER_ID.OPENAI_COMPATIBLE:
      return {
        browserCallable: false,
        structuredOutput: true,
        modelDiscovery: false,
        toolCalling: true,
        notes: [
          "Custom endpoints require explicit user confirmation before sending credentials.",
        ],
      };
    default:
      return {
        browserCallable: false,
        structuredOutput: false,
        modelDiscovery: false,
        toolCalling: false,
        notes: [],
      };
  }
}
