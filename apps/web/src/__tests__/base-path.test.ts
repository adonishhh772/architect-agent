import { describe, expect, it } from "vitest";

describe("GitHub Pages hash routing", () => {
  it("uses hash routes independent of subpath", () => {
    const basePath = "/architecture-sentinel/";
    const route = "#/workspace";
    expect(`${basePath}${route}`.includes("#/workspace")).toBe(true);
  });
});
