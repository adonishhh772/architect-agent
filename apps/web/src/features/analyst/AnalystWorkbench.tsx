import { useEffect, useMemo, useState, type ReactNode } from "react";
import { analystState, CONTROL_CATALOG, importSarif, recordAnalystChange } from "@sentinel/analysis";
import { ControlAssessmentSchema, ReviewStateSchema, type AnalysisReport, type Finding, type ReviewState } from "@sentinel/schema";
import type { ReportAccordionItem } from "../../components/layout/ReportAccordion";
import { REPORT_SECTION } from "../../components/layout/ReportAccordion";
import { DataFlowWorkbench } from "./DataFlowWorkbench";

interface Props {
  report: AnalysisReport; items: ReportAccordionItem[]; contents: Map<string,string> | null;
  openSectionId: string; onOpenSectionChange: (id:string)=>void;
  selectedFinding: Finding | undefined; onSelectFinding: (id:string)=>void;
  onUpdate: (report:AnalysisReport)=>void;
}
const NAV = [
  [REPORT_SECTION.SUMMARY, "Overview"], [REPORT_SECTION.MAP, "Data flows"], ["component-map", "Code architecture"],
  [REPORT_SECTION.FINDINGS, "Threat queue"], [REPORT_SECTION.STRIDE, "STRIDE"], [REPORT_SECTION.FRAMEWORK, "AI & frameworks"],
  ["controls", "Controls"], ["scanner-import", "Scanner results"], [REPORT_SECTION.RECOMMENDATIONS, "Remediation"],
  [REPORT_SECTION.COPILOT, "Copilot"], ["evidence", "Evidence"], [REPORT_SECTION.COVERAGE, "Reports & coverage"], ["review-log", "Review log"],
];
export function AnalystWorkbench({report,items,contents,openSectionId,onOpenSectionChange,selectedFinding,onSelectFinding,onUpdate}:Props):JSX.Element {
  const state=useMemo(()=>analystState(report),[report]);
  const [query,setQuery]=useState("");
  const [category,setCategory]=useState("");
  const [onlyUnreviewed,setOnlyUnreviewed]=useState(false);
  const findings=report.findings.filter(f=>!f.duplicateOfStableKey && (!query || [f.title,f.scenario,...f.references.map(r=>r.path)].join(" ").toLowerCase().includes(query.toLowerCase())) && (!category || f.strideCategories.includes(category as Finding["strideCategories"][number])) && (!onlyUnreviewed || (state.reviews[f.stableKey]?.decision ?? f.disposition ?? "unreviewed")==="unreviewed"));
  const partial=report.budget.partialCompletion||report.coverage.truncated||report.agentTrace.some(a=>a.status==="failed");
  const [scannerError,setScannerError]=useState("");
  const [commit,setCommit]=useState("");
  let content:ReactNode;
  const item=items.find(i=>i.id===openSectionId);
  if(openSectionId===REPORT_SECTION.MAP) content=<DataFlowWorkbench report={report} contents={contents} onUpdate={onUpdate} onSelectFinding={onSelectFinding}/>;
  else if(openSectionId==="component-map") content=items.find(i=>i.id===REPORT_SECTION.MAP)?.content;
  else if(openSectionId==="controls") content=<ControlReview report={report} onUpdate={onUpdate}/>;
  else if(openSectionId==="scanner-import") content=<div className="analyst-panel"><span className="analyst-kicker">Independent scanner evidence</span><h2>Import SARIF results</h2><p>Import results from your local or CI scanner. Claims are checked against loaded source when available. A scanner result never automatically confirms a vulnerability.</p><label className="analyst-field">Exact commit analysed by the scanner<input value={commit} maxLength={64} placeholder={report.repository.commitSha||"Unpinned ZIP snapshot"} onChange={e=>setCommit(e.target.value)}/></label><label className="analyst-field">SARIF 2.1.0 file (maximum 8 MB)<input type="file" accept=".sarif,.json,application/json" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{setScannerError("");if(file.size>8*1024*1024)throw new Error("File exceeds 8 MB.");onUpdate(importSarif(report,await file.text(),contents,commit.trim()));}catch(error){setScannerError(error instanceof Error?error.message:"Import failed.");}finally{e.target.value="";}}}/></label>{scannerError&&<p role="alert">{scannerError}</p>}<p className="analyst-hint">Run scanners in your own controlled environment. This static website does not execute them. Use the repository's local runner to collect redacted Gitleaks or local-rule Semgrep results. Snapshot association is declared by you; the importer cannot prove where a supplied file was generated.</p>{state.scannerRuns.length===0?<p>No scanner results imported.</p>:<div className="analyst-table-wrap"><table><thead><tr><th>Tool</th><th>Snapshot</th><th>Results</th><th>Coverage</th></tr></thead><tbody>{state.scannerRuns.map(run=><tr key={run.id}><td>{run.tool} {run.version}</td><td><code>{run.commit.slice(0,12)||"Unpinned"}</code></td><td>{run.resultCount} imported · {run.skippedCount} skipped</td><td>{run.status==="failed"?"Incomplete invocation":run.status==="partial"?"Partial snapshot":"Imported claims"}<small>{run.fileCount!==undefined?`${run.fileCount} scanned · ${run.omittedFiles??0} omitted. `:""}{run.detail}</small></td></tr>)}</tbody></table></div>}</div>;
  else if(openSectionId==="review-log") content=<div className="analyst-panel"><h2>Analyst review log</h2><p>Local report history, not an independently signed audit trail.</p>{[...state.events].reverse().map((event,i)=><div className="review-event" key={i}><time>{new Date(event.at).toLocaleString()}</time><strong>{event.action.replaceAll("_"," ")}</strong><code>{event.target}</code><p>{event.detail}</p></div>)}{state.events.length===0&&<p>No review actions recorded yet.</p>}</div>;
  else if(openSectionId==="evidence") content=<div className="analyst-panel"><h2>Evidence register</h2><p>Select a threat to inspect its source, assumptions and counterevidence.</p>{findings.map(f=><button key={f.id} className="evidence-row" onClick={()=>onSelectFinding(f.id)}><strong>{f.title}</strong><span>{f.status.replaceAll("_"," ")}</span><code>{f.references.map(r=>r.path+(r.startLine?":"+r.startLine:"")).join(" · ")||"No source reference"}</code></button>)}</div>;
  else if(openSectionId===REPORT_SECTION.FINDINGS) content=<div className="analyst-panel"><h2>Threat review queue</h2><p>{findings.length} matching candidates · severity and evidence strength are separate.</p>{findings.map(f=><button key={f.id} className={"threat-row "+(selectedFinding?.id===f.id?"selected":"")} onClick={()=>onSelectFinding(f.id)}><span className="threat-priority">{f.riskScore??"—"}</span><span><strong>{f.title}</strong><small>{f.references[0]?.path||f.affectedAssetSummary}</small><span className="evidence-badge">{f.status.replaceAll("_"," ")}</span></span><span>{state.reviews[f.stableKey]?.decision.replaceAll("_"," ")||f.disposition?.replaceAll("_"," ")||"unreviewed"}</span></button>)}{findings.length===0&&<p>No matching findings. This does not establish that the system is secure.</p>}</div>;
  else content=item?.content??<p className="analyst-panel">This view is unavailable for the current report.</p>;
  return <section className="analyst-workbench" data-testid="analyst-workbench">
    <header className="analyst-report-head"><div><span className="analyst-kicker">Repository threat review</span><h2>{report.repository.owner ? report.repository.owner+"/":""}{report.repository.name||report.title}</h2><code>{report.repository.commitSha||"Unpinned snapshot"}</code></div><div className={"coverage-badge "+(partial?"partial":"")}>{partial?"Partial analysis":"Review coverage"}<small>{report.coverage.totalFilesIndexed} files indexed · {report.findings.length} candidates</small></div></header>
    <div className="analyst-shell"><nav aria-label="Report views" className="analyst-rail">{NAV.filter(([id])=>["component-map","controls","scanner-import","review-log","evidence"].includes(id)||items.some(i=>i.id===id)).map(([id,label])=><button key={id} aria-current={openSectionId===id?"page":undefined} onClick={()=>onOpenSectionChange(id)}>{label}</button>)}<div className="analyst-scope"><label className="analyst-field">Search threats<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Title, source, scenario…"/></label><label className="analyst-field">STRIDE category<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">All categories</option>{["spoofing","tampering","repudiation","information_disclosure","denial_of_service","elevation_of_privilege"].map(x=><option key={x} value={x}>{x.replaceAll("_"," ")}</option>)}</select></label><label><input type="checkbox" checked={onlyUnreviewed} onChange={e=>setOnlyUnreviewed(e.target.checked)}/> Unreviewed only</label><p className="analyst-hint">Analysis never certifies security. Review the coverage and supporting evidence.</p></div></nav>
    <div className="analyst-content"><div className="analyst-content-title"><span className="analyst-kicker">{NAV.find(([id])=>id===openSectionId)?.[1]||"Review"}</span><span>{report.mode.replaceAll("_"," ")} · {new Date(report.repository.analyzedAt).toLocaleDateString()}</span></div>{content}</div>
    {selectedFinding&&openSectionId!==REPORT_SECTION.MAP&&<ReviewInspector key={selectedFinding.id} report={report} finding={selectedFinding} contents={contents} onUpdate={onUpdate}/>}
    </div>
  </section>;
}

function ReviewInspector({report,finding,contents,onUpdate}:{report:AnalysisReport;finding:Finding;contents:Map<string,string>|null;onUpdate:(r:AnalysisReport)=>void}):JSX.Element {
  const state=useMemo(()=>analystState(report),[report]);
  const [review,setReview]=useState<ReviewState>(()=>ReviewStateSchema.parse({...state.reviews[finding.stableKey], decision:state.reviews[finding.stableKey]?.decision??finding.disposition??"unreviewed",updatedAt:new Date().toISOString()}));
  const [error,setError]=useState("");
  useEffect(()=>{setReview(ReviewStateSchema.parse({...state.reviews[finding.stableKey],decision:state.reviews[finding.stableKey]?.decision??finding.disposition??"unreviewed",updatedAt:new Date().toISOString()}));},[finding.stableKey,state.reviews,finding.disposition]);
  function save():void {
    if(["accepted_risk","false_positive"].includes(review.decision)&&!review.notes.trim()){setError("Record a rationale for this decision.");return;}
    if(review.verification!=="not_verified"&&(!review.verificationEvidence.trim()||!review.verifiedCommit.trim())){setError("Record the tested snapshot and verification evidence.");return;}
    const next={...state,reviews:{...state.reviews,[finding.stableKey]:{...review,updatedAt:new Date().toISOString()}}};
    const updated={...report,findings:report.findings.map(f=>f.id===finding.id?{...f,disposition:review.decision}:f)};
    onUpdate(recordAnalystChange(updated,next,"finding_review",finding.stableKey,`${review.decision}; verification: ${review.verification}`));setError("");
  }
  return <aside className="analyst-panel review-inspector"><span className="analyst-kicker">Evidence & decision</span><h3>{finding.title}</h3><p className="evidence-badge">{finding.status.replaceAll("_"," ")}</p><p>{finding.scenario}</p><h4>Existing controls</h4><ul>{finding.existingControls.map((x,i)=><li key={i}>{x}</li>)}</ul>{finding.existingControls.length===0&&<p>No controls recorded. Absence of evidence is not proof of absence.</p>}<h4>Counterevidence & assumptions</h4><ul>{[...finding.counterevidence,...finding.assumptions,...finding.openQuestions].map((x,i)=><li key={i}>{x}</li>)}</ul>
    <h4>Source</h4>{finding.references.map((ref,i)=><div className="source-reference" key={i}><code>{ref.path}{ref.startLine?":"+ref.startLine:""}</code><small>{ref.commitSha||report.repository.commitSha||"Unpinned"}</small>{contents?.has(ref.path)?<pre>{contents.get(ref.path)!.split(/\r?\n/).slice(Math.max(0,(ref.startLine??1)-3),Math.min((ref.endLine??ref.startLine??1)+3,(ref.startLine??1)+20)).join("\n")}</pre>:<p>Load the matching source snapshot to verify this citation.</p>}</div>)}
    {finding.dataFlow&&<><h4>Candidate data trace</h4><p>{finding.dataFlow.summary}</p><ol>{finding.dataFlow.steps.map((step,i)=><li key={i}><strong>{step.role}: </strong>{step.label}<code>{step.path}:{step.line??"unknown"}</code></li>)}</ol></>}
    <h4>Remediation</h4><p>{finding.mitigation}</p><h4>Verification suggestion</h4><p>{finding.suggestedVerificationTest||"Verify reachability and controls, then record the result of a targeted regression test."}</p>
    <label className="analyst-field">Decision<select value={review.decision} onChange={e=>setReview({...review,decision:e.target.value as ReviewState["decision"]})}>{["unreviewed","confirmed","false_positive","accepted_risk"].map(x=><option key={x} value={x}>{x.replaceAll("_"," ")}</option>)}</select></label>
    {(["owner","dueDate","notes","verifiedCommit","verificationEvidence"] as const).map(key=><label className="analyst-field" key={key}>{({owner:"Owner",dueDate:"Due date",notes:"Decision rationale / notes",verifiedCommit:"Tested commit or snapshot",verificationEvidence:"Verification evidence"})[key]}{key==="dueDate"?<input type="date" value={review[key]} onChange={e=>setReview({...review,[key]:e.target.value})}/>:<textarea maxLength={key==="owner"?200:key==="verifiedCommit"?64:8000} value={review[key]} onChange={e=>setReview({...review,[key]:e.target.value})}/>}</label>)}
    <label className="analyst-field">Verification result<select value={review.verification} onChange={e=>setReview({...review,verification:e.target.value as ReviewState["verification"]})}><option value="not_verified">Not verified</option><option value="test_passed">Targeted test passed</option><option value="test_failed">Targeted test failed</option></select></label>{error&&<p role="alert">{error}</p>}<button className="analyst-primary" onClick={save}>Save analyst decision</button>
  </aside>;
}

function ControlReview({report,onUpdate}:{report:AnalysisReport;onUpdate:(r:AnalysisReport)=>void}):JSX.Element {
  const state=analystState(report);
  const [selected,setSelected]=useState<string>(CONTROL_CATALOG[0].id);
  const control=CONTROL_CATALOG.find(c=>c.id===selected)!;
  const [assessment,setAssessment]=useState(()=>ControlAssessmentSchema.parse({...state.controls[selected],updatedAt:new Date().toISOString()}));
  const [error,setError]=useState("");
  useEffect(()=>{setAssessment(ControlAssessmentSchema.parse({...state.controls[selected],updatedAt:new Date().toISOString()}));setError("");},[selected,report]);
  function save():void {
    if(assessment.status!=="not_assessed"&&(!assessment.evidence.trim()||!assessment.reviewer.trim())){setError("Record the reviewer and supporting evidence or applicability rationale.");return;}
    onUpdate(recordAnalystChange(report,{...state,controls:{...state.controls,[selected]:{...assessment,updatedAt:new Date().toISOString()}}},"control_review",selected,assessment.status));
  }
  return <div><p className="analyst-hint">Selected security review prompts informed by ASVS 5.0 and OWASP Agentic Top 10. This is not the full ASVS catalogue or a compliance certification. Unreviewed controls remain not assessed.</p><div className="analyst-split"><div className="analyst-panel">{CONTROL_CATALOG.map(c=><button key={c.id} className="evidence-row" aria-pressed={selected===c.id} onClick={()=>setSelected(c.id)}><strong>{c.title}</strong><span>{state.controls[c.id]?.status.replaceAll("_"," ")||"not assessed"}</span><small>{c.framework}</small></button>)}</div><div className="analyst-panel"><h3>{control.title}</h3><p>{control.question}</p><h4>Suggested evidence</h4><p>{control.evidence}</p><label className="analyst-field">Assessment<select value={assessment.status} onChange={e=>setAssessment({...assessment,status:e.target.value as typeof assessment.status})}>{["not_assessed","met","gap","not_applicable"].map(x=><option key={x} value={x}>{x.replaceAll("_"," ")}</option>)}</select></label><label className="analyst-field">Reviewer<input maxLength={200} value={assessment.reviewer} onChange={e=>setAssessment({...assessment,reviewer:e.target.value})}/></label><label className="analyst-field">Evidence or applicability rationale<textarea maxLength={8000} rows={7} value={assessment.evidence} onChange={e=>setAssessment({...assessment,evidence:e.target.value})}/></label>{error&&<p role="alert">{error}</p>}<button className="analyst-primary" onClick={save}>Save assessment</button></div></div></div>;
}
