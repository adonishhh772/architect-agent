import { GRAPH_NODE_KIND, PROVENANCE_KIND, type ArchitectureGraph, type GraphEdge, type GraphNode } from "@sentinel/schema";
import { describe, expect, it } from "vitest";
import { FOCUS_ROLE, presentFocusedFlow } from "../diagramPresentation";
import {
  buildEntityInspection,
  formatFunctionLocation,
  formatInspectionPath,
  GRAPH_EDGE_KIND,
  resolveFocusNodeId,
  selectDiagramGraph,
} from "../entityInspection";

const PROVENANCE = {
  kind: PROVENANCE_KIND.OBSERVED,
  confidence: 1,
  rationale: "test",
  references: [],
};

describe("buildEntityInspection", () => {
  it("returns null when the component is not in the graph", () => {
    expect(buildEntityInspection({ nodes: [], edges: [] }, "missing")).toBeNull();
  });

  it("lists functions, data flows, and the full dependency path for one component", () => {
    const graph = sampleFlowGraph();
    const inspection = buildEntityInspection(graph, "api");
    expect(inspection).not.toBeNull();
    expect(inspection?.functions.map((item) => item.label)).toEqual(["handleRequest"]);
    expect(formatFunctionLocation(inspection?.functions[0] ?? { id: "fn", label: "handleRequest" })).toBe(
      "src/api.ts:12",
    );
    expect(inspection?.dataFlows.map((flow) => flow.otherLabel)).toContain("runQuery");
    expect(inspection?.dependencies.map((item) => item.otherLabel)).toContain("src/db.ts");
    expect(inspection?.paths.map(formatInspectionPath).join(" | ")).toContain("handleRequest");
    expect(inspection?.paths.map(formatInspectionPath).join(" | ")).toContain("runQuery");
    expect(inspection?.relatedNodeIds).toEqual(expect.arrayContaining(["api", "fn-handle", "fn-query", "db"]));
  });

  it("joins the path through a middle component", () => {
    const graph = chainGraph();
    const inspection = buildEntityInspection(graph, "middle");
    const rendered = inspection?.paths.map(formatInspectionPath) ?? [];
    expect(rendered.some((path) => path.includes("Entry") && path.includes("Middle") && path.includes("Store"))).toBe(
      true,
    );
  });

  it("does not loop forever on a cycle", () => {
    const graph: ArchitectureGraph = {
      nodes: [node("a", GRAPH_NODE_KIND.MODULE, "A"), node("b", GRAPH_NODE_KIND.MODULE, "B")],
      edges: [edge("a-b", "a", "b", GRAPH_EDGE_KIND.CALLS), edge("b-a", "b", "a", GRAPH_EDGE_KIND.CALLS)],
    };
    const inspection = buildEntityInspection(graph, "a");
    expect(inspection).not.toBeNull();
    for (const path of inspection?.paths ?? []) {
      const ids = path.map((step) => step.nodeId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("marks a path as truncated when it is deeper than the walk limit", () => {
    const nodes = Array.from({ length: 9 }, (_, index) => node(`n${index}`, GRAPH_NODE_KIND.MODULE, `Node ${index}`));
    const edges = nodes.slice(0, -1).map((item, index) =>
      edge(`e${index}`, item.id, `n${index + 1}`, GRAPH_EDGE_KIND.DEPENDS_ON),
    );
    const inspection = buildEntityInspection({ nodes, edges }, "n0");
    expect(inspection?.pathsTruncated).toBe(true);
    const longest = Math.max(...(inspection?.paths.map((path) => path.length) ?? [0]));
    expect(longest).toBeLessThanOrEqual(7);
  });

  it("links a function to the API entry declared in the same file", () => {
    const graph: ArchitectureGraph = {
      nodes: [
        node("route", GRAPH_NODE_KIND.API_ENTRY, "GET /orders", { file: "src/orders.ts" }),
        node("fn", GRAPH_NODE_KIND.FUNCTION, "createOrder", { path: "src/orders.ts", startLine: 8 }),
      ],
      edges: [],
    };
    expect(buildEntityInspection(graph, "route")?.functions.map((item) => item.label)).toEqual(["createOrder"]);
  });

  it("keeps hover on the parent component when the pointer moves onto its function", () => {
    const graph = sampleFlowGraph();
    expect(resolveFocusNodeId(graph, "fn-handle")).toBe("api");
    expect(resolveFocusNodeId(graph, "api")).toBe("api");
    expect(resolveFocusNodeId(graph, "missing")).toBe("missing");
  });

  it("includes functions that live under a folder component", () => {
    const graph: ArchitectureGraph = {
      nodes: [
        node("folder", GRAPH_NODE_KIND.SERVICE, "src/api", { folderPath: "src/api" }),
        node("fn", GRAPH_NODE_KIND.FUNCTION, "parse", { path: "src/api/handler.ts", startLine: 4 }),
      ],
      edges: [],
    };
    const inspection = buildEntityInspection(graph, "folder");
    expect(inspection?.functions.map((item) => item.label)).toEqual(["parse"]);
  });

  it("reports empty relations for an isolated component", () => {
    const graph: ArchitectureGraph = {
      nodes: [node("alone", GRAPH_NODE_KIND.MODULE, "src/alone.ts")],
      edges: [],
    };
    const inspection = buildEntityInspection(graph, "alone");
    expect(inspection?.functions).toEqual([]);
    expect(inspection?.dataFlows).toEqual([]);
    expect(inspection?.dependencies).toEqual([]);
    expect(inspection?.dependents).toEqual([]);
    expect(inspection?.paths).toEqual([]);
    expect(inspection?.pathsTruncated).toBe(false);
  });
});

describe("selectDiagramGraph", () => {
  it("lifts a cross-module data flow onto the components and hides same-module function edges", () => {
    const diagram = selectDiagramGraph(sampleFlowGraph());
    expect(diagram.nodes.map((item) => item.id)).not.toContain("fn-handle");
    expect(diagram.edges.some((item) => item.kind === GRAPH_EDGE_KIND.DATA_FLOW && item.source === "api" && item.target === "db")).toBe(
      true,
    );
    expect(diagram.edges.some((item) => item.source === item.target)).toBe(false);
  });

  it("drops an isolated module when other modules are connected", () => {
    const diagram = selectDiagramGraph({
      nodes: [
        node("a", GRAPH_NODE_KIND.MODULE, "src/a.ts"),
        node("b", GRAPH_NODE_KIND.MODULE, "src/b.ts"),
        node("c", GRAPH_NODE_KIND.MODULE, "src/c.ts"),
      ],
      edges: [edge("ab", "a", "b", GRAPH_EDGE_KIND.DEPENDS_ON)],
    });
    expect(diagram.nodes.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("keeps the highest-degree components when the cap is reached", () => {
    const diagram = selectDiagramGraph(
      {
        nodes: [
          node("low", GRAPH_NODE_KIND.SERVICE, "Low"),
          node("high", GRAPH_NODE_KIND.SERVICE, "High"),
        ],
        edges: [edge("e", "high", "high-missing", GRAPH_EDGE_KIND.CALLS)],
      },
      1,
    );
    expect(diagram.nodes.map((item) => item.id)).toEqual(["high"]);
  });
});

describe("presentFocusedFlow", () => {
  it("places a hidden function beside the hovered component and dims the rest", () => {
    const graph = sampleFlowGraph();
    const inspection = buildEntityInspection(graph, "api");
    const presentation = presentFocusedFlow({
      nodes: [
        { id: "api", position: { x: 10, y: 20 }, data: { label: "API", kind: GRAPH_NODE_KIND.MODULE } },
        { id: "other", position: { x: 0, y: 0 }, data: { label: "Other", kind: GRAPH_NODE_KIND.MODULE } },
      ],
      edges: [],
      graph,
      inspection,
    });
    const fn = presentation.nodes.find((item) => item.id === "fn-handle");
    expect(fn?.position.x).toBeGreaterThan(10);
    expect(fn?.focusRole).toBe(FOCUS_ROLE.RELATED);
    expect(presentation.nodes.find((item) => item.id === "api")?.focusRole).toBe(FOCUS_ROLE.FOCUS);
    expect(presentation.nodes.find((item) => item.id === "other")?.opacity).toBeLessThan(1);
    expect(presentation.edges.some((item) => item.kind === GRAPH_EDGE_KIND.DATA_FLOW && item.animated)).toBe(true);
  });

  it("leaves every component idle when nothing is hovered", () => {
    const presentation = presentFocusedFlow({
      nodes: [{ id: "api", position: { x: 0, y: 0 }, data: { label: "API", kind: GRAPH_NODE_KIND.MODULE } }],
      edges: [{ id: "e", source: "api", target: "missing", label: "loop", kind: GRAPH_EDGE_KIND.CALLS }],
      graph: { nodes: [], edges: [] },
      inspection: null,
    });
    expect(presentation.nodes[0]?.focusRole).toBe(FOCUS_ROLE.IDLE);
    expect(presentation.edges).toEqual([]);
  });
});

function sampleFlowGraph(): ArchitectureGraph {
  return {
    nodes: [
      node("api", GRAPH_NODE_KIND.MODULE, "src/api.ts"),
      node("db", GRAPH_NODE_KIND.MODULE, "src/db.ts"),
      node("fn-handle", GRAPH_NODE_KIND.FUNCTION, "handleRequest", { path: "src/api.ts", startLine: 12 }, "api"),
      node("fn-query", GRAPH_NODE_KIND.FUNCTION, "runQuery", { path: "src/db.ts", startLine: 4 }, "db"),
    ],
    edges: [
      edge("dep", "api", "db", GRAPH_EDGE_KIND.DEPENDS_ON),
      edge("flow", "fn-handle", "fn-query", GRAPH_EDGE_KIND.DATA_FLOW, "HTTP request input reaches SQL query sink"),
    ],
  };
}

function chainGraph(): ArchitectureGraph {
  return {
    nodes: [
      node("entry", GRAPH_NODE_KIND.API_ENTRY, "Entry"),
      node("middle", GRAPH_NODE_KIND.MODULE, "Middle"),
      node("store", GRAPH_NODE_KIND.DATA_STORE, "Store"),
    ],
    edges: [
      edge("in", "entry", "middle", GRAPH_EDGE_KIND.CALLS),
      edge("out", "middle", "store", GRAPH_EDGE_KIND.STORES_IN),
    ],
  };
}

function node(
  id: string,
  kind: GraphNode["kind"],
  label: string,
  metadata?: Record<string, unknown>,
  parentId?: string,
): GraphNode {
  return {
    id,
    kind,
    label,
    parentId,
    metadata,
    provenance: PROVENANCE,
  };
}

function edge(id: string, source: string, target: string, kind: GraphEdge["kind"], label?: string): GraphEdge {
  return {
    id,
    source,
    target,
    kind,
    label,
    bidirectional: false,
    provenance: PROVENANCE,
  };
}
