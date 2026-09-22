import { describe, expect, it } from "vitest";
import { extractArchitectureFromTypeScript } from "../typescript-extractor.js";

describe("extractArchitectureFromTypeScript", () => {
  it("extracts express route nodes", () => {
    const files = new Map<string, string>([
      ["src/main.ts", "app.get('/health', handler);\n"],
    ]);
    const graph = extractArchitectureFromTypeScript({ files });
    expect(graph.nodes.some((node) => node.kind === "api_entry")).toBe(true);
  });
});
