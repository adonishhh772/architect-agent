import { useEffect, useMemo, useState } from "react";
import { Background, Controls, MarkerType, Position, ReactFlow, useNodesState, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { downloadDiagramPng } from "../graph/diagramExport";
import { buildDataFlowModel, dataFlowMermaid, flowEvidenceLabel } from "@sentinel/graph";
import { analystState, recordAnalystChange } from "@sentinel/analysis";
import { AnalystStateSchema, FlowAnnotationSchema, type AnalysisReport, type FlowAnnotation, type GraphNode } from "@sentinel/schema";

function download(value: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([value], {type}));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const nodeTypes = { boundary: ({data}: NodeProps) => <div className="trust-zone-title">{String(data.label)}</div> };
const XML = (value: unknown) => String(value).replace(/[<>&"']/g, char => ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"}[char]!));

export function DataFlowWorkbench({report, contents, onUpdate, onSelectFinding}: {
  report: AnalysisReport; contents: Map<string,string> | null; onUpdate: (report: AnalysisReport) => void; onSelectFinding: (id: string) => void;
}): JSX.Element {
  const state = useMemo(() => analystState(report), [report]);
  const [modelError, setModelError] = useState("");
  const [detail, setDetail] = useState(false);
  const [selection, setSelection] = useState("");
  const [annotation, setAnnotation] = useState<FlowAnnotation>(() => FlowAnnotationSchema.parse({updatedAt: new Date().toISOString()}));
  const [zone, setZone] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newKind, setNewKind] = useState<"actor" | "service" | "data_store" | "external_system">("service");
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [flowLabel, setFlowLabel] = useState("");
  const all = useMemo(() => buildDataFlowModel(report.graph, state, true), [report.graph, state]);
  const model = useMemo(() => buildDataFlowModel(report.graph, state, detail), [report.graph, state, detail]);
  const selectedEdge = all.edges.find(edge => edge.id === selection);
  const selectedNode = [...report.graph.nodes, ...state.declaredNodes].find(node => node.id === selection);
  useEffect(() => {
    setAnnotation(FlowAnnotationSchema.parse({...state.flows[selection], updatedAt: new Date().toISOString()}));
    setZone(state.zones[selection] ?? "");
  }, [selection, state]);
  const layout = useMemo(() => {
    const graph = new dagre.graphlib.Graph();
    graph.setGraph({rankdir: "LR", nodesep: 65, ranksep: 100});
    graph.setDefaultEdgeLabel(() => ({}));
    const selected = model.nodes.slice(0, 150);
    const ids = new Set(selected.map(node => node.id));
    selected.forEach(node => graph.setNode(node.id, {width: 190, height: 70}));
    model.edges.forEach(edge => { if (ids.has(edge.source) && ids.has(edge.target)) graph.setEdge(edge.source, edge.target); });
    dagre.layout(graph);
    const nodes: Node[] = selected.map(node => ({
      id: node.id, position: state.positions[node.id] ?? {x: graph.node(node.id).x, y: graph.node(node.id).y},
      data: {label: node.label + "\n" + node.kind.replaceAll("_", " ")},
      sourcePosition: Position.Right, targetPosition: Position.Left,
      style: {width: 190, minHeight: 70, background: "var(--md-surface-container-high)", color: "var(--md-on-surface)", border: node.id === selection ? "2px solid #a5e6cd" : "1px solid #49616c", borderRadius: node.kind === "data_store" ? "24px / 12px" : 6, whiteSpace: "pre-wrap", fontSize: 12},
    }));
    const groups: Node[] = [];
    const zones = [...new Set(selected.map(node => state.zones[node.id]).filter(Boolean))];
    zones.forEach((name, i) => {
      const members = nodes.filter(node => state.zones[node.id] === name);
      const x = Math.min(...members.map(node => node.position.x)) - 24;
      const y = Math.min(...members.map(node => node.position.y)) - 48;
      const right = Math.max(...members.map(node => node.position.x + 190)) + 24;
      const bottom = Math.max(...members.map(node => node.position.y + 70)) + 24;
      const id = "zone-" + i;
      groups.push({id, type: "boundary", position: {x,y}, data: {label: name}, style: {width: right-x, height: bottom-y, border: "1px dashed #a5e6cd", background: "rgba(165,230,205,.035)"}, selectable: false, draggable: false});
      members.forEach(node => { node.parentId = id; node.position = {x: node.position.x-x, y: node.position.y-y}; });
    });
    const edges: Edge[] = model.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)).map(edge => ({
      id: edge.id, source: edge.source, target: edge.target, label: edge.label || edge.kind.replaceAll("_", " "),
      markerEnd: {type: MarkerType.ArrowClosed}, selected: edge.id === selection,
      style: {stroke: edge.id === selection ? "#edb57f" : "#92cbb7", strokeWidth: edge.id === selection ? 3 : 1.4, strokeDasharray: edge.provenance.kind === "inferred" ? "6 5" : undefined},
      labelStyle: {fill: "#162229", fontSize: 10}, labelBgStyle: {fill: "#d6e7df"},
    }));
    return {nodes: [...groups, ...nodes], edges};
  }, [model, state.zones, state.positions, selection]);
  const [canvasNodes, setCanvasNodes, onNodesChange] = useNodesState(layout.nodes);
  useEffect(() => setCanvasNodes(layout.nodes), [layout, setCanvasNodes]);
  function save(): void {
    const next = {...state, flows: {...state.flows}, zones: {...state.zones}};
    if (selectedEdge) next.flows[selectedEdge.id] = {...annotation, updatedAt: new Date().toISOString()};
    if (selectedNode) next.zones[selectedNode.id] = zone.trim();
    onUpdate(recordAnalystChange(report, next, "model_declaration", selection, "Analyst declaration saved; extractor evidence retained."));
  }
  function addNode(): void {
    if (!newLabel.trim()) return;
    const node: GraphNode = {id: "declared-" + crypto.randomUUID(), kind: newKind, label: newLabel.trim(), provenance: {kind: "user_declared", confidence: 1, rationale: "Declared by analyst, not independently verified.", references: []}};
    onUpdate(recordAnalystChange(report, {...state, declaredNodes: [...state.declaredNodes, node]}, "add_component", node.id, node.label));
    setSelection(node.id); setNewLabel("");
  }
  function addFlow(): void {
    if (!source || !target || !flowLabel.trim()) return;
    const id = "declared-flow-" + crypto.randomUUID();
    onUpdate(recordAnalystChange(report, {...state, declaredFlows: [...state.declaredFlows, {id, source, target, kind: "data_flow", label: flowLabel.trim(), bidirectional: false, provenance: {kind: "user_declared", confidence: 1, rationale: "Connection declared by analyst.", references: []}}]}, "add_flow", id, flowLabel));
    setSelection(id); setFlowLabel("");
  }
  function exportSvg(asPng = false): void {
    const width = Math.max(900, ...canvasNodes.map(n => n.position.x + Number(n.style?.width ?? 190))) + 50;
    const height = Math.max(500, ...canvasNodes.map(n => n.position.y + Number(n.style?.height ?? 90))) + 50;
    const absolute = (id: string) => {
      const node = canvasNodes.find(n => n.id === id)!;
      const parent = canvasNodes.find(n => n.id === node.parentId);
      return {x: node.position.x + (parent?.position.x ?? 0), y: node.position.y + (parent?.position.y ?? 0)};
    };
    const shapes = canvasNodes.map(node => {
      const p = absolute(node.id), group = node.type === "boundary";
      return `<rect x="${p.x}" y="${p.y}" width="${node.style?.width ?? 190}" height="${node.style?.height ?? 70}" rx="6" fill="${group ? "none" : "#162229"}" stroke="#a5e6cd" ${group ? 'stroke-dasharray="7 5"' : ""}/><text x="${p.x+10}" y="${p.y+22}" fill="#edf2ee" font-family="sans-serif" font-size="12">${XML(node.data.label)}</text>`;
    }).join("");
    const arrows = layout.edges.map(edge => {
      const s = absolute(edge.source), t = absolute(edge.target);
      return `<path d="M${s.x+190} ${s.y+35} L${t.x} ${t.y+35}" fill="none" stroke="#92cbb7" marker-end="url(#arrow)" ${edge.style?.strokeDasharray ? 'stroke-dasharray="6 5"' : ""}/><text x="${(s.x+190+t.x)/2}" y="${(s.y+t.y)/2+25}" fill="#edf2ee" font-size="10" font-family="sans-serif">${XML(edge.label)}</text>`;
    }).join("");
    const scale = Math.min(1, 4000/width, 4000/height);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width*scale)}" height="${Math.ceil(height*scale)}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#10191f"/><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="#92cbb7"/></marker></defs>${shapes}${arrows}</svg>`;
    if (asPng) downloadDiagramPng(svg, "data-flow.png"); else download(svg, "data-flow.svg", "image/svg+xml");
  }
  const related = report.findings.filter(f => f.affectedNodeIds.includes(selection) || f.references.some(ref => (selectedEdge?.provenance.references ?? selectedNode?.provenance.references ?? []).some(evidence => evidence.path === ref.path)));
  const references = selectedEdge?.provenance.references ?? selectedNode?.provenance.references ?? [];
  const nodes = [...report.graph.nodes, ...state.declaredNodes];
  return <div className="dfd-workbench">
    <div className="analyst-toolbar"><label><input type="checkbox" checked={detail} onChange={e => setDetail(e.target.checked)}/> Include function traces</label>
      <button onClick={() => download(dataFlowMermaid(model,state), "data-flow.mmd", "text/plain")}>Export Mermaid</button><button onClick={() => exportSvg(false)}>Export SVG</button><button onClick={() => exportSvg(true)}>Export PNG</button>
      <button onClick={() => download(JSON.stringify({version:1, reportId:report.id, commit:report.repository.commitSha, extractedGraph:report.graph, declarations:state, effectiveGraph:model},null,2),"data-flow.json","application/json")}>Export model</button>
    </div>
    <label className="analyst-field">Import reviewed model (same snapshot, maximum 2 MB)<input type="file" accept=".json" onChange={async e => {
      const file=e.target.files?.[0]; if(!file)return;
      try {
        setModelError(""); if(file.size>2*1024*1024)throw new Error("Model exceeds 2 MB.");
        const value=JSON.parse(await file.text());
        if(value.version!==1 || (value.commit??null)!==(report.repository.commitSha??null) || value.reportId!==report.id)throw new Error("Choose a model exported from this report and snapshot.");
        const imported=AnalystStateSchema.parse(value.declarations);
        const provenance={kind:"user_declared" as const,confidence:1,rationale:"Imported analyst declaration; not independently verified.",references:[]};
        onUpdate(recordAnalystChange(report,{...state,flows:imported.flows,zones:imported.zones,positions:imported.positions,declaredNodes:imported.declaredNodes.map(node=>({...node,provenance})),declaredFlows:imported.declaredFlows.map(edge=>({...edge,provenance}))},"model_import",report.id,"Imported model declarations; original extractor evidence retained."));
      } catch(error){setModelError(error instanceof Error?error.message:"Invalid model.");}finally{e.target.value="";}
    }}/></label>{modelError&&<p role="alert">{modelError}</p>}
    <p className="analyst-hint">Dashed lines are inferred. Trust zones are analyst declarations. An observed construct does not prove runtime reachability. {model.nodes.length > 150 ? `Showing 150 of ${model.nodes.length} components; JSON/Mermaid retain the complete model. SVG captures this view.` : `${model.nodes.length} components · ${model.edges.length} connections`}</p>
    <div className="analyst-split">
      <div><div className="dfd-canvas" aria-label="Data flow diagram"><ReactFlow nodeTypes={nodeTypes} key={detail ? "detail" : "context"} nodes={canvasNodes} onNodesChange={onNodesChange} onNodeDragStop={(_,node) => {
        const parent = canvasNodes.find(item => item.id === node.parentId);
        const x = node.position.x + (parent?.position.x ?? 0), y = node.position.y + (parent?.position.y ?? 0);
        if (x>=0 && y>=0 && x<=20000 && y<=20000) onUpdate(recordAnalystChange(report,{...state,positions:{...state.positions,[node.id]:{x,y}}},"diagram_layout",node.id,"Component position updated."));
      }} edges={layout.edges} fitView minZoom={0.1} onNodeClick={(_,node) => setSelection(node.id)} onEdgeClick={(_,edge) => setSelection(edge.id)} nodesDraggable elementsSelectable><Background color="#3b515d" gap={24}/><Controls/></ReactFlow></div>
        <label className="analyst-field">Inspect a component or connection<select value={selection} onChange={e => setSelection(e.target.value)}><option value="">Choose an element</option>{model.nodes.map(n => <option key={n.id} value={n.id}>{n.label} · {n.kind}</option>)}{model.edges.map(e => <option key={e.id} value={e.id}>{e.label || e.kind}</option>)}</select></label>
        <details className="analyst-panel"><summary>Add analyst-declared components and flows</summary><div className="analyst-toolbar"><input aria-label="New component name" placeholder="Component name" value={newLabel} maxLength={500} onChange={e=>setNewLabel(e.target.value)}/><select aria-label="Component type" value={newKind} onChange={e=>setNewKind(e.target.value as typeof newKind)}>{["actor","service","data_store","external_system"].map(k=><option key={k}>{k}</option>)}</select><button disabled={!newLabel.trim()} onClick={addNode}>Add component</button></div><div className="analyst-toolbar"><select aria-label="Flow source" value={source} onChange={e=>setSource(e.target.value)}><option value="">From…</option>{nodes.map(n=><option key={n.id} value={n.id}>{n.label}</option>)}</select><select aria-label="Flow destination" value={target} onChange={e=>setTarget(e.target.value)}><option value="">To…</option>{nodes.map(n=><option key={n.id} value={n.id}>{n.label}</option>)}</select><input aria-label="Flow description" placeholder="Data moving between components" value={flowLabel} maxLength={500} onChange={e=>setFlowLabel(e.target.value)}/><button disabled={!source||!target||!flowLabel.trim()} onClick={addFlow}>Add flow</button></div></details>
      </div>
      <aside className="analyst-panel evidence-inspector"><span className="analyst-kicker">Flow evidence</span><h3>{selectedEdge?.label || selectedNode?.label || "Select an element"}</h3>
      {selectedEdge && <><p className="evidence-badge">{flowEvidenceLabel(selectedEdge)}</p><p>{selectedEdge.provenance.rationale}</p><label className="analyst-field">Reviewed label<input maxLength={500} value={annotation.label} onChange={e=>setAnnotation({...annotation,label:e.target.value})}/></label><label className="analyst-field">Data classification<select value={annotation.dataClass} onChange={e=>setAnnotation({...annotation,dataClass:e.target.value as FlowAnnotation["dataClass"]})}>{["unknown","public","internal","confidential","restricted"].map(x=><option key={x}>{x}</option>)}</select></label>{(["transport","authentication","authorizationControl","boundary","notes"] as const).map(key=><label className="analyst-field" key={key}>{key}<textarea value={annotation[key]} maxLength={key==="notes"?4000:500} onChange={e=>setAnnotation({...annotation,[key]:e.target.value})}/></label>)}</>}
      {selectedNode && <><p className="evidence-badge">{selectedNode.provenance.kind.replaceAll("_"," ")}</p><p>{selectedNode.provenance.rationale}</p><label className="analyst-field">Trust zone (analyst-declared)<input maxLength={200} placeholder="Unknown until reviewed" value={zone} onChange={e=>setZone(e.target.value)}/></label></>}
      {(selectedNode||selectedEdge) && <button className="analyst-primary" onClick={save}>Save declaration</button>}
      <h4>Source references</h4>{references.length===0 ? <p>No source reference supplied.</p>:references.map((ref,i)=><div className="source-reference" key={i}><code>{ref.path}{ref.startLine?":"+ref.startLine:""}</code><small>{ref.commitSha?.slice(0,12)||"Unpinned source"}</small>{contents?.has(ref.path)&&ref.startLine&&<pre>{contents.get(ref.path)!.split(/\r?\n/).slice(ref.startLine-1,Math.min(ref.endLine??ref.startLine,ref.startLine+15)).join("\n")}</pre>}</div>)}
      {related.length>0 && <><h4>Related threats</h4>{related.map(f=><button className="analyst-link" key={f.id} onClick={()=>onSelectFinding(f.id)}>{f.title}</button>)}</>}
      </aside>
    </div>
  </div>;
}
