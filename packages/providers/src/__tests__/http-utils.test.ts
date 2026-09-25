import { describe, expect, it } from "vitest";
import { fetchWithTimeout, REQUEST_TIMED_OUT_MESSAGE } from "../http-utils.js";
import type { FetchFn } from "../types.js";
import { ProviderError } from "../types.js";

describe("fetchWithTimeout", () => {
  it("reports an aborted request as a retryable timeout", async () => {
    const fetchFn: FetchFn = () => {
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      return Promise.reject(abortError);
    };

    await expect(fetchWithTimeout(fetchFn, "https://example.test", { method: "POST" }, 1_000)).rejects.toMatchObject({
      code: "timeout",
      message: REQUEST_TIMED_OUT_MESSAGE,
      retryable: true,
    });
  });

  it("retries a dropped browser connection instead of treating it as a blocked request", async () => {
    const fetchFn: FetchFn = () => Promise.reject(new TypeError("Failed to fetch"));

    await expect(fetchWithTimeout(fetchFn, "https://example.test", { method: "POST" }, 1_000)).rejects.toMatchObject({
      code: "network",
      message: "Failed to fetch",
      retryable: true,
    });
  });

  it("uses ProviderError for the timeout", async () => {
    const fetchFn: FetchFn = () => {
      const abortError = new Error("aborted");
      abortError.name = "AbortError";
      return Promise.reject(abortError);
    };
    await expect(fetchWithTimeout(fetchFn, "https://example.test", { method: "POST" }, 1_000)).rejects.toBeInstanceOf(
      ProviderError,
    );
  });
});
