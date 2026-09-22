import { PROVIDER_ID } from "@sentinel/schema";
import { describe, expect, it } from "vitest";
import { canRunProviderInBrowser } from "../aiBrowserTransport";

describe("aiBrowserTransport", () => {
  it("allows Gemini in any browser context", () => {
    expect(canRunProviderInBrowser(PROVIDER_ID.GEMINI)).toBe(true);
  });
});
