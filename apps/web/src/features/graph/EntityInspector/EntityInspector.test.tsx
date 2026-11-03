/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { GRAPH_EDGE_KIND, RELATION_DIRECTION, type EntityInspection } from "../entityInspection";
import { ENTITY_INSPECTOR_COPY, EntityInspector } from "./EntityInspector";

describe("EntityInspector", () => {
  let root: Root | undefined;

  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = undefined;
    document.body.innerHTML = "";
  });

  function mount(inspection: EntityInspection | null): HTMLDivElement {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root?.render(<EntityInspector inspection={inspection} />);
    });
    return container;
  }

  it("asks for a hovered component when nothing is selected", () => {
    const container = mount(null);
    expect(container.querySelector("[data-testid='entity-inspector-empty']")?.textContent).toContain(
      ENTITY_INSPECTOR_COPY.EMPTY,
    );
  });

  it("shows functions, data flow, dependencies, and paths for the hovered component", () => {
    const container = mount(sampleInspection());
    expect(container.querySelector("[data-testid='entity-function-fn']")?.textContent).toContain("handleRequest");
    expect(container.querySelector("[data-testid='entity-function-fn']")?.textContent).toContain("src/api.ts:12");
    expect(container.querySelector("[data-testid='entity-inspector-data-flows']")?.textContent).toContain("runQuery");
    expect(container.querySelector("[data-testid='entity-inspector-dependencies']")?.textContent).toContain("Database");
    expect(container.querySelector("[data-testid='entity-path-0']")?.textContent).toContain("API");
    expect(container.querySelector("[data-testid='entity-inspector']")?.textContent).toContain(
      ENTITY_INSPECTOR_COPY.TRUNCATED,
    );
  });

  it("states when a component has no functions, flows, or paths", () => {
    const container = mount({
      ...sampleInspection(),
      functions: [],
      dataFlows: [],
      dependencies: [],
      dependents: [],
      paths: [],
      pathsTruncated: false,
    });
    const text = container.querySelector("[data-testid='entity-inspector']")?.textContent ?? "";
    expect(text).toContain(ENTITY_INSPECTOR_COPY.NONE_FUNCTIONS);
    expect(text).toContain(ENTITY_INSPECTOR_COPY.NONE_FLOWS);
    expect(text).toContain(ENTITY_INSPECTOR_COPY.NONE_DEPENDENCIES);
    expect(text).toContain(ENTITY_INSPECTOR_COPY.NONE_DEPENDENTS);
    expect(text).toContain(ENTITY_INSPECTOR_COPY.NONE_PATHS);
  });
});

function sampleInspection(): EntityInspection {
  return {
    nodeId: "api",
    label: "API",
    kind: "module",
    description: "HTTP module",
    functions: [{ id: "fn", label: "handleRequest", path: "src/api.ts", startLine: 12 }],
    dataFlows: [
      {
        edgeId: "flow",
        kind: GRAPH_EDGE_KIND.DATA_FLOW,
        label: "HTTP request input reaches SQL query sink",
        direction: RELATION_DIRECTION.OUTGOING,
        otherNodeId: "query",
        otherLabel: "runQuery",
        otherKind: "function",
      },
    ],
    dependencies: [
      {
        edgeId: "dep",
        kind: GRAPH_EDGE_KIND.DEPENDS_ON,
        label: "",
        direction: RELATION_DIRECTION.OUTGOING,
        otherNodeId: "db",
        otherLabel: "Database",
        otherKind: "module",
      },
    ],
    dependents: [],
    paths: [
      [
        { nodeId: "api", label: "API" },
        { nodeId: "db", label: "Database", viaKind: GRAPH_EDGE_KIND.DEPENDS_ON, edgeId: "dep" },
      ],
    ],
    pathsTruncated: true,
    relatedNodeIds: ["api"],
    relatedEdgeIds: ["dep"],
  };
}
