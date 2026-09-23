import { PROVIDER_ID } from "@sentinel/schema";
import { describe, expect, it } from "vitest";
import { canRunProviderInBrowser } from "../aiBrowserTransport";

describe("aiBrowserTransport", () => {
  it("allows Gemini and DeepSeek in any browser context", () => {
    expect(canRunProviderInBrowser(PROVIDER_ID.GEMINI)).toBe(true);
    expect(canRunProviderInBrowser(PROVIDER_ID.DEEPSEEK)).toBe(true);
  });

  it("keeps OpenAI off non-local hosts", () => {
    expect(canRunProviderInBrowser(PROVIDER_ID.OPENAI)).toBe(false);
  });
});
