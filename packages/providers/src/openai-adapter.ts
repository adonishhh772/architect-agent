import { PROVIDER_ID, type ProviderSettings } from "@sentinel/schema";
import { fetchWithTimeout, mapHttpError } from "./http-utils.js";
import type {
  AiProviderAdapter,
  CompletionRequest,
  CompletionResult,
  ConnectionTestResult,
  FetchFn,
  ModelInfo,
} from "./types.js";
import { ProviderError } from "./types.js";

const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";

export function createOpenAiAdapter(
  settings: ProviderSettings,
  fetchFn: FetchFn = fetch,
  baseUrl: string = DEFAULT_OPENAI_BASE,
): AiProviderAdapter {
  const providerId =
    settings.providerId === PROVIDER_ID.OPENAI_COMPATIBLE
      ? PROVIDER_ID.OPENAI_COMPATIBLE
      : PROVIDER_ID.OPENAI;

  const resolveBase = (): string => {
    if (settings.endpoint) {
      return settings.endpoint.replace(/\/$/, "");
    }
    return baseUrl;
  };

  return {
    providerId,
    settings,
    async testConnection(apiKey: string): Promise<ConnectionTestResult> {
      const start = Date.now();
      try {
        const response = await fetchWithTimeout(
          fetchFn,
          `${resolveBase()}/models`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${apiKey}`,
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
        const models: ModelInfo[] =
          data.data?.map((model) => ({ id: model.id })) ?? [];
        return { ok: true, latencyMs: Date.now() - start, models };
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
    async listModels(apiKey: string): Promise<ModelInfo[]> {
      const result = await this.testConnection(apiKey);
      return result.models ?? [];
    },
    async complete(
      apiKey: string,
      request: CompletionRequest,
    ): Promise<CompletionResult> {
      const body: Record<string, unknown> = {
        model: settings.modelId,
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
      };
      if (request.maxOutputTokens) {
        body.max_tokens = request.maxOutputTokens;
      }
      if (request.jsonSchema) {
        body.response_format = { type: "json_object" };
      }

      const response = await fetchWithTimeout(
        fetchFn,
        `${resolveBase()}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
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
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        model?: string;
      };

      const content = data.choices?.[0]?.message?.content ?? "";
      if (!content) {
        throw new ProviderError(providerId, "malformed_response", "Empty completion");
      }

      return {
        text: content,
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
          totalTokens: data.usage?.total_tokens ?? 0,
        },
        model: data.model ?? settings.modelId,
        finishReason: data.choices?.[0]?.finish_reason ?? "unknown",
      };
    },
  };
}
