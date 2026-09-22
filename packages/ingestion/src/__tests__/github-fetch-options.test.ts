import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeGitHubFetchOptions } from "../github-client.js";

describe("normalizeGitHubFetchOptions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses local proxy paths on localhost browser", () => {
    vi.stubGlobal("window", { location: { hostname: "localhost" } });
    const normalized = normalizeGitHubFetchOptions({});
    expect(normalized.apiBaseUrl).toBe("/__sentinel/github/api");
    expect(normalized.codeloadBaseUrl).toBe("/__sentinel/github/codeload");
  });

  it("does not force proxy for node runtime", () => {
    vi.stubGlobal("window", { location: { hostname: "localhost" } });
    const normalized = normalizeGitHubFetchOptions({ runtime: "node" });
    expect(normalized.apiBaseUrl).toBeUndefined();
    expect(normalized.codeloadBaseUrl).toBeUndefined();
  });
});
