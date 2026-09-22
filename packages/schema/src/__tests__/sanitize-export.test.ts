import { describe, expect, it } from "vitest";
import { stripSecretsFromObject } from "../sanitize-export.js";

describe("stripSecretsFromObject", () => {
  it("removes secret keys from nested objects", () => {
    const input = {
      name: "test",
      apiKey: "sk-secret",
      nested: { token: "abc", value: 1 },
    };
    const result = stripSecretsFromObject(input) as Record<string, unknown>;
    expect(result.name).toBe("test");
    expect(result.apiKey).toBeUndefined();
    expect((result.nested as Record<string, unknown>).token).toBeUndefined();
    expect((result.nested as Record<string, unknown>).value).toBe(1);
  });
});
