import { describe, expect, it } from "vitest";
import { AUDIT_AGENT } from "@sentinel/schema";
import {
  CODE_READER_PROMPT_LIMIT,
  PROMPT_CHAR_LIMIT,
  buildCodeReaderUserPrompt,
  buildSpecialistUserPrompt,
  clipPromptText,
} from "../audit-prompts.js";

describe("buildSpecialistUserPrompt", () => {
  it("keeps a large file batch under the prompt cap", () => {
    const prompt = buildSpecialistUserPrompt({
      agentId: "code_reader",
      architectureBrief: "x".repeat(5_000),
      graphSummary: "n".repeat(5_000),
      manifest: Array.from({ length: 400 }, (_value, index) => `- src/file-${index}.ts`).join("\n"),
      observations: ["y".repeat(20_000), "z".repeat(20_000)],
      priorFindingKeys: Array.from({ length: 80 }, (_value, index) => `finding-${index}`),
      memoryText: "m".repeat(5_000),
    });
    expect(prompt.length).toBeLessThanOrEqual(PROMPT_CHAR_LIMIT.TOTAL);
    expect(prompt).toContain("Return one JSON object");
  });

  it("leaves short text unchanged", () => {
    expect(clipPromptText("auth.ts", 20)).toBe("auth.ts");
  });

  it("sends the code reader only the current source window", () => {
    const windowText = "src/auth.ts:1-12\nexport function login() { return session; }";
    const prompt = buildCodeReaderUserPrompt([windowText, "y".repeat(5_000)]);
    expect(prompt.startsWith("Read this window only.")).toBe(true);
    expect(prompt).toContain("src/auth.ts");
    expect(prompt).not.toContain("Graph:");
    expect(prompt.length).toBeLessThanOrEqual(`Read this window only.\n\n`.length + CODE_READER_PROMPT_LIMIT);
    expect(prompt).not.toContain(AUDIT_AGENT.STRIDE);
  });
});
