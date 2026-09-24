import { PROVIDER_ID } from "@sentinel/schema";
import type { ProviderCapabilities } from "@sentinel/schema";

export function getProviderCapabilities(
  providerId: (typeof PROVIDER_ID)[keyof typeof PROVIDER_ID],
): ProviderCapabilities {
  switch (providerId) {
    case PROVIDER_ID.OPENAI:
      return {
        browserCallable: true,
        structuredOutput: true,
        modelDiscovery: true,
        toolCalling: true,
        notes: [
          "OpenAI is called directly from the browser, including GitHub Pages. The API key is visible to this browser session.",
        ],
      };
    case PROVIDER_ID.ANTHROPIC:
      return {
        browserCallable: true,
        structuredOutput: false,
        modelDiscovery: true,
        toolCalling: true,
        notes: [
          "Anthropic is called directly from the browser with the browser-access header. The API key is visible to this browser session.",
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
        browserCallable: true,
        structuredOutput: true,
        modelDiscovery: true,
        toolCalling: true,
        notes: [
          "DeepSeek is called directly from the browser, including GitHub Pages. The API key is visible to this browser session.",
        ],
      };
    case PROVIDER_ID.OPENAI_COMPATIBLE:
      return {
        browserCallable: true,
        structuredOutput: true,
        modelDiscovery: false,
        toolCalling: true,
        notes: [
          "Custom endpoints are called from the browser after you confirm the endpoint. The endpoint must allow this site's origin.",
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
