import { describe, expect, it } from "vitest";
import { parseArchitectureFlow, quoteMermaidEdgeLabels } from "./architectureFlow";

const FOLDER_CHART = `flowchart TD
  f0["frontend"]
  f4["backend/app"]
  f4 -->|imports| f0`;

describe("parseArchitectureFlow", () => {
  it("reads folder nodes and import links from a flowchart", () => {
    const model = parseArchitectureFlow(FOLDER_CHART);
    expect(model?.nodes.map((node) => node.label)).toEqual(["frontend", "backend/app"]);
    expect(model?.edges).toEqual([{ sourceId: "f4", targetId: "f0", label: "imports" }]);
  });

  it("quotes edge labels so the diagram renderer accepts them", () => {
    expect(quoteMermaidEdgeLabels("f4 -->|imports| f0")).toBe('f4 -->|"imports"| f0');
  });
});
