import { describe, expect, it } from "vitest";
import { AnalysisReportSchema, AnalystStateSchema, FindingSchema, sanitizeReportForExport } from "@sentinel/schema";
import { extractCallFlows, extractArchitecture } from "@sentinel/graph";
import { verifyAuditFindings } from "../audit-verifier.js";
import { reconcileFindingLifecycle } from "../pull-request-gate.js";
import { importSarif } from "../sarif-import.js";
import { recordAnalystChange } from "../analyst-state.js";

function report() {
  return AnalysisReportSchema.parse({
    schemaVersion:"1.0.0", id:"8f44d6e7-898c-480c-844c-13d23522f610", title:"Review",
    mode:"browser", repository:{sourceType:"github",commitSha:"a".repeat(40),analyzedAt:"2026-11-03T10:00:00.000Z"},
    executiveSummary:"Review",disclaimer:"Advisory",graph:{nodes:[],edges:[]},findings:[],
    coverage:{totalFilesIndexed:1,excludedFiles:0,truncated:false,languages:{},entries:[]},
    recommendations:[],budget:{},
  });
}
function finding() {
  return FindingSchema.parse({id:"test",stableKey:"candidate",title:"Candidate",category:"security",status:"code_supported_weakness",confidence:0.8,
    references:[{path:"handler.ts",startLine:1,endLine:1,excerpt:"eval(input)"}],affectedAssetSummary:"handler.ts",scenario:"Review",
    severityRationale:"Review",likelihoodRationale:"Review",mitigation:"Validate"});
}
function sarif(uri="handler.ts",line=1,success=true) {
  return JSON.stringify({version:"2.1.0",runs:[{tool:{driver:{name:"Test scanner",version:"1"}},invocations:[{executionSuccessful:success}],results:[{ruleId:"rule-1",message:{text:"Candidate"},locations:[{physicalLocation:{artifactLocation:{uri},region:{startLine:line}}}]}]}]});
}
describe("analyst evidence release gates",()=>{
  it("does not invent input flow to a constant sink or overwritten value",()=>{
    for(const code of [
      'function handler(req) {\n const ignored=req.query.value;\n eval("1+1");\n}',
      'function handler(req) {\n let value=req.body.value;\n value="constant";\n eval(value);\n}',
      'function handler(req) {\n const value=req.query.value;\n render("constant");\n}\nfunction render(input) {\n eval(input);\n}',
    ]) expect(extractCallFlows(new Map([["handler.ts",code]])).flows).toEqual([]);
  });
  it("keeps argument-supported candidates and marks them inferred",()=>{
    const result=extractCallFlows(new Map([["handler.ts",'function handler(req) {\n const value=req.body.value;\n render(value);\n}\nfunction render(input) {\n eval(input);\n}']]));
    expect(result.flows.length).toBeGreaterThan(0);
    expect(result.edges.every(edge=>edge.provenance.kind==="inferred")).toBe(true);
  });
  it("does not infer internet exposure from a Python route declaration",()=>{
    const graph=extractArchitecture({files:new Map([["api.py",'@app.get("/admin")\ndef admin():\n return "ok"']])});
    const boundaries=graph.edges.filter(e=>e.kind==="crosses_trust_boundary");
    expect(boundaries.length).toBeGreaterThan(0);
    expect(boundaries.every(e=>e.provenance.kind==="inferred")).toBe(true);
  });
  it("downgrades fabricated excerpts, invalid ranges and mismatched snapshots",()=>{
    const files=new Map([["handler.ts","const safe = 1;"]]);
    expect(verifyAuditFindings([finding()],files,{nodes:[],edges:[]})[0]?.status).toBe("insufficient_evidence");
    expect(verifyAuditFindings([{...finding(),references:[{path:"handler.ts",startLine:10}]}],files,{nodes:[],edges:[]})[0]?.status).toBe("insufficient_evidence");
    expect(verifyAuditFindings([{...finding(),references:[{path:"handler.ts",startLine:1,commitSha:"b".repeat(40)}]}],files,{nodes:[],edges:[]},"a".repeat(40))[0]?.status).toBe("insufficient_evidence");
  });
  it("never marks an absent candidate fixed without explicit verification",()=>{
    const memory={repositoryKey:"test",filesRead:[],filesPartial:[],filesUnread:[],openQuestions:[],priorFindingKeys:["old"],findingRecords:[{stableKey:"old",lifecycle:"open" as const}],pullRequestsReviewed:[],dispositions:[],updatedAt:"2026-11-03T10:00:00.000Z"};
    const result=reconcileFindingLifecycle({findings:[],priorMemory:memory});
    expect(result.fixedFindingKeys).toEqual([]);
    expect(result.records[0]?.lifecycle).toBe("open");
  });
  it("requires snapshot association and rejects traversal and absent evidence",()=>{
    expect(()=>importSarif(report(),sarif(),null,"wrong")).toThrow(/commit/);
    const unsafe=importSarif(report(),sarif("../private.txt"),new Map(),"a".repeat(40));
    expect(unsafe.findings).toEqual([]);
    expect(unsafe.analyst?.scannerRuns[0]?.skippedCount).toBe(1);
    const missing=importSarif(report(),sarif(),null,"a".repeat(40));
    expect(missing.findings[0]?.status).toBe("insufficient_evidence");
  });
  it("retains scanner failures, deduplicates imports and never confirms a claim",()=>{
    const files=new Map([["handler.ts","const value = 1;"]]);
    const imported=importSarif(report(),sarif("handler.ts",1,false),files,"a".repeat(40));
    expect(imported.analyst?.scannerRuns[0]?.status).toBe("failed");
    expect(imported.findings[0]?.disposition).toBeUndefined();
    const duplicate=importSarif(imported,sarif("handler.ts",1,false),files,"a".repeat(40));
    expect(duplicate.findings).toHaveLength(1);
    expect(duplicate.analyst?.scannerRuns).toHaveLength(1);
  });
  it("imports supported scanner trace locations as inferred graph edges",()=>{
    const value=JSON.parse(sarif());
    value.runs[0].results[0].codeFlows=[{threadFlows:[{locations:[{location:{physicalLocation:{artifactLocation:{uri:"handler.ts"},region:{startLine:1}}}},{location:{physicalLocation:{artifactLocation:{uri:"handler.ts"},region:{startLine:2}}}}]}]}];
    const imported=importSarif(report(),JSON.stringify(value),new Map([["handler.ts","const value=req.body.value;\neval(value);"]]),"a".repeat(40));
    expect(imported.findings[0]?.dataFlow?.steps).toHaveLength(2);
    expect(imported.graph.edges[0]?.provenance.kind).toBe("inferred");
  });
  it("rejects conflicting embedded scanner revision metadata",()=>{
    const value=JSON.parse(sarif());value.runs[0].versionControlProvenance=[{revisionId:"b".repeat(40)}];
    expect(()=>importSarif(report(),JSON.stringify(value),null,"a".repeat(40))).toThrow(/different commit/);
  });
  it("round trips old reports and analyst state without losing authorisation declarations",()=>{
    const old=report();expect(old.analyst).toBeUndefined();
    const state=AnalystStateSchema.parse({flows:{edge:{authorizationControl:"Tenant-scoped permission check",updatedAt:"2026-11-03T10:00:00.000Z"}}});
    const updated=recordAnalystChange(old,state,"model_declaration","edge","Reviewed");
    const restored=AnalysisReportSchema.parse(JSON.parse(JSON.stringify(sanitizeReportForExport(updated))));
    expect(restored.analyst?.flows.edge.authorizationControl).toContain("Tenant-scoped");
    expect(restored.analyst?.events).toHaveLength(1);
  });
});
