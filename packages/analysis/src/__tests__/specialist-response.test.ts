import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseLooseJson, parseSpecialistResponse } from "../specialist-response.js";

const ResponseSchema = z.object({
  threatModelOverview: z.string().optional(),
  findings: z
    .array(
      z.object({
        stableKey: z.string().min(1),
        title: z.string().min(1),
        category: z.enum(["architecture", "security", "ai_security"]),
        scenario: z.string(),
        mitigation: z.string(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(8)
    .optional(),
  toolCalls: z
    .array(
      z.object({
        tool: z.enum(["readFileRange", "searchCode"]),
        args: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .max(4)
    .optional(),
});

describe("parseSpecialistResponse", () => {
  it("keeps a finding when confidence and category are not strict JSON types", () => {
    const text = `{
      "findings": [{
        "title": "Request logs include tokens",
        "category": "Security",
        "confidence": "high",
        "scenario": "Access logs store bearer tokens."
      }]
    }`;
    const parsed = parseSpecialistResponse(text, ResponseSchema);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    expect(parsed.data.findings?.[0]).toMatchObject({
      title: "Request logs include tokens",
      category: "security",
      confidence: 0.8,
      scenario: "Access logs store bearer tokens.",
    });
  });

  it("drops an unknown tool and keeps the overview", () => {
    const text = '{"threatModelOverview":"Reviewed the logger.","toolCalls":[{"tool":"read_file_range","args":{"path":"a.py"}}]}';
    const parsed = parseSpecialistResponse(text, ResponseSchema);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    expect(parsed.data.threatModelOverview).toBe("Reviewed the logger.");
    expect(parsed.data.toolCalls?.[0]?.tool).toBe("readFileRange");
  });

  it("closes a truncated JSON object", () => {
    const parsed = parseLooseJson('{"threatModelOverview":"partial"');
    expect(parsed).toEqual({ threatModelOverview: "partial" });
  });

  it("reports when the reply has no JSON object", () => {
    const parsed = parseSpecialistResponse("I could not review these files.", ResponseSchema);
    expect(parsed.success).toBe(false);
  });
});
