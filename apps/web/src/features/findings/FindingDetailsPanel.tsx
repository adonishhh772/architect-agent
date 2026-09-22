import type { Finding } from "@sentinel/schema";
import { FileSearch } from "lucide-react";

interface FindingDetailsPanelProps {
  finding?: Finding;
}

export function FindingDetailsPanel({ finding }: FindingDetailsPanelProps): JSX.Element {
  if (!finding) {
    return (
      <div
        className="md-elevated-card flex min-h-[280px] flex-col items-center justify-center text-center"
        data-testid="finding-details-empty"
      >
        <FileSearch className="mb-3 h-10 w-10 text-[var(--md-on-surface-variant)]" aria-hidden />
        <p className="text-sm text-[var(--md-on-surface-variant)]">
          Select a finding to inspect evidence, STRIDE tags, and mitigation guidance.
        </p>
      </div>
    );
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
