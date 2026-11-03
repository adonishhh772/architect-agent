import { describe, expect, it } from "vitest";
import { AnalystStateSchema, type ArchitectureGraph } from "@sentinel/schema";
import { buildDataFlowModel, dataFlowMermaid } from "../data-flow-model.js";
const provenance={kind:"inferred" as const,confidence:0.5,references:[]};
const graph:ArchitectureGraph={
 nodes:[{id:"a",kind:"service",label:"API",provenance},{id:"db",kind:"data_store",label:"Database",provenance},{id:"dep:lib",kind:"external_system",label:"A declared package",provenance}],
 edges:[{id:"read",source:"a",target:"db",kind:"data_flow",label:"Read candidate",bidirectional:false,provenance},{id:"import",source:"a",target:"dep:lib",kind:"depends_on",bidirectional:false,provenance}],
};
describe("canonical data-flow model",()=>{
 it("separates imports from data movement and excludes unused package dependencies",()=>{
  const model=buildDataFlowModel(graph,AnalystStateSchema.parse({}),false);
  expect(model.edges.map(e=>e.id)).toEqual(["read"]);
  expect(model.nodes.some(n=>n.id==="dep:lib")).toBe(false);
 });
 it("preserves extractor evidence and exports analyst boundary declarations",()=>{
  const state=AnalystStateSchema.parse({zones:{a:"Application",db:"Restricted data"},flows:{read:{label:"Reviewed query",dataClass:"restricted",updatedAt:"2026-11-03T10:00:00.000Z"}}});
  const model=buildDataFlowModel(graph,state,false),mermaid=dataFlowMermaid(model,state);
  expect(graph.edges[0].label).toBe("Read candidate");
  expect(model.edges[0].label).toBe("Reviewed query");
  expect(model.edges[0].provenance.kind).toBe("inferred");
  expect(mermaid).toContain("Restricted data");
  expect(mermaid).toContain("-.->");
 });
});
