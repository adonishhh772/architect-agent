import { describe, expect, it } from "vitest";
import { extractCallFlows } from "../call-flow.js";

describe("extractCallFlows", () => {
  it("links request input to a sink in the same function", () => {
    const files = new Map<string, string>([
      [
        "src/handler.ts",
        "function handleRequest(req) {\n  const id = req.body.id;\n  eval(id);\n}\n",
      ],
    ]);
    const extraction = extractCallFlows(files);
    expect(extraction.flows.length).toBeGreaterThan(0);
    expect(extraction.flows[0]?.steps.map((step) => step.role)).toEqual(["source", "sink"]);
    expect(extraction.nodes.some((node) => node.kind === "function" && node.label === "handleRequest")).toBe(true);
    expect(extraction.edges.some((edge) => edge.kind === "data_flow")).toBe(true);
  });

  it("links a caller that has request input to a callee sink", () => {
    const files = new Map<string, string>([
      [
        "src/caller.ts",
        "function receive(req) {\n  const name = req.query.name;\n  render(name);\n}\nfunction render(name) {\n  document.body.innerHTML = name;\n}\n",
      ],
    ]);
    const extraction = extractCallFlows(files);
    const crossFile = extraction.flows.find((flow) => flow.steps.some((step) => step.role === "call"));
    expect(crossFile?.summary).toContain("receive");
    expect(crossFile?.summary).toContain("render");
    expect(extraction.edges.some((edge) => edge.kind === "calls")).toBe(true);
  });
});
