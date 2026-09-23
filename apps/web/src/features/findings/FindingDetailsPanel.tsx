import { FINDING_DISPOSITION, type Finding } from "@sentinel/schema";
import { FileSearch } from "lucide-react";
import type { MouseEvent } from "react";

const DISPOSITION_OPTIONS = [
  FINDING_DISPOSITION.CONFIRMED,
  FINDING_DISPOSITION.FALSE_POSITIVE,
  FINDING_DISPOSITION.ACCEPTED_RISK,
] as const;

type DispositionValue = (typeof DISPOSITION_OPTIONS)[number];

interface FindingDetailsPanelProps {
  finding?: Finding;
  onDispositionChange?: (stableKey: string, disposition: DispositionValue) => void;
}

export function FindingDetailsPanel({ finding, onDispositionChange }: FindingDetailsPanelProps): JSX.Element {
  if (!finding) {
    return (
      <div
        className="md-elevated-card flex min-h-[280px] flex-col items-center justify-center text-center"
        data-testid="finding-details-empty"
      >
        <FileSearch className="mb-3 h-10 w-10 text-[var(--md-on-surface-variant)]" aria-hidden />
        <p className="text-sm text-[var(--md-on-surface-variant)]">
          Select a finding to inspect evidence, framework tags, and mitigation guidance.
        </p>
      </div>
    );
  }

  function handleDispositionClick(event: MouseEvent<HTMLButtonElement>): void {
    const disposition = event.currentTarget.dataset.disposition;
    if (!onDispositionChange || !isDisposition(disposition)) {
      return;
    }
    onDispositionChange(finding.stableKey, disposition);
  }

  return (
    <article className="md-elevated-card space-y-4" data-testid="finding-details">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--md-on-surface-variant)]">
          {finding.id}
        </p>
        <h3 className="font-display mt-1 text-xl font-semibold text-[var(--md-on-surface)]">{finding.title}</h3>
      </header>
      <p className="text-sm leading-relaxed text-[var(--md-on-surface-variant)]">{finding.scenario}</p>
      {(finding.cweIds ?? []).length > 0 && (
        <p className="text-sm text-[var(--md-on-surface-variant)]" data-testid="finding-cwe">
          <span className="font-semibold text-[var(--md-on-surface)]">CWE:</span> {(finding.cweIds ?? []).join(", ")}
          {finding.language ? ` · ${finding.language}` : ""}
        </p>
      )}
      {finding.remediationDiff && (
        <pre
          className="overflow-x-auto rounded-lg bg-[var(--md-surface-container-high)]/70 p-3 text-xs text-[var(--md-on-surface)]"
          data-testid="finding-remediation-diff"
        >
          {finding.remediationDiff}
        </pre>
      )}
      {onDispositionChange && (
        <div className="flex flex-wrap gap-2" data-testid="finding-disposition">
          {DISPOSITION_OPTIONS.map((disposition) => (
            <button
              key={disposition}
              type="button"
              data-disposition={disposition}
              data-testid={`disposition-${disposition}`}
              className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-[var(--md-outline)]/40"
              onClick={handleDispositionClick}
            >
              {disposition.split("_").join(" ")}
            </button>
          ))}
        </div>
      )}
      <div>
        <h4 className="text-sm font-semibold text-[var(--md-on-surface)]">Mitigation</h4>
        <p className="mt-1 text-sm text-[var(--md-on-surface-variant)]">{finding.mitigation}</p>
      </div>
      {finding.strideCategories.length > 0 && (
        <p className="text-sm text-[var(--md-on-surface-variant)]">
          <span className="font-semibold text-[var(--md-on-surface)]">STRIDE:</span>{" "}
          {finding.strideCategories.join(", ")}
        </p>
      )}
      {(finding.owaspCategories ?? []).length > 0 && (
        <p className="text-sm text-[var(--md-on-surface-variant)]">
          <span className="font-semibold text-[var(--md-on-surface)]">OWASP:</span>{" "}
          {(finding.owaspCategories ?? []).join(", ")}
        </p>
      )}
      {(finding.atlasTechniqueIds ?? []).length > 0 && (
        <p className="text-sm text-[var(--md-on-surface-variant)]">
          <span className="font-semibold text-[var(--md-on-surface)]">MITRE ATLAS:</span>{" "}
          {(finding.atlasTechniqueIds ?? []).join(", ")}
        </p>
      )}
      {finding.riskScore !== undefined && (
        <p className="text-sm text-[var(--md-on-surface-variant)]" data-testid="finding-risk">
          <span className="font-semibold text-[var(--md-on-surface)]">Risk:</span> {finding.riskScore}{" "}
          (impact {finding.impact ?? "—"}, likelihood {finding.likelihood ?? "—"}, rank{" "}
          {finding.remediationRank ?? "duplicate"})
          {finding.lifecycle ? `, ${finding.lifecycle}` : ""}
        </p>
      )}
      {finding.dataFlow && (
        <div data-testid="finding-data-flow">
          <h4 className="text-sm font-semibold text-[var(--md-on-surface)]">Data flow</h4>
          <p className="mt-1 text-sm text-[var(--md-on-surface-variant)]">{finding.dataFlow.summary}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[var(--md-on-surface-variant)]">
            {finding.dataFlow.steps.map((step) => (
              <li key={`${step.role}:${step.path}:${step.line ?? 0}`}>
                {step.role}: {step.label} ({step.path}
                {step.line ? `:${step.line}` : ""})
              </li>
            ))}
          </ol>
        </div>
      )}
      {(finding.riskDomains ?? []).length > 0 && (
        <p className="text-sm text-[var(--md-on-surface-variant)]">
          <span className="font-semibold text-[var(--md-on-surface)]">Risk domains:</span>{" "}
          {(finding.riskDomains ?? []).join(", ")}
        </p>
      )}
      {finding.preconditions.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-[var(--md-on-surface)]">Preconditions</h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--md-on-surface-variant)]">
            {finding.preconditions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {finding.trustBoundaryCrossings.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-[var(--md-on-surface)]">Trust boundary crossings</h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--md-on-surface-variant)]">
            {finding.trustBoundaryCrossings.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {(finding.severityRationale || finding.likelihoodRationale) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {finding.severityRationale && (
            <div>
              <h4 className="text-sm font-semibold text-[var(--md-on-surface)]">Severity rationale</h4>
              <p className="mt-1 text-sm text-[var(--md-on-surface-variant)]">{finding.severityRationale}</p>
            </div>
          )}
          {finding.likelihoodRationale && (
            <div>
              <h4 className="text-sm font-semibold text-[var(--md-on-surface)]">Likelihood rationale</h4>
              <p className="mt-1 text-sm text-[var(--md-on-surface-variant)]">{finding.likelihoodRationale}</p>
            </div>
          )}
        </div>
      )}
      {finding.references.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-[var(--md-on-surface)]">Evidence references</h4>
          <ul className="mt-2 space-y-1 text-sm">
            {finding.references.map((ref) => (
              <li
                key={`${ref.path}-${ref.startLine ?? 0}`}
                className="rounded-lg bg-[var(--md-surface-container-high)]/60 px-2 py-1 font-mono text-xs"
              >
                {ref.path}
                {ref.startLine !== undefined ? `:${ref.startLine}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      {finding.openQuestions.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-[var(--md-on-surface)]">Open questions</h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--md-on-surface-variant)]">
            {finding.openQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function isDisposition(value: string | undefined): value is DispositionValue {
  return DISPOSITION_OPTIONS.some((option) => option === value);
}
