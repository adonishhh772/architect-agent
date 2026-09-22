import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonWithRepair } from "../json-repair.js";

describe("parseJsonWithRepair", () => {
  it("parses fenced json", () => {
    const schema = z.object({ title: z.string() });
    const result = parseJsonWithRepair('Here is output:\n```json\n{"title":"x"}\n```', schema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("x");
    }
  });

  it("fails when validation fails after repair", () => {
    const schema = z.object({ count: z.number() });
    const result = parseJsonWithRepair('{"count":"not-a-number"}', schema);
    expect(result.success).toBe(false);
  });
});
