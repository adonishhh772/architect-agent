import { describe, expect, it } from "vitest";
import { FINDING_STATUS, type Finding } from "@sentinel/schema";
import { citationOmissionNote, summarizeFindingCitations } from "../finding-citations.js";

describe("summarizeFindingCitations", () => {
  it("keeps every file, including one past the old 100-file cutoff", () => {
    const references = Array.from({ length: 105 }, (_, index) => ({
      path: `src/file-${index}.ts`,
      startLine: 1,
      endLine: 1,
    }));
    const summary = summarizeFindingCitations([sampleFinding("finding-many", "eval-many", references, 5)]);
    expect(summary.citations).toHaveLength(105);
    expect(summary.citations.some((citation) => citation.path === "src/file-104.ts")).toBe(true);
    expect(summary.omittedFileCount).toBe(0);
  });

  it("lists the higher-risk file before a lower-risk file", () => {
    const summary = summarizeFindingCitations([
      sampleFinding("finding-low", "eval-low", [{ path: "src/low-risk.ts", startLine: 2, endLine: 2 }], 4),
      sampleFinding("finding-high", "eval-high", [{ path: "src/critical.ts", startLine: 40, endLine: 40 }], 25),
    ]);
    expect(summary.citations.map((citation) => citation.path)).toEqual(["src/critical.ts", "src/low-risk.ts"]);
    expect(summary.omittedFileCount).toBe(0);
  });

  it("does not report an omission when every file is cited", () => {
    expect(citationOmissionNote(0)).toBeUndefined();
    expect(citationOmissionNote(1)).toBe("1 lower-risk file also contains this weakness and is not listed.");
  });
});

function sampleFinding(id: string, stableKey: string, references: Finding["references"], riskScore: number): Finding {
  return {
    id,
    stableKey,
    title: "Dynamic code execution via eval",
    category: "security",
    strideCategories: [],
    status: FINDING_STATUS.CODE_SUPPORTED,
    affectedNodeIds: [],
    affectedAssetSummary: references[0]?.path ?? "src/unknown.ts",
    references,
    evidence: [],
    scenario: "scenario",
    preconditions: [],
    trustBoundaryCrossings: [],
    existingControls: [],
    counterevidence: [],
    confidence: 0.8,
    severityRationale: "severity",
    likelihoodRationale: "likelihood",
    assumptions: [],
    openQuestions: [],
    mitigation: "Remove eval.",
    relatedFindingIds: [],
    attackPathIds: [],
    riskScore,
  };
}
