import type { AnalysisReport, Finding } from "@sentinel/schema";
import { STRIDE_CATEGORY } from "@sentinel/schema";
import { Shield } from "lucide-react";
import { useMemo } from "react";

const STRIDE_LABELS: Record<(typeof STRIDE_CATEGORY)[keyof typeof STRIDE_CATEGORY], string> = {
  [STRIDE_CATEGORY.SPOOFING]: "Spoofing",
  [STRIDE_CATEGORY.TAMPERING]: "Tampering",
  [STRIDE_CATEGORY.REPUDIATION]: "Repudiation",
  [STRIDE_CATEGORY.INFORMATION_DISCLOSURE]: "Information disclosure",
  [STRIDE_CATEGORY.DENIAL_OF_SERVICE]: "Denial of service",
  [STRIDE_CATEGORY.ELEVATION_OF_PRIVILEGE]: "Elevation of privilege",
};

interface StrideThreatModelPanelProps {
  report: AnalysisReport;
  onSelectFinding: (findingId: string) => void;
}

export function StrideThreatModelPanel({
  report,
  onSelectFinding,
}: StrideThreatModelPanelProps): JSX.Element {
  const findingsByStride = useMemo(() => {
    const grouped = new Map<string, Finding[]>();
    for (const strideKey of Object.values(STRIDE_CATEGORY)) {
      grouped.set(strideKey, []);
    }
    for (const finding of report.findings) {
      if (finding.strideCategories.length === 0) {
        continue;
      }
      for (const strideCategory of finding.strideCategories) {
        const bucket = grouped.get(strideCategory) ?? [];
        bucket.push(finding);
        grouped.set(strideCategory, bucket);
      }
    }
    return grouped;
  }, [report.findings]);

  return (
    <section className="md-elevated-card space-y-4" data-testid="stride-threat-model">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-[var(--color-neon-pink)]" aria-hidden />
        <h3 className="text-lg font-semibold text-[var(--md-on-surface)]">STRIDE threat model</h3>
      </div>
      <p className="text-sm leading-relaxed text-[var(--md-on-surface-variant)]">
        {report.executiveSummary}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {Object.values(STRIDE_CATEGORY).map((strideKey) => {
          const findings = findingsByStride.get(strideKey) ?? [];
          return (
            <article
              key={strideKey}
              className="rounded-xl border border-[var(--md-outline)]/30 bg-[var(--md-surface-container-high)]/50 p-4"
              data-testid={`stride-section-${strideKey}`}
            >
              <h4 className="text-sm font-semibold uppercase tracking-wide text-[var(--md-primary)]">
                {STRIDE_LABELS[strideKey]}
              </h4>
              {findings.length === 0 ? (
                <p className="mt-2 text-xs text-[var(--md-on-surface-variant)]">
                  No mapped threats in this category for the current evidence set.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {findings.map((finding) => (
                    <li key={`${strideKey}-${finding.id}`}>
                      <button
                        type="button"
                        className="w-full rounded-lg border border-transparent px-2 py-2 text-left transition hover:border-[var(--md-primary)]/30 hover:bg-[var(--md-primary-container)]/20"
                        onClick={() => onSelectFinding(finding.id)}
                      >
                        <p className="text-sm font-medium text-[var(--md-on-surface)]">{finding.title}</p>
                        <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-[var(--md-on-surface-variant)]">
                          {finding.scenario}
                        </p>
                        {finding.trustBoundaryCrossings.length > 0 && (
                          <p className="mt-1 text-[10px] text-[var(--md-on-surface-variant)]">
                            Boundaries: {finding.trustBoundaryCrossings.join(" · ")}
                          </p>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
      {report.attackPaths.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-[var(--md-on-surface)]">Attack paths</h4>
          <ul className="mt-2 space-y-2">
            {report.attackPaths.map((path) => (
              <li
                key={path.id}
                className="rounded-lg border border-[var(--md-outline)]/25 px-3 py-2 text-sm text-[var(--md-on-surface-variant)]"
              >
                <p className="font-medium text-[var(--md-on-surface)]">{path.title}</p>
                <p className="mt-1 text-xs leading-relaxed">{path.description}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
