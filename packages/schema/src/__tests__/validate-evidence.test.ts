import { describe, expect, it } from "vitest";
import { validateFindingsEvidence } from "../validate-evidence.js";
import { fileIndexFromRecord } from "../repository-index.js";

describe("validateFindingsEvidence", () => {
  it("flags references to missing files", () => {
    const index = fileIndexFromRecord({
      files: {
        "src/a.ts": {
          path: "src/a.ts",
          size: 10,
          lineCount: 5,
        },
      },
    });
    const result = validateFindingsEvidence(
      [
        {
          id: "f1",
          stableKey: "f1",
          title: "t",
          category: "security",
          strideCategories: [],
          status: "insufficient_evidence",
          affectedNodeIds: [],
          affectedAssetSummary: "x",
          references: [{ path: "missing.ts" }],
          evidence: [],
          scenario: "s",
          preconditions: [],
          trustBoundaryCrossings: [],
          existingControls: [],
          counterevidence: [],
          confidence: 0.5,
          severityRationale: "r",
          likelihoodRationale: "r",
          assumptions: [],
          openQuestions: [],
          mitigation: "m",
          relatedFindingIds: [],
          attackPathIds: [],
        },
      ],
      index,
    );
    expect(result.valid).toBe(false);
  });
});
