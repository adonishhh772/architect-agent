import { PROVIDER_ID } from "@sentinel/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearStoredProviderSettings,
  hasUserSavedProviderSettings,
  readStoredProviderSettings,
  writeStoredProviderSettings,
} from "../providerSettingsStorage";

describe("providerSettingsStorage", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
  });

  afterEach(() => {
    clearStoredProviderSettings();
    vi.unstubAllGlobals();
  });

  it("ignores stale settings that were never explicitly saved by the user", () => {
    const store = new Map<string, string>([
      [
        "sentinel-provider-settings",
        JSON.stringify({
          providerId: "gemini",
          modelId: "gemini-2.5-pro",
          customEndpointConfirmed: false,
          requestTimeoutMs: 120_000,
          maxConcurrency: 2,
          maxRetries: 2,
        }),
      ],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
    expect(hasUserSavedProviderSettings()).toBe(false);
    expect(readStoredProviderSettings()).toBeNull();
    expect(store.has("sentinel-provider-settings")).toBe(false);
  });

  it("round-trips provider settings in localStorage", () => {
    writeStoredProviderSettings({
      providerId: PROVIDER_ID.DEEPSEEK,
      modelId: "deepseek-v4-pro",
      customEndpointConfirmed: false,
      requestTimeoutMs: 120_000,
      maxConcurrency: 2,
      maxRetries: 2,
    });
    const stored = readStoredProviderSettings();
    expect(stored?.providerId).toBe(PROVIDER_ID.DEEPSEEK);
    expect(stored?.modelId).toBe("deepseek-v4-pro");
    expect(hasUserSavedProviderSettings()).toBe(true);
  });
});
