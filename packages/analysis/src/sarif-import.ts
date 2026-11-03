import { FindingSchema, type AnalysisReport, type Finding } from "@sentinel/schema";
import { analystState, recordAnalystChange } from "./analyst-state.js";
import { buildRankedRecommendations, rankFindings } from "./risk-ranking.js";
import { verifyAuditFindings } from "./audit-verifier.js";

type Obj = Record<string, unknown>;
function obj(value: unknown): Obj { return value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function text(value: unknown, limit = 2000): string {
  if (typeof value !== "string") return "";
  return value.replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{15,}|github_pat_[A-Za-z0-9_]{15,}|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{15,}|AKIA[A-Z0-9]{16})\b/g, "[redacted credential]").slice(0, limit);
}
function safePath(uri: unknown): string | undefined {
  if (typeof uri !== "string") return undefined;
  let path: string;
  try { path = decodeURIComponent(uri).replace(/\\/g, "/").replace(/^\.\//, ""); } catch { return undefined; }
  if (!path || /^(?:\/|[a-z][a-z0-9+.-]*:)/i.test(path) || path.split("/").some(part => part === "..") || /[\x00-\x1f]/.test(path)) return undefined;
  return path;
}
function fingerprint(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

/** Import scanner claims, never scanner commands or executable fixes. Snapshot identity is an analyst assertion. */
export function importSarif(report: AnalysisReport, json: string, contents: Map<string, string> | null, assertedCommit: string): AnalysisReport {
  if (new TextEncoder().encode(json).length > 8 * 1024 * 1024) throw new Error("SARIF files must be 8 MB or smaller.");
  if (report.repository.commitSha && assertedCommit !== report.repository.commitSha) throw new Error("Enter the exact report commit before importing scanner results.");
  const root = obj(JSON.parse(json));
  if (root.version !== "2.1.0" || !Array.isArray(root.runs) || root.runs.length > 50) throw new Error("Expected SARIF 2.1.0 with at most 50 runs.");
  const state = analystState(report);
  const added: Finding[] = [];
  const traceNodes = new Map(report.graph.nodes.map(node => [node.id, node]));
  const traceEdges = new Map(report.graph.edges.map(edge => [edge.id, edge]));
  const importedAt = new Date().toISOString();
  for (const [runIndex, value] of root.runs.entries()) {
    const run = obj(value), driver = obj(obj(run.tool).driver);
    for (const provenance of array(run.versionControlProvenance)) {
      const revision = obj(provenance).revisionId;
      if (typeof revision === "string" && report.repository.commitSha && revision !== report.repository.commitSha) throw new Error("Scanner provenance refers to a different commit.");
    }
    const tool = text(driver.name, 300) || "External scanner";
    const results = array(run.results);
    if (results.length > 5000) throw new Error("Each scanner run must contain at most 5,000 results.");
    const runId = fingerprint(json) + "-" + runIndex;
    if (state.scannerRuns.some(item => item.id === runId)) continue;
    const ruleIndex = new Map(array(driver.rules).map(rule => [obj(rule).id, obj(rule)]));
    const failed = array(run.invocations).some(invocation => obj(invocation).executionSuccessful === false);
    const scannerCoverage = obj(obj(run.properties).sentinelCoverage);
    const fileCount = Number.isInteger(scannerCoverage.fileCount) && Number(scannerCoverage.fileCount) >= 0 ? Number(scannerCoverage.fileCount) : undefined;
    const omittedFiles = Number.isInteger(scannerCoverage.omittedFiles) && Number(scannerCoverage.omittedFiles) >= 0 ? Number(scannerCoverage.omittedFiles) : undefined;
    let skipped = 0, accepted = 0;
    for (const resultValue of results) {
      const result = obj(resultValue);
      if (["pass", "notApplicable", "informational"].includes(String(result.kind))) { skipped++; continue; }
      const physical = obj(obj(array(result.locations)[0]).physicalLocation);
      const artifact = obj(physical.artifactLocation);
      const uri = artifact.uri ?? obj(array(run.artifacts)[Number(artifact.index)]).location;
      const path = safePath(typeof uri === "object" ? obj(uri).uri : uri);
      const region = obj(physical.region);
      const line = Number(region.startLine);
      if (!path || !Number.isInteger(line) || line < 1 || line > 10_000_000) { skipped++; continue; }
      const ruleId = text(result.ruleId, 200) || "unknown-rule";
      const message = text(obj(result.message).text, 8000) || "Scanner reported a candidate weakness.";
      const rule = ruleIndex.get(result.ruleId) ?? {};
      const title = text(obj(rule.shortDescription).text, 500) || message.slice(0, 200);
      const stableKey = `external-${fingerprint(tool + ":" + ruleId + ":" + path + ":" + line)}`;
      const rawSteps = array(obj(array(obj(array(result.codeFlows)[0]).threadFlows)[0]).locations);
      const steps = rawSteps.slice(0, 12).map((entry, index) => {
        const location = obj(obj(entry).location), physical = obj(location.physicalLocation);
        const tracePath = safePath(obj(physical.artifactLocation).uri);
        const traceLine = Number(obj(physical.region).startLine);
        return tracePath && Number.isInteger(traceLine) && traceLine > 0 && contents?.has(tracePath) && traceLine <= contents.get(tracePath)!.split(/\r?\n/).length
          ? {role: index === 0 ? "source" as const : index === Math.min(rawSteps.length, 12) - 1 ? "sink" as const : "call" as const, path:tracePath, line:traceLine, label:text(obj(location.message).text,300)||`Scanner trace step ${index+1}`} : null;
      });
      const validTrace = rawSteps.length >= 2 && rawSteps.length <= 12 && steps.every(Boolean) ? steps.filter((step): step is NonNullable<typeof step> => Boolean(step)) : [];
      const affectedNodeIds: string[] = [];
      for (const [index, step] of validTrace.entries()) {
        const id = "scanner-trace-" + fingerprint(tool + ":" + step.path + ":" + step.line);
        affectedNodeIds.push(id);
        const provenance = {kind:"inferred" as const,confidence:0.6,rationale:"External scanner trace; cited location exists, but runtime flow is not independently verified.",references:[{path:step.path,startLine:step.line,endLine:step.line,commitSha:report.repository.commitSha}]};
        traceNodes.set(id,{id,kind:"function",label:step.path+":"+step.line,provenance});
        if(index>0) {
          const source=affectedNodeIds[index-1], edgeId=source+"->"+id+":"+stableKey;
          traceEdges.set(edgeId,{id:edgeId,source,target:id,kind:"data_flow",label:"External scanner trace candidate",bidirectional:false,provenance});
        }
      }
      added.push(FindingSchema.parse({
        id: crypto.randomUUID(), stableKey, title, category: "security",
        status: "plausible_threat_requiring_verification", confidence: contents?.has(path) ? 0.6 : 0.3,
        commitSha: report.repository.commitSha,
        references: [{path, startLine: line, endLine: Number.isInteger(region.endLine) && Number(region.endLine) >= line ? region.endLine : line, commitSha: report.repository.commitSha}],
        affectedAssetSummary: path, scenario: message, affectedNodeIds,
        dataFlow: validTrace.length ? {summary:"External scanner trace candidate; runtime path and controls require verification.",steps:validTrace} : undefined,
        severityRationale: `${tool} level: ${text(result.level, 30) || "unspecified"}. External scanner claim; not independently confirmed.`,
        likelihoodRationale: "Execution reachability, deployment exposure and controls require analyst review.",
        assumptions: ["Scanner snapshot association was declared by the importing analyst."],
        openQuestions: [...(contents?.has(path) ? [] : ["Source is not loaded for evidence verification."]), ...(rawSteps.length && !validTrace.length ? ["Scanner trace was omitted because it exceeds 12 steps or contains unverifiable locations."] : [])],
        mitigation: text(obj(rule.help).text, 8000) || "Review the scanner rule, validate reachability and existing controls, then verify a targeted remediation.",
        counterevidence: failed ? ["Scanner reported an unsuccessful invocation. Coverage is incomplete."] : [],
      }));
      accepted++;
    }
    state.scannerRuns.push({id: runId, tool, version: text(driver.version, 100), commit: assertedCommit, importedAt, resultCount: accepted, skippedCount: skipped,
      fileCount, omittedFiles, status: failed ? "failed" : (omittedFiles??0)>0 ? "partial" : "imported", detail: failed ? "Scanner invocation failed; findings retained, completeness unverified." : (omittedFiles??0)>0 ? `Bounded scanner snapshot omitted ${omittedFiles} files. Imported claims require review.` : "Imported claims; execution completeness and repository identity require reviewer validation."});
  }
  if (state.scannerRuns.length > 200) throw new Error("This report has reached the 200 scanner-run limit.");
  const unique = new Map(report.findings.map(f => [f.stableKey, f]));
  const graph = {nodes:[...traceNodes.values()],edges:[...traceEdges.values()]};
  const checked = contents ? verifyAuditFindings(added, contents, graph, report.repository.commitSha) : added.map(f => ({...f, status: "insufficient_evidence" as const}));
  for (const finding of checked) if (!unique.has(finding.stableKey)) unique.set(finding.stableKey, finding);
  const findings = rankFindings([...unique.values()]);
  return recordAnalystChange({...report, graph, findings, recommendations: buildRankedRecommendations(findings)}, state, "scanner_import", "SARIF", `Imported ${checked.length} scanner claims; no finding was automatically confirmed.`);
}
