import { AUDIT_AGENT } from "@sentinel/schema";
import { useEffect, useRef } from "react";
import { AGENT_WORK_STATUS, isThinkingStep, type AgentWorkItem, type AgentWorkStep } from "./agentWorkState";

const AGENT_LABEL: Record<(typeof AUDIT_AGENT)[keyof typeof AUDIT_AGENT], string> = {
  [AUDIT_AGENT.CARTOGRAPHER]: "Cartographer",
  [AUDIT_AGENT.CODE_READER]: "Code reader",
  [AUDIT_AGENT.STRIDE]: "STRIDE",
  [AUDIT_AGENT.OWASP]: "OWASP",
  [AUDIT_AGENT.ATLAS]: "ATLAS",
  [AUDIT_AGENT.DATA]: "Data",
  [AUDIT_AGENT.INFRASTRUCTURE]: "Infrastructure",
  [AUDIT_AGENT.PULL_REQUEST]: "Pull request",
  [AUDIT_AGENT.VERIFIER]: "Verifier",
};

const STATUS_LABEL: Record<(typeof AGENT_WORK_STATUS)[keyof typeof AGENT_WORK_STATUS], string> = {
  [AGENT_WORK_STATUS.PENDING]: "Waiting",
  [AGENT_WORK_STATUS.RUNNING]: "Working",
  [AGENT_WORK_STATUS.COMPLETED]: "Done",
  [AGENT_WORK_STATUS.SKIPPED]: "Skipped",
  [AGENT_WORK_STATUS.FAILED]: "Failed",
};

interface AgentActivityPanelProps {
  agents: AgentWorkItem[];
}

export function AgentActivityPanel({ agents }: AgentActivityPanelProps): JSX.Element {
  return (
    <ol className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto pr-1" data-testid="agent-activity" aria-live="polite">
      {agents.map((agent) => (
        <AgentActivityItem key={agent.agentId} agent={agent} />
      ))}
    </ol>
  );
}

interface AgentActivityItemProps {
  agent: AgentWorkItem;
}

function AgentActivityItem({ agent }: AgentActivityItemProps): JSX.Element {
  const itemRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (agent.status !== AGENT_WORK_STATUS.RUNNING || !itemRef.current) {
      return;
    }
    itemRef.current.scrollIntoView({ block: "nearest" });
  }, [agent.status, agent.steps.length]);

  return (
    <li
      ref={itemRef}
      className="rounded-xl border border-[var(--md-outline)]/30 bg-[var(--md-surface-container-high)]/40 p-3"
      data-testid={`agent-activity-${agent.agentId}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[var(--md-on-surface)]">{AGENT_LABEL[agent.agentId]}</p>
        <span className={statusClassName(agent.status)}>{STATUS_LABEL[agent.status]}</span>
      </div>
      {agent.steps.length > 0 && (
        <ul className="mt-2 space-y-2 border-l border-[var(--md-primary)]/40 pl-3">
          {agent.steps.map((step) => (
            <AgentActivityStepRow key={step.id} agentId={agent.agentId} step={step} />
          ))}
        </ul>
      )}
    </li>
  );
}

interface AgentActivityStepRowProps {
  agentId: string;
  step: AgentWorkStep;
}

function AgentActivityStepRow({ agentId, step }: AgentActivityStepRowProps): JSX.Element {
  if (isThinkingStep(step)) {
    return (
      <li className="text-sm leading-relaxed text-[var(--md-on-surface)]" data-testid={`agent-thinking-${agentId}`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--md-primary)]">Thinking</p>
        <p className="mt-1 whitespace-pre-wrap">{step.text}</p>
      </li>
    );
  }
  return <li className="text-sm text-[var(--md-on-surface-variant)]">{step.text}</li>;
}

function statusClassName(status: AgentWorkItem["status"]): string {
  const base = "rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide";
  if (status === AGENT_WORK_STATUS.RUNNING) {
    return `${base} bg-[var(--md-primary)]/15 text-[var(--md-primary)]`;
  }
  if (status === AGENT_WORK_STATUS.COMPLETED) {
    return `${base} bg-[var(--color-neon-green)]/15 text-[var(--color-neon-green)]`;
  }
  if (status === AGENT_WORK_STATUS.FAILED) {
    return `${base} bg-[var(--color-neon-pink)]/15 text-[var(--color-neon-pink)]`;
  }
  if (status === AGENT_WORK_STATUS.SKIPPED) {
    return `${base} bg-amber-500/15 text-amber-700 dark:text-amber-200`;
  }
  return `${base} bg-[var(--md-surface-container-high)] text-[var(--md-on-surface-variant)]`;
}
