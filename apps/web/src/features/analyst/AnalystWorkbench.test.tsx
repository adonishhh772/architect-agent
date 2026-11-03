// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalysisReportSchema, FindingSchema, type AnalysisReport } from "@sentinel/schema";
import { AnalystWorkbench } from "./AnalystWorkbench";
vi.mock("./DataFlowWorkbench",()=>({DataFlowWorkbench:()=>null}));

let root: Root | undefined;
let host: HTMLDivElement;
let updated: AnalysisReport;
function seed(): AnalysisReport {
  return AnalysisReportSchema.parse({
    schemaVersion:"1.0.0", id:"8f44d6e7-898c-480c-844c-13d23522f610",title:"Test review",mode:"browser",
    repository:{sourceType:"github",name:"Example",commitSha:"a".repeat(40),analyzedAt:"2026-11-03T10:00:00.000Z"},
    executiveSummary:"Review",disclaimer:"Advisory",graph:{nodes:[],edges:[]},
    findings:[FindingSchema.parse({id:"candidate-1",stableKey:"candidate-1",title:"Candidate weakness",category:"security",status:"plausible_threat_requiring_verification",confidence:0.5,affectedAssetSummary:"handler.ts",scenario:"Review candidate",mitigation:"Validate controls",severityRationale:"Unverified",likelihoodRationale:"Unverified",references:[{path:"handler.ts",startLine:1}]})],
    coverage:{totalFilesIndexed:1,excludedFiles:0,truncated:false,languages:{},entries:[]},recommendations:[],budget:{},
  });
}
function mount(section:string):void {
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  host=document.createElement("div");document.body.append(host);root=createRoot(host);updated=seed();
  function Harness() {
    const [report,setReport]=useState(updated),[active,setActive]=useState(section);
    return <AnalystWorkbench report={report} items={[{id:"findings",title:"Findings",content:null}]} contents={new Map([["handler.ts","const value = 1;"]])} openSectionId={active} onOpenSectionChange={setActive} selectedFinding={active==="findings"?report.findings[0]:undefined} onSelectFinding={()=>setActive("findings")} onUpdate={next=>{updated=next;setReport(next);}}/>;
  }
  act(()=>root!.render(<Harness/>));
}
function field(label:string):HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement {
  const match=[...host.querySelectorAll("label")].find(element=>element.textContent?.startsWith(label));
  if(!match)throw new Error("Missing field "+label);
  return match.querySelector("input,textarea,select")!;
}
function change(element:HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement,value:string) {
  const proto=element.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:element.tagName==="SELECT"?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  act(()=>{Object.getOwnPropertyDescriptor(proto,"value")!.set!.call(element,value);element.dispatchEvent(new Event(element.tagName==="SELECT"?"change":"input",{bubbles:true}));});
}
function click(label:string) {const button=[...host.querySelectorAll("button")].find(element=>element.textContent===label);if(!button)throw new Error(label);act(()=>button.click());}
afterEach(()=>{if(root)act(()=>root!.unmount());host?.remove();});
describe("analyst review workflows",()=>{
  it("does not mark controls met just because no finding exists",()=>{
    mount("controls");
    expect(field("Assessment").value).toBe("not_assessed");
    change(field("Assessment"),"met");click("Save assessment");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("reviewer");
    expect(updated.analyst).toBeUndefined();
  });
  it("records reviewer-backed control decisions in the exportable report",()=>{
    mount("controls");
    change(field("Assessment"),"gap");
    change(field("Reviewer"),"Security analyst");
    change(field("Evidence or applicability rationale"),"Identity configuration reviewed; session expiry policy is missing.");
    click("Save assessment");
    expect(updated.analyst?.controls.identity.status).toBe("gap");
    expect(updated.analyst?.controls.identity.reviewer).toBe("Security analyst");
    expect(updated.analyst?.events[0]?.action).toBe("control_review");
  });
  it("requires a reason to accept risk and requires evidence for verification",()=>{
    mount("findings");
    change(field("Decision"),"accepted_risk");click("Save analyst decision");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("rationale");
    change(field("Decision rationale / notes"),"Owner accepts residual risk for the isolated test environment.");
    change(field("Verification result"),"test_passed");click("Save analyst decision");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("snapshot");
    change(field("Tested commit or snapshot"),"a".repeat(40));
    change(field("Verification evidence"),"Targeted authorisation regression passed; test run 42.");
    click("Save analyst decision");
    expect(updated.analyst?.reviews["candidate-1"].verification).toBe("test_passed");
    expect(updated.findings[0].disposition).toBe("accepted_risk");
  });
});
