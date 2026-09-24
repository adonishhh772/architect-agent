import { PROVIDER_ID, type ProviderSettings } from "@sentinel/schema";
import { fetchWithTimeout, mapHttpError } from "./http-utils.js";
import type {
  AiProviderAdapter,
  CompletionRequest,
  CompletionResult,
  ConnectionTestResult,
  FetchFn,
} from "./types.js";
import { completionTokenLimit, thinkingTokensForEffort } from "./completion-budget.js";
import { ProviderError } from "./types.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export function createGeminiAdapter(
  settings: ProviderSettings,
  fetchFn: FetchFn = fetch,
): AiProviderAdapter {
  const providerId = PROVIDER_ID.GEMINI;

  return {
    providerId,
    settings,
    async testConnection(apiKey: string): Promise<ConnectionTestResult> {
      const start = Date.now();
      try {
        const response = await fetchWithTimeout(
          fetchFn,
          `${GEMINI_BASE}/models?key=${encodeURIComponent(apiKey)}`,
          { method: "GET" },
          settings.requestTimeoutMs,
        );
        if (!response.ok) {
          const text = await response.text();
          return {
            ok: false,
            error: mapHttpError(providerId, response.status, text),
          };
        }
        const data = (await response.json()) as {
          models?: Array<{ name: string; displayName?: string }>;
        };
        return {
          ok: true,
          latencyMs: Date.now() - start,
          models:
            data.models?.map((model) => ({
              id: model.name.replace(/^models\//, ""),
              displayName: model.displayName,
            })) ?? [],
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
      const contents = request.messages
        .filter((message) => message.role !== "system")
        .map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
        }));

      const systemMessage = request.messages.find((message) => message.role === "system");

      const body: Record<string, unknown> = {
        contents,
        generationConfig: {
          temperature: request.temperature ?? 0.2,
          maxOutputTokens: completionTokenLimit(request.maxOutputTokens ?? settings.outputLimit, thinkingTokensForEffort(settings.reasoningEffort)),
          responseMimeType: request.jsonSchema ? "application/json" : "text/plain",
          thinkingConfig: { thinkingBudget: thinkingTokensForEffort(settings.reasoningEffort) },
        },
      };
      if (systemMessage) {
        body.systemInstruction = { parts: [{ text: systemMessage.content }] };
      }

      const modelId = settings.modelId.startsWith("models/")
        ? settings.modelId
        : `models/${settings.modelId}`;

      const response = await fetchWithTimeout(
        fetchFn,
        `${GEMINI_BASE}/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        settings.requestTimeoutMs,
      );

      if (!response.ok) {
        const text = await response.text();
        throw mapHttpError(providerId, response.status, text);
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string; thought?: boolean }> };
          finishReason?: string;
        }>;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        };
        modelVersion?: string;
      };

      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const answer = parts.filter((part) => !part.thought).map((part) => part.text ?? "").join("");
      const thoughts = parts.filter((part) => part.thought).map((part) => part.text ?? "").join("");
      const content = answer.trim() || thoughts.trim();
      if (!content) {
        throw new ProviderError(providerId, "malformed_response", "Empty completion");
      }

      return {
        text: content,
        usage: {
          inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
          totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
        },
        model: data.modelVersion ?? settings.modelId,
        finishReason: data.candidates?.[0]?.finishReason ?? "unknown",
      };
    },
  };
}
