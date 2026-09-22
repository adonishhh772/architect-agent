import { PROVIDER_ID, type ProviderSettings } from "@sentinel/schema";
import { fetchWithTimeout, mapHttpError } from "./http-utils.js";
import type {
  AiProviderAdapter,
  CompletionRequest,
  CompletionResult,
  ConnectionTestResult,
  FetchFn,
} from "./types.js";
import { ProviderError } from "./types.js";

const ANTHROPIC_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

export function createAnthropicAdapter(
  settings: ProviderSettings,
  fetchFn: FetchFn = fetch,
): AiProviderAdapter {
  const providerId = PROVIDER_ID.ANTHROPIC;

  return {
    providerId,
    settings,
    async testConnection(apiKey: string): Promise<ConnectionTestResult> {
      const start = Date.now();
      try {
        const response = await fetchWithTimeout(
          fetchFn,
          `${ANTHROPIC_BASE}/models`,
          {
            method: "GET",
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": ANTHROPIC_VERSION,
            },
          },
          settings.requestTimeoutMs,
        );
        if (!response.ok) {
          const text = await response.text();
          return {
            ok: false,
            error: mapHttpError(providerId, response.status, text),
          };
        }
        const data = (await response.json()) as { data?: Array<{ id: string }> };
        return {
          ok: true,
          latencyMs: Date.now() - start,
          models: data.data?.map((model) => ({ id: model.id })) ?? [],
        };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof ProviderError
              ? error
              : new ProviderError(providerId, "unknown", String(error)),
        };
      }
    },
    async complete(
      apiKey: string,
      request: CompletionRequest,
    ): Promise<CompletionResult> {
      const systemMessage = request.messages.find((message) => message.role === "system");
      const nonSystemMessages = request.messages.filter(
        (message) => message.role !== "system",
      );

      const body: Record<string, unknown> = {
        model: settings.modelId,
        max_tokens: request.maxOutputTokens ?? settings.outputLimit ?? 4096,
        messages: nonSystemMessages.map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: message.content,
        })),
        temperature: request.temperature ?? 0.2,
      };
      if (systemMessage) {
        body.system = systemMessage.content;
      }

      const response = await fetchWithTimeout(
        fetchFn,
        `${ANTHROPIC_BASE}/messages`,
        {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
        settings.requestTimeoutMs,
      );

      if (!response.ok) {
        const text = await response.text();
        throw mapHttpError(providerId, response.status, text);
      }

      const data = (await response.json()) as {
        content?: Array<{ type: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
        model?: string;
        stop_reason?: string;
      };

      const textBlock = data.content?.find((block) => block.type === "text");
      const content = textBlock?.text ?? "";
      if (!content) {
        throw new ProviderError(providerId, "malformed_response", "Empty completion");
      }

      const inputTokens = data.usage?.input_tokens ?? 0;
      const outputTokens = data.usage?.output_tokens ?? 0;

      return {
        text: content,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        model: data.model ?? settings.modelId,
        finishReason: data.stop_reason ?? "unknown",
      };
    },
  };
}
