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

  it("groups source files into folders instead of one chip per file", () => {
    const diagram = graphToMermaid({
      nodes: [
        node("m1", GRAPH_NODE_KIND.MODULE, "backend/app/middleware/http_logging.py"),
        node("m2", GRAPH_NODE_KIND.MODULE, "backend/app/orchestration/agent_runner.py"),
        node("m3", GRAPH_NODE_KIND.MODULE, "backend/app/services/llm/prompts.py"),
      ],
      edges: [
        {
          id: "e1",
          source: "m3",
          target: "m1",
          kind: "imports",
          bidirectional: false,
          provenance: { kind: "observed", confidence: 1, references: [] },
        },
      ],
    });
    expect(diagram).toContain("backend/app/middleware");
    expect(diagram).toContain("backend/app/services/llm");
    expect(diagram).not.toContain("http_logging.py");
    expect(diagram).toContain("-->|imports|");
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
