import { describe, expect, it } from "vitest";
import { GRAPH_NODE_KIND } from "@sentinel/schema";
import { graphToMermaid, sanitizeArchitectureMermaid } from "../mermaid-architecture.js";
import type { ArchitectureGraph } from "@sentinel/schema";

describe("graphToMermaid", () => {
  it("draws connected services and data stores", () => {
    const diagram = graphToMermaid(sampleGraph());
    expect(diagram.startsWith("flowchart TD")).toBe(true);
    expect(diagram).toContain("API");
    expect(diagram).toContain("Orders DB");
    expect(diagram).toContain("-->|calls|");
  });

  it("returns a placeholder when the graph is empty", () => {
    expect(graphToMermaid({ nodes: [], edges: [] })).toContain("No architecture nodes");
  });
});

describe("sanitizeArchitectureMermaid", () => {
  it("keeps a flowchart and strips a fence", () => {
    expect(sanitizeArchitectureMermaid("```mermaid\nflowchart TD\n  a-->b\n```")).toBe("flowchart TD\n  a-->b");
  });

  it("rejects prose that is not a diagram", () => {
    expect(sanitizeArchitectureMermaid("The app calls the database.")).toBeUndefined();
  });
});

function sampleGraph(): ArchitectureGraph {
  return {
    nodes: [
      node("api", GRAPH_NODE_KIND.API_ENTRY, "API"),
      node("db", GRAPH_NODE_KIND.DATA_STORE, "Orders DB"),
    ],
    edges: [
      {
        id: "e1",
        source: "api",
        target: "db",
        kind: "calls",
        bidirectional: false,
        provenance: { kind: "observed", confidence: 1, references: [] },
      },
    ],
  };
}

function node(id: string, kind: ArchitectureGraph["nodes"][number]["kind"], label: string): ArchitectureGraph["nodes"][number] {
  return {
    id,
    kind,
    label,
    provenance: { kind: "observed", confidence: 1, references: [] },
  };
}
