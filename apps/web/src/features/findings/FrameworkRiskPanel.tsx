import type { AnalysisReport, Finding } from "@sentinel/schema";
import { RISK_DOMAIN } from "@sentinel/schema";
import { ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { countFrameworkTags, groupFindingsByRiskDomain } from "./frameworkGroups";
import { collapseFindingsByTitle } from "./uniqueFindings";

const RISK_DOMAIN_LABELS: Record<(typeof RISK_DOMAIN)[keyof typeof RISK_DOMAIN], string> = {
  [RISK_DOMAIN.CYBERSECURITY]: "Cybersecurity",
  [RISK_DOMAIN.DATA]: "Data",
  [RISK_DOMAIN.INFRASTRUCTURE]: "Infrastructure",
  [RISK_DOMAIN.AI_EXECUTION]: "AI execution",
};

interface FrameworkRiskPanelProps {
  report: AnalysisReport;
  onSelectFinding: (findingId: string) => void;
}

export function FrameworkRiskPanel({
  report,
  onSelectFinding,
}: FrameworkRiskPanelProps): JSX.Element {
  const groups = useMemo(
    () => groupFindingsByRiskDomain(collapseFindingsByTitle(report.findings)),
    [report.findings],
  );
  const counts = useMemo(() => countFrameworkTags(report.findings), [report.findings]);

  return (
    <section className="surface-inset space-y-4" data-testid="framework-risk-panel">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-[var(--color-neon-purple)]" aria-hidden />
        <h3 className="text-lg font-semibold text-[var(--md-on-surface)]">OWASP, ATLAS, data, and infrastructure</h3>
      </div>
      <p className="text-sm text-[var(--md-on-surface-variant)]">
        {counts.stride} STRIDE-tagged, {counts.owasp} OWASP-tagged, {counts.atlas} ATLAS-tagged. Empty groups are
        coverage gaps for this snapshot, not proof that the risk is absent.
      </p>
      {report.memory && (
        <p className="text-sm text-[var(--md-on-surface-variant)]" data-testid="repository-memory">
          Memory: read {report.memory.filesRead.length} indexed files, {report.memory.filesUnread.length} still unread,{" "}
          {report.memory.pullRequestsReviewed.length} open pull requests noted. The next run on this repository reuses
          this memory.
        </p>
      )}
      {report.architectureOverview && (
        <div data-testid="architecture-overview">
          <h4 className="text-sm font-semibold text-[var(--md-on-surface)]">Architecture read</h4>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[var(--md-on-surface-variant)]">
            {report.architectureOverview}
          </p>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <RiskDomainSection
            key={group.domain}
            domain={group.domain}
            findings={group.findings}
            onSelectFinding={onSelectFinding}
          />
        ))}
      </div>
      {report.agentTrace.length > 0 && <AgentTrace entries={report.agentTrace} />}
    </section>
  );
}

interface RiskDomainSectionProps {
  domain: (typeof RISK_DOMAIN)[keyof typeof RISK_DOMAIN];
  findings: Finding[];
  onSelectFinding: (findingId: string) => void;
}

function RiskDomainSection({
  domain,
  findings,
  onSelectFinding,
}: RiskDomainSectionProps): JSX.Element {
  return (
    <article
      className="rounded-xl border border-[var(--md-outline)]/30 bg-[var(--md-surface-container-high)]/50 p-4"
      data-testid={`risk-domain-${domain}`}
    >
      <h4 className="text-sm font-semibold uppercase tracking-wide text-[var(--md-primary)]">
        {RISK_DOMAIN_LABELS[domain]}
      </h4>
      {findings.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--md-on-surface-variant)]">No findings tagged for this domain.</p>
      ) : (
        <ul className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-2">
          {findings.map((finding) => (
            <FindingChoice key={finding.id} finding={finding} onSelectFinding={onSelectFinding} />
          ))}
        </ul>
      )}
    </article>
  );
}

interface FindingChoiceProps {
  finding: Finding;
  onSelectFinding: (findingId: string) => void;
}

function FindingChoice({ finding, onSelectFinding }: FindingChoiceProps): JSX.Element {
  const handleSelect = createSelectHandler(finding.id, onSelectFinding);
  const frameworkLabels = [
    ...(finding.owaspCategories ?? []),
    ...(finding.atlasTechniqueIds ?? []),
  ];
  return (
    <li>
      <button
        type="button"
        className="w-full rounded-lg border border-transparent px-2 py-2 text-left transition hover:border-[var(--md-primary)]/30 hover:bg-[var(--md-primary-container)]/20"
        onClick={handleSelect}
      >
        <p className="text-sm font-medium text-[var(--md-on-surface)]">{finding.title}</p>
        {frameworkLabels.length > 0 && (
          <p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--md-on-surface-variant)]">
            {frameworkLabels.join(" · ")}
          </p>
        )}
      </button>
    </li>
  );
}

function AgentTrace({ entries }: { entries: AnalysisReport["agentTrace"] }): JSX.Element {
  const [open, setOpen] = useState(false);

  function handleToggle(): void {
    setOpen((current) => !current);
  }

  return (
    <div className="rounded-xl border border-[var(--md-outline)]/30" data-testid="agent-trace">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-[var(--md-on-surface)]"
        aria-expanded={open}
        onClick={handleToggle}
      >
        Agent trace
        <span className="font-normal text-[var(--md-on-surface-variant)]">{entries.length} steps</span>
      </button>
      {open && (
        <ul className="max-h-64 space-y-2 overflow-y-auto border-t border-[var(--md-outline)]/20 px-4 py-3 text-sm text-[var(--md-on-surface-variant)]">
          {entries.map((entry, index) => (
            <li key={`${entry.agentId}-${index}`}>
              <span className="font-medium text-[var(--md-on-surface)]">{entry.agentId}</span>
              {": "}
              {entry.status}
              {" — "}
              {entry.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function createSelectHandler(
  findingId: string,
  onSelectFinding: (id: string) => void,
): () => void {
  return function handleSelectFinding(): void {
    onSelectFinding(findingId);
  };
}
