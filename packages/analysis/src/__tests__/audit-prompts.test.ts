import { describe, expect, it } from "vitest";
import { PROMPT_CHAR_LIMIT, buildSpecialistUserPrompt, clipPromptText } from "../audit-prompts.js";

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
});
