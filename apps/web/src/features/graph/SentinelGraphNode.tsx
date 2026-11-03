import { GRAPH_NODE_KIND } from "@sentinel/schema";
import type { NodeProps } from "@xyflow/react";
import { memo, type KeyboardEvent } from "react";
import { FOCUS_ROLE } from "./diagramPresentation";

interface SentinelNodeData {
  label: string;
  kind: string;
  description?: string;
  focusRole?: string;
  onSelect?: (nodeId: string) => void;
}

const KIND_ACCENT: Record<string, string> = {
  [GRAPH_NODE_KIND.FUNCTION]: "bg-teal-400",
  [GRAPH_NODE_KIND.DATA_STORE]: "bg-amber-400",
  [GRAPH_NODE_KIND.API_ENTRY]: "bg-blue-400",
  [GRAPH_NODE_KIND.MODULE]: "bg-violet-400",
  [GRAPH_NODE_KIND.EXTERNAL_SYSTEM]: "bg-pink-400",
  [GRAPH_NODE_KIND.SERVICE]: "bg-sky-300",
  [GRAPH_NODE_KIND.APPLICATION]: "bg-sky-400",
  [GRAPH_NODE_KIND.AI_AGENT]: "bg-purple-400",
  [GRAPH_NODE_KIND.AI_MODEL]: "bg-purple-300",
  [GRAPH_NODE_KIND.AI_TOOL]: "bg-purple-300",
  [GRAPH_NODE_KIND.TRUST_BOUNDARY]: "bg-pink-300",
  [GRAPH_NODE_KIND.QUEUE]: "bg-orange-400",
  [GRAPH_NODE_KIND.WORKER]: "bg-orange-300",
  [GRAPH_NODE_KIND.RETRIEVAL_STORE]: "bg-amber-300",
  [GRAPH_NODE_KIND.MEMORY]: "bg-amber-200",
  [GRAPH_NODE_KIND.ACTOR]: "bg-slate-300",
};

const FOCUS_BORDER: Record<string, string> = {
  [FOCUS_ROLE.FOCUS]: "border-teal-300 shadow-[0_0_22px_rgba(20,184,166,0.45)]",
  [FOCUS_ROLE.RELATED]: "border-blue-300/80",
  [FOCUS_ROLE.DIMMED]: "border-white/10",
  [FOCUS_ROLE.IDLE]: "border-white/20",
};

function readNodeData(value: unknown): SentinelNodeData {
  if (!value || typeof value !== "object") {
    return { label: "", kind: "" };
  }
  const record = value as Record<string, unknown>;
  const onSelect = record.onSelect;
  return {
    label: typeof record.label === "string" ? record.label : "",
    kind: typeof record.kind === "string" ? record.kind : "",
    description: typeof record.description === "string" ? record.description : undefined,
    focusRole: typeof record.focusRole === "string" ? record.focusRole : undefined,
    onSelect: typeof onSelect === "function" ? (onSelect as (nodeId: string) => void) : undefined,
  };
}

function SentinelGraphNodeComponent(props: NodeProps): JSX.Element {
  const data = readNodeData(props.data);
  const focusRole = data.focusRole ?? FOCUS_ROLE.IDLE;
  const accent = KIND_ACCENT[data.kind] ?? "bg-slate-400";
  const border = FOCUS_BORDER[focusRole] ?? FOCUS_BORDER[FOCUS_ROLE.IDLE];

  function handleClick(): void {
    data.onSelect?.(props.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      data.onSelect?.(props.id);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      title={data.description ?? data.label}
      data-testid={`graph-node-${props.id}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`min-w-[180px] rounded-lg border bg-white/10 px-3 py-2 text-left shadow backdrop-blur-xl dark:bg-white/5 ${border ?? ""}`}
    >
      <span className={`mb-2 block h-1 w-8 rounded-full ${accent}`} aria-hidden />
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{data.kind.replaceAll("_", " ")}</p>
      <p className="text-sm font-medium">{data.label}</p>
    </div>
  );
}

export const SentinelGraphNode = memo(SentinelGraphNodeComponent);
