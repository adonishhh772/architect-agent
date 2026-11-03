import type { AnalysisReport, Finding } from "@sentinel/schema";
import { STRIDE_CATEGORY } from "@sentinel/schema";
import { Shield } from "lucide-react";
import { useMemo, useState } from "react";
import { splitSummarySentences } from "./strideSummary";
import { collapseFindingsByTitle } from "./uniqueFindings";

const STRIDE_LABELS: Record<(typeof STRIDE_CATEGORY)[keyof typeof STRIDE_CATEGORY], string> = {
  [STRIDE_CATEGORY.SPOOFING]: "Spoofing",
  [STRIDE_CATEGORY.TAMPERING]: "Tampering",
  [STRIDE_CATEGORY.REPUDIATION]: "Repudiation",
  [STRIDE_CATEGORY.INFORMATION_DISCLOSURE]: "Information disclosure",
  [STRIDE_CATEGORY.DENIAL_OF_SERVICE]: "Denial of service",
  [STRIDE_CATEGORY.ELEVATION_OF_PRIVILEGE]: "Elevation of privilege",
};

const SECTION_SCROLL = "max-h-64 overflow-y-auto pr-2";

interface StrideThreatModelPanelProps {
  report: AnalysisReport;
  onSelectFinding: (findingId: string) => void;
}

export function StrideThreatModelPanel({
  report,
  onSelectFinding,
}: StrideThreatModelPanelProps): JSX.Element {
  const findingsByStride = useMemo(
    () => groupFindingsByStride(collapseFindingsByTitle(report.findings)),
    [report.findings],
  );
  const sentences = splitSummarySentences(report.executiveSummary);
  const [openStride, setOpenStride] = useState<string>(STRIDE_CATEGORY.SPOOFING);

  function toggleStride(strideKey: string): void {
    setOpenStride((current) => (current === strideKey ? "" : strideKey));
  }

  return (
    <section className="surface-inset space-y-4" data-testid="stride-threat-model">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-[var(--color-neon-pink)]" aria-hidden />
        <h3 className="text-lg font-semibold text-[var(--md-on-surface)]">STRIDE threat model</h3>
      </div>
      <div data-testid="stride-summary">
        <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-[var(--md-on-surface-variant)]">
          {sentences.map((sentence) => (
            <li key={sentence}>{sentence}</li>
          ))}
        </ol>
      </div>
      <div className="space-y-3">
        {Object.values(STRIDE_CATEGORY).map((strideKey) => (
          <StrideCategory
            key={strideKey}
            strideKey={strideKey}
            findings={findingsByStride.get(strideKey) ?? []}
            open={openStride === strideKey}
            onToggle={toggleStride}
            onSelectFinding={onSelectFinding}
          />
        ))}
      </div>
      {report.attackPaths.length > 0 && (
        <AttackPathList paths={report.attackPaths} />
      )}
    </section>
  );
}

function groupFindingsByStride(findings: Finding[]): Map<string, Finding[]> {
  const grouped = new Map<string, Finding[]>();
  for (const strideKey of Object.values(STRIDE_CATEGORY)) {
    grouped.set(strideKey, []);
  }
  for (const finding of findings) {
    for (const strideCategory of finding.strideCategories) {
      const bucket = grouped.get(strideCategory) ?? [];
      bucket.push(finding);
      grouped.set(strideCategory, bucket);
    }
  }
  return grouped;
}

function StrideCategory({
  strideKey,
  findings,
  open,
  onToggle,
  onSelectFinding,
}: {
  strideKey: (typeof STRIDE_CATEGORY)[keyof typeof STRIDE_CATEGORY];
  findings: Finding[];
  open: boolean;
  onToggle: (strideKey: string) => void;
  onSelectFinding: (findingId: string) => void;
}): JSX.Element {
  function handleToggle(): void {
    onToggle(strideKey);
  }

  return (
    <article className="rounded-xl border border-[var(--md-outline)]/30 bg-[var(--md-surface-container-high)]/50" data-testid={`stride-section-${strideKey}`}>
      <h4>
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 text-left"
          aria-expanded={open}
          data-testid={`stride-toggle-${strideKey}`}
          onClick={handleToggle}
        >
          <span className="text-sm font-semibold uppercase tracking-wide text-[var(--md-primary)]">
            {STRIDE_LABELS[strideKey]}
            <span className="ml-2 font-normal normal-case tracking-normal text-[var(--md-on-surface-variant)]">
              {findings.length}
            </span>
          </span>
        </button>
      </h4>
      {open && (
        <div className={`${SECTION_SCROLL} border-t border-[var(--md-outline)]/20 px-4 py-3`}>
          {findings.length === 0 ? (
            <p className="text-xs text-[var(--md-on-surface-variant)]">No mapped threats in this category for the current evidence set.</p>
          ) : (
            <ol className="list-decimal space-y-3 pl-5">
              {findings.map((finding) => (
                <StrideFinding key={`${strideKey}-${finding.id}`} finding={finding} onSelectFinding={onSelectFinding} />
              ))}
            </ol>
          )}
        </div>
      )}
    </article>
  );
}

function StrideFinding({
  finding,
  onSelectFinding,
}: {
  finding: Finding;
  onSelectFinding: (findingId: string) => void;
}): JSX.Element {
  function handleSelect(): void {
    onSelectFinding(finding.id);
  }

  return (
    <li>
      <button type="button" className="w-full rounded-lg px-2 py-2 text-left hover:bg-[var(--md-primary-container)]/20" onClick={handleSelect}>
        <p className="text-sm font-medium text-[var(--md-on-surface)]">{finding.title}</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--md-on-surface-variant)]">{finding.scenario}</p>
      </button>
    </li>
  );
}

function AttackPathList({ paths }: { paths: AnalysisReport["attackPaths"] }): JSX.Element {
  const [open, setOpen] = useState(true);

  function handleToggle(): void {
    setOpen((current) => !current);
  }

  return (
    <div className="rounded-xl border border-[var(--md-outline)]/30" data-testid="stride-attack-paths">
      <button type="button" className="w-full px-4 py-3 text-left text-sm font-semibold text-[var(--md-on-surface)]" aria-expanded={open} onClick={handleToggle}>
        Attack paths
      </button>
      {open && (
        <ol className={`${SECTION_SCROLL} list-decimal space-y-3 border-t border-[var(--md-outline)]/20 px-4 py-3 pl-9`}>
          {paths.map((path) => (
            <li key={path.id} className="text-sm text-[var(--md-on-surface-variant)]">
              <p className="font-medium text-[var(--md-on-surface)]">{path.title}</p>
              <p className="mt-1 text-xs leading-relaxed">{path.description}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
