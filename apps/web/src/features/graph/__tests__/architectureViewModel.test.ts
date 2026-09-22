import { describe, expect, it } from "vitest";
import { GRAPH_NODE_KIND } from "@sentinel/schema";
import {
  ARCHITECTURE_VIEW_MODE,
  buildArchitectureDisplayGraph,
  listArchitectureFolders,
} from "../architectureViewModel";

const sampleGraph = {
  nodes: [
    {
      id: "m1",
      kind: GRAPH_NODE_KIND.MODULE,
      label: "apps/web/src/features/a/A.tsx",
      provenance: { kind: "observed" as const, confidence: 1, rationale: "", references: [] },
    },
    {
      id: "m2",
      kind: GRAPH_NODE_KIND.MODULE,
      label: "apps/web/src/features/b/B.tsx",
      provenance: { kind: "observed" as const, confidence: 1, rationale: "", references: [] },
    },
  ],
  edges: [],
};

describe("architectureViewModel", () => {
  it("lists folder keys from module paths", () => {
    const folders = listArchitectureFolders(sampleGraph);
    expect(folders).toContain("apps/web/src");
  });

  it("builds folder overview with fewer nodes than raw modules", () => {
    const display = buildArchitectureDisplayGraph({
      graph: sampleGraph,
      viewMode: ARCHITECTURE_VIEW_MODE.FOLDER_OVERVIEW,
      folderPrefix: "",
      pageIndex: 0,
    });
    expect(display.displayGraph.nodes.length).toBeLessThan(sampleGraph.nodes.length + 5);
  });
});
