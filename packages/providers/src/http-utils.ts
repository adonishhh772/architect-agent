import { ProviderError } from "./types.js";
import type { FetchFn } from "./types.js";

export async function fetchWithTimeout(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ProviderError("unknown", "timeout", "Request timed out", {
        retryable: true,
        cause: error,
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/failed to fetch|cors|network/i.test(message)) {
      throw new ProviderError("unknown", "cors", message, {
        retryable: false,
        cause: error,
      });
    }
    throw new ProviderError("unknown", "network", message, {
      retryable: true,
      cause: error,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export function mapHttpError(
  providerId: string,
  status: number,
  bodyText: string,
): ProviderError {
  if (status === 401 || status === 403) {
    return new ProviderError(providerId, "authentication", bodyText.slice(0, 500), {
      statusCode: status,
      retryable: false,
    });
  }
  if (status === 429) {
    return new ProviderError(providerId, "quota", bodyText.slice(0, 500), {
      statusCode: status,
      retryable: true,
    });
  }
  if (status >= 500) {
    return new ProviderError(providerId, "unknown", bodyText.slice(0, 500), {
      statusCode: status,
      retryable: true,
    });
  }
  return new ProviderError(providerId, "malformed_response", bodyText.slice(0, 500), {
    statusCode: status,
    retryable: false,
  });
}
