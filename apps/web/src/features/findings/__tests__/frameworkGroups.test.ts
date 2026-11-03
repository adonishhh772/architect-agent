import { describe, expect, it } from "vitest";
import { FINDING_STATUS, RISK_DOMAIN } from "@sentinel/schema";
import type { Finding } from "@sentinel/schema";
import { countFrameworkTags, groupFindingsByRiskDomain } from "../frameworkGroups";

function sampleFinding(overrides: Partial<Finding>): Finding {
  return {
    id: "finding-1",
    stableKey: "finding-1",
    title: "Sample",
    category: "security",
    strideCategories: [],
    status: FINDING_STATUS.PLAUSIBLE_THREAT,
    affectedNodeIds: [],
    affectedAssetSummary: "src/a.ts",
    references: [],
    evidence: [],
    scenario: "scenario",
    preconditions: [],
    trustBoundaryCrossings: [],
    existingControls: [],
    counterevidence: [],
    confidence: 0.5,
    severityRationale: "severity",
    likelihoodRationale: "likelihood",
    assumptions: [],
    openQuestions: [],
    mitigation: "mitigation",
    relatedFindingIds: [],
    attackPathIds: [],
    ...overrides,
  };
}

describe("groupFindingsByRiskDomain", () => {
  it("keeps an empty bucket for domains with no findings", () => {
    const groups = groupFindingsByRiskDomain([
      sampleFinding({
        id: "data-1",
        stableKey: "data-1",
        riskDomains: [RISK_DOMAIN.DATA],
        owaspCategories: ["A02:2021"],
      }),
    ]);
    const dataGroup = groups.find((group) => group.domain === RISK_DOMAIN.DATA);
    const infraGroup = groups.find((group) => group.domain === RISK_DOMAIN.INFRASTRUCTURE);
    expect(dataGroup?.findings).toHaveLength(1);
    expect(infraGroup?.findings).toHaveLength(0);
  });

  it("counts framework tags once per finding", () => {
    const counts = countFrameworkTags([
      sampleFinding({
        strideCategories: ["spoofing"],
        owaspCategories: ["A01:2021", "A07:2021"],
        atlasTechniqueIds: ["AML.T0051"],
      }),
    ]);
    expect(counts).toEqual({ owasp: 1, atlas: 1, stride: 1 });
  });
});
