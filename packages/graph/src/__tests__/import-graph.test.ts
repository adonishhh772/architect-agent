import { describe, expect, it } from "vitest";
import {
  buildFolderOverviewGraph,
  extractImportEdges,
  sliceModuleGraphPage,
} from "../import-graph.js";
import { GRAPH_NODE_KIND } from "@sentinel/schema";

describe("extractImportEdges", () => {
  it("links modules via relative imports", () => {
    const files = new Map<string, string>([
      ["src/a.ts", "import { b } from './b';"],
      ["src/b.ts", "export const b = 1;"],
    ]);
    const edges = extractImportEdges({
      files,
      moduleNodeId: (path) => `module:${path}`,
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]?.source).toBe("module:src/a.ts");
    expect(edges[0]?.target).toBe("module:src/b.ts");
  });
});

describe("buildFolderOverviewGraph", () => {
  it("aggregates modules into folder service nodes", () => {
    const nodes = [
      {
        id: "m1",
        kind: GRAPH_NODE_KIND.MODULE,
        label: "apps/web/src/a.ts",
        provenance: { kind: "observed", confidence: 1, rationale: "", references: [] },
      },
      {
        id: "m2",
        kind: GRAPH_NODE_KIND.MODULE,
        label: "apps/web/src/b.ts",
        provenance: { kind: "observed", confidence: 1, rationale: "", references: [] },
      },
    ];
    const edges = [
      {
        id: "e1",
        source: "m1",
        target: "m2",
        kind: "depends_on" as const,
        bidirectional: false,
        provenance: { kind: "observed", confidence: 1, rationale: "", references: [] },
      },
    ];
    const overview = buildFolderOverviewGraph(nodes, edges, { depth: 3 });
    expect(overview.nodes.some((node) => node.kind === GRAPH_NODE_KIND.SERVICE)).toBe(true);
    expect(overview.nodes.filter((node) => node.kind === GRAPH_NODE_KIND.MODULE)).toHaveLength(0);
  });
});

describe("sliceModuleGraphPage", () => {
  it("pages modules within a folder prefix", () => {
    const nodes = Array.from({ length: 30 }, (_, index) => ({
      id: `m${index}`,
      kind: GRAPH_NODE_KIND.MODULE,
      label: `pkg/mod/file${index}.ts`,
      provenance: { kind: "observed" as const, confidence: 1, rationale: "", references: [] },
    }));
    const sliced = sliceModuleGraphPage(nodes, [], "pkg/mod", 0, 24);
    expect(sliced.nodes.filter((node) => node.kind === GRAPH_NODE_KIND.MODULE)).toHaveLength(24);
    expect(sliced.pageCount).toBe(2);
  });
});
