import type { NodeProps } from "@xyflow/react";
import { memo, type KeyboardEvent } from "react";

interface SentinelNodeData {
  label: string;
  kind: string;
  description?: string;
  onSelect?: (nodeId: string) => void;
}

function SentinelGraphNodeComponent(props: NodeProps): JSX.Element {
  const data = props.data as SentinelNodeData;
  const handleClick = (): void => {
    data.onSelect?.(props.id);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      data.onSelect?.(props.id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`graph-node-${props.id}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="min-w-[180px] rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-left shadow backdrop-blur-xl dark:bg-white/5"
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{data.kind}</p>
      <p className="text-sm font-medium">{data.label}</p>
    </div>
  );
}

export const SentinelGraphNode = memo(SentinelGraphNodeComponent);
