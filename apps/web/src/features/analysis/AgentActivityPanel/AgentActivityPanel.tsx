import { AUDIT_AGENT } from "@sentinel/schema";
import { useEffect, useRef } from "react";
import { AGENT_WORK_STATUS, isThinkingStep, rosterStatusLabel, type AgentWorkItem, type AgentWorkStep } from "./agentWorkState";

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

interface AgentActivityPanelProps {
  agents: AgentWorkItem[];
}

interface TranscriptLine {
  id: string;
  agentId: AgentWorkItem["agentId"];
  step: AgentWorkStep;
  live: boolean;
}

export function AgentActivityPanel({ agents }: AgentActivityPanelProps): JSX.Element {
  const feedRef = useRef<HTMLOListElement>(null);
  const lines = buildTranscript(agents);
  const lineCount = lines.length;

  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) {
      return;
    }
    feed.scrollTop = feed.scrollHeight;
  }, [lineCount]);

  return (
    <div className="mt-4 space-y-3">
      <ul className="flex flex-wrap gap-2" data-testid="agent-roster" aria-label="Audit agents">
        {agents.map((agent) => (
          <AgentRosterItem key={agent.agentId} agent={agent} />
        ))}
      </ul>
      <ol
        ref={feedRef}
        className="max-h-[32rem] space-y-1 overflow-y-auto rounded-2xl border border-[var(--md-outline)]/30 bg-[var(--md-surface)]/80 p-3 font-mono text-sm"
        data-testid="agent-activity"
        aria-live="polite"
        aria-label="Live agent activity"
      >
        {lines.map((line) => (
          <TranscriptRow key={line.id} line={line} />
        ))}
      </ol>
    </div>
  );
}

function AgentRosterItem({ agent }: { agent: AgentWorkItem }): JSX.Element {
  const running = agent.status === AGENT_WORK_STATUS.RUNNING;
  return (
    <li
      className={`meta-pill ${running ? "bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)]" : "bg-[var(--md-surface-container-high)] text-[var(--md-on-surface-variant)]"}`}
      data-testid={`agent-roster-${agent.agentId}`}
    >
      {AGENT_LABEL[agent.agentId]} · {rosterStatusLabel(agent.status)}
    </li>
  );
}

interface TranscriptRowProps {
  line: TranscriptLine;
}

function TranscriptRow({ line }: TranscriptRowProps): JSX.Element {
  const thinking = isThinkingStep(line.step);
  return (
    <li
      className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${
        line.live ? "bg-[var(--md-primary-container)]/40 text-[var(--md-on-surface)]" : "text-[var(--md-on-surface-variant)]"
      }`}
      data-testid={thinking ? `agent-thinking-${line.agentId}` : `agent-line-${line.id}`}
      data-live={line.live ? "true" : "false"}
    >
      <span
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
          line.live ? "animate-pulse bg-[var(--md-primary)]" : "bg-[var(--md-outline)]"
        }`}
        aria-hidden
      />
      <span className="min-w-0">
        <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-[var(--md-primary)]">
          {AGENT_LABEL[line.agentId]}
        </span>
        <span className={thinking ? "whitespace-pre-wrap text-[var(--md-on-surface)]" : undefined}>{line.step.text}</span>
      </span>
    </li>
  );
}

export function buildTranscript(agents: AgentWorkItem[]): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const agent of agents) {
    const lastIndex = agent.steps.length - 1;
    for (let stepIndex = 0; stepIndex < agent.steps.length; stepIndex += 1) {
      const step = agent.steps[stepIndex];
      if (!step) {
        continue;
      }
      lines.push({
        id: step.id,
        agentId: agent.agentId,
        step,
        live: agent.status === AGENT_WORK_STATUS.RUNNING && stepIndex === lastIndex,
      });
    }
  }
  return lines;
}
