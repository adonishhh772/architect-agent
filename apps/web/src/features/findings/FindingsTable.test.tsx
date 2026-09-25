/**
 * @vitest-environment happy-dom
 */
import { FINDING_STATUS, type Finding } from "@sentinel/schema";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { FindingsBoard } from "./FindingsTable";

const FIRST_TITLE = "HTTP route has no authentication check nearby";
const SECOND_TITLE = "Database role is broader than the route needs";

describe("findings table selection", () => {
  let root: Root | undefined;
  let scrolledElementId = "";

  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = undefined;
    document.body.innerHTML = "";
    scrolledElementId = "";
  });

  it("scrolls the finding summary into view when a table row is clicked", async () => {
    HTMLElement.prototype.scrollIntoView = function recordScroll(): void {
      scrolledElementId = this.id;
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<FindingsPreview findings={sampleFindings()} />);
    });

    const scrollRegion = container.querySelector("[data-testid='findings-table-scroll']");
    expect(scrollRegion?.className).toContain("overflow-auto");
    expect(scrollRegion?.className).toContain("max-h-[32rem]");
    expect(container.querySelector("[data-testid='finding-details-empty']")).toBeNull();
    expect(container.querySelector("[data-testid='finding-details']")).toBeNull();

    const secondRow = container.querySelectorAll("tbody tr")[1];
    if (!(secondRow instanceof HTMLElement)) {
      throw new Error("Missing findings row");
    }
    await act(async () => {
      secondRow.click();
    });

    expect(container.querySelector("[data-testid='finding-details']")?.textContent).toContain(SECOND_TITLE);
    expect(scrolledElementId).toBe("finding-summary");
  });
});

function FindingsPreview({ findings }: { findings: Finding[] }): JSX.Element {
  const [selectedFindingId, setSelectedFindingId] = useState<string | undefined>();
  const selectedFinding = findings.find((finding) => finding.id === selectedFindingId);

  function handleSelectFinding(findingId: string): void {
    setSelectedFindingId(findingId);
  }

  return (
    <div>
      <FindingsBoard
        findings={findings}
        selectedFinding={selectedFinding}
        onSelectFinding={handleSelectFinding}
      />
    </div>
  );
}

function sampleFindings(): Finding[] {
  return [sampleFinding("finding-1", FIRST_TITLE), sampleFinding("finding-2", SECOND_TITLE)];
}

function sampleFinding(id: string, title: string): Finding {
  return {
    id,
    stableKey: id,
    title,
    category: "security",
    strideCategories: [],
    status: FINDING_STATUS.CODE_SUPPORTED,
    affectedNodeIds: [],
    affectedAssetSummary: "src/app.ts",
    references: [{ path: "src/app.ts", startLine: 12 }],
    evidence: [],
    scenario: "A route accepts the request.",
    preconditions: [],
    trustBoundaryCrossings: [],
    existingControls: [],
    counterevidence: [],
    confidence: 0.7,
    severityRationale: "severity",
    likelihoodRationale: "likelihood",
    assumptions: [],
    openQuestions: [],
    mitigation: "Require an authentication check.",
    relatedFindingIds: [],
    attackPathIds: [],
  };
}
