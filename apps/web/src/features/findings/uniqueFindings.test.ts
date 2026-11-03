import { describe, expect, it } from "vitest";
import type { Finding } from "@sentinel/schema";
import { FINDING_STATUS } from "@sentinel/schema";
import { citedFileCount, collapseFindingsByTitle, uniqueFindings } from "./uniqueFindings";

describe("uniqueFindings", () => {
  it("keeps one finding and drops duplicates of the same vulnerability", () => {
    const primary = sampleFinding("primary", "eval-a");
    const duplicate = { ...sampleFinding("copy", "eval-b"), duplicateOfStableKey: "eval-a" };
    expect(uniqueFindings([primary, duplicate]).map((finding) => finding.id)).toEqual(["primary"]);
  });
});

describe("collapseFindingsByTitle", () => {
  it("keeps one row when the same title was reported for several windows", () => {
    const first = sampleFinding("first", "route-a");
    first.title = "HTTP route has no authentication check nearby";
    first.references = [{ path: "src/a.ts", startLine: 4 }];
    const second = sampleFinding("second", "route-b");
    second.title = "HTTP route has no authentication check nearby";
    second.references = [{ path: "src/b.ts", startLine: 9 }];
    const collapsed = collapseFindingsByTitle([first, second]);
    expect(collapsed).toHaveLength(1);
    expect(citedFileCount(collapsed[0] ?? first)).toBe(2);
  });
});

describe("citedFileCount", () => {
  it("counts distinct cited paths", () => {
    const finding = sampleFinding("primary", "eval-a");
    finding.references = [
      { path: "src/a.ts", startLine: 1 },
      { path: "src/a.ts", startLine: 8 },
      { path: "src/b.ts", startLine: 2 },
    ];
    expect(citedFileCount(finding)).toBe(2);
  });
});

function sampleFinding(id: string, stableKey: string): Finding {
  return {
    id,
    stableKey,
    title: "Dynamic code execution via eval",
    category: "security",
    strideCategories: [],
    status: FINDING_STATUS.CODE_SUPPORTED,
    affectedNodeIds: [],
    affectedAssetSummary: "src/a.ts",
    references: [{ path: "src/a.ts", startLine: 1 }],
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
  };
}
