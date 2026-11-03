import { z } from "zod";

const MAX_REPAIR_ATTEMPTS = 2;

export function extractJsonFromText(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
  }
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return null;
}

export function parseJsonWithRepair<T>(
  text: string,
  schema: z.ZodType<T>,
): { success: true; data: T } | { success: false; error: string } {
  let candidate = extractJsonFromText(text);
  if (!candidate) {
    return { success: false, error: "no_json_found" };
  }

  for (let attempt = 0; attempt <= MAX_REPAIR_ATTEMPTS; attempt += 1) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      const validated = schema.safeParse(parsed);
      if (validated.success) {
        return { success: true, data: validated.data };
      }
      if (attempt === MAX_REPAIR_ATTEMPTS) {
        return {
          success: false,
          error: validated.error.message.slice(0, 500),
        };
      }
    } catch {
      if (attempt === MAX_REPAIR_ATTEMPTS) {
        return { success: false, error: "json_parse_failed" };
      }
    }
    candidate = candidate
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/\u201c|\u201d/g, '"')
      .replace(/\u2018|\u2019/g, "'");
  }

  return { success: false, error: "validation_failed" };
}
