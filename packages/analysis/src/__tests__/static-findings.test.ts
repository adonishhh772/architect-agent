import { describe, expect, it } from "vitest";
import { extractArchitectureFromTypeScript } from "../../../graph/src/typescript-extractor.js";
import { generateStaticFindings } from "../static-findings.js";

describe("generateStaticFindings", () => {
  it("detects eval usage in fixture", () => {
    const contents = new Map<string, string>([
      ["src/unsafe.ts", "export function run(input: string) { eval(input); }\n"],
    ]);
    const graph = extractArchitectureFromTypeScript({ files: contents });
    const findings = generateStaticFindings({ contents, graph });
    expect(findings.some((finding) => finding.title.includes("eval"))).toBe(true);
  });
});
