import { PROVIDER_ID } from "@sentinel/schema";
import { describe, expect, it } from "vitest";
import { canRunProviderInBrowser } from "../aiBrowserTransport";

describe("aiBrowserTransport", () => {
  it("allows every configured provider in any browser context", () => {
    expect(canRunProviderInBrowser(PROVIDER_ID.OPENAI)).toBe(true);
    expect(canRunProviderInBrowser(PROVIDER_ID.ANTHROPIC)).toBe(true);
    expect(canRunProviderInBrowser(PROVIDER_ID.GEMINI)).toBe(true);
    expect(canRunProviderInBrowser(PROVIDER_ID.DEEPSEEK)).toBe(true);
    expect(canRunProviderInBrowser(PROVIDER_ID.OPENAI_COMPATIBLE)).toBe(true);
  });
});
