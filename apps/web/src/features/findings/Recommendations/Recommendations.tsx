import type { AnalysisReport } from "@sentinel/schema";
import { citationOmissionNote } from "@sentinel/analysis";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

interface RecommendationsProps {
  recommendations: AnalysisReport["recommendations"];
  onSelectCitation: (path: string) => void;
}

export function Recommendations({ recommendations, onSelectCitation }: RecommendationsProps): JSX.Element {
  if (recommendations.length === 0) {
    return (
      <p className="text-sm text-[var(--md-on-surface-variant)]" data-testid="recommendations-empty">
        No recommendations for this run.
      </p>
    );
  }

  return (
    <ol className="max-h-[32rem] space-y-4 overflow-y-auto pr-1" data-testid="recommendations">
      {collapseRecommendations(recommendations).map((recommendation) => (
        <RecommendationItem key={recommendation.id} recommendation={recommendation} onSelectCitation={onSelectCitation} />
      ))}
    </ol>
  );
}

interface RecommendationItemProps {
  recommendation: AnalysisReport["recommendations"][number];
  onSelectCitation: (path: string) => void;
}

function collapseRecommendations(
  recommendations: AnalysisReport["recommendations"],
): AnalysisReport["recommendations"] {
  const grouped = new Map<string, AnalysisReport["recommendations"][number]>();
  for (const recommendation of recommendations) {
    const titleKey = recommendation.title.trim().toLowerCase();
    const existing = grouped.get(titleKey);
    if (!existing) {
      grouped.set(titleKey, {
        ...recommendation,
        citations: [...(recommendation.citations ?? [])],
        relatedFindingIds: [...recommendation.relatedFindingIds],
      });
      continue;
    }
    const citations = [...(existing.citations ?? [])];
    for (const citation of recommendation.citations ?? []) {
      const alreadyCited = citations.some((item) => item.path === citation.path && item.startLine === citation.startLine);
      if (!alreadyCited) {
        citations.push(citation);
      }
    }
    grouped.set(titleKey, {
      ...existing,
      citations,
      relatedFindingIds: [...existing.relatedFindingIds, ...recommendation.relatedFindingIds],
      omittedFileCount: (existing.omittedFileCount ?? 0) + (recommendation.omittedFileCount ?? 0),
    });
  }
  return [...grouped.values()];
}

function RecommendationItem({ recommendation, onSelectCitation }: RecommendationItemProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const citations = recommendation.citations ?? [];

  function handleToggle(): void {
    setOpen((current) => !current);
  }

  return (
    <li
      className="rounded-xl border border-[var(--md-outline)]/25 bg-[var(--md-surface-container-high)]/40"
      data-testid={`recommendation-${recommendation.id}`}
    >
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 p-4 text-left"
        aria-expanded={open}
        data-testid={`recommendation-toggle-${recommendation.id}`}
        onClick={handleToggle}
      >
        <span>
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--md-primary)]">
            Priority {recommendation.priority}
          </span>
          <span className="mt-1 block font-display text-lg font-semibold text-[var(--md-on-surface)]">
            {recommendation.title}
          </span>
        </span>
        <ChevronDown
          className={`mt-1 h-4 w-4 shrink-0 text-[var(--md-primary)] transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="px-4 pb-4" data-testid={`recommendation-detail-${recommendation.id}`}>
          <p className="text-sm leading-relaxed text-[var(--md-on-surface-variant)]">{recommendation.description}</p>
          {recommendation.rationale && (
            <p className="mt-2 text-sm leading-relaxed text-[var(--md-on-surface-variant)]">{recommendation.rationale}</p>
          )}
          <CitedFiles
            citations={citations}
            omittedFileCount={recommendation.omittedFileCount ?? 0}
            onSelectCitation={onSelectCitation}
          />
        </div>
      )}
    </li>
  );
}

interface CitedFilesProps {
  citations: AnalysisReport["recommendations"][number]["citations"];
  omittedFileCount: number;
  onSelectCitation: (path: string) => void;
}

function CitedFiles({ citations, omittedFileCount, onSelectCitation }: CitedFilesProps): JSX.Element {
  const omissionNote = citationOmissionNote(omittedFileCount);
  if (citations.length === 0 && !omissionNote) {
    return <p className="mt-3 text-sm text-[var(--md-on-surface-variant)]">No file citation was recorded.</p>;
  }

  return (
    <div className="mt-3">
      <h4 className="text-sm font-semibold text-[var(--md-on-surface)]">Cited files</h4>
      <ul className="mt-2 space-y-1">
        {citations.map((citation) => (
          <CitationButton key={citationLabel(citation)} citation={citation} onSelectCitation={onSelectCitation} />
        ))}
      </ul>
      {omissionNote && (
        <p className="mt-2 text-sm text-[var(--md-on-surface-variant)]" data-testid="citation-omission">
          {omissionNote}
        </p>
      )}
    </div>
  );
}

interface CitationButtonProps {
  citation: AnalysisReport["recommendations"][number]["citations"][number];
  onSelectCitation: (path: string) => void;
}

function CitationButton({ citation, onSelectCitation }: CitationButtonProps): JSX.Element {
  function handleClick(): void {
    onSelectCitation(citation.path);
  }

  return (
    <li>
      <button type="button" className="rounded-lg bg-[var(--md-surface-container-high)]/70 px-2 py-1 font-mono text-xs text-[var(--md-primary)] underline" onClick={handleClick}>
        {citationLabel(citation)}
      </button>
    </li>
  );
}

function citationLabel(citation: AnalysisReport["recommendations"][number]["citations"][number]): string {
  if (citation.startLine === undefined) {
    return citation.path;
  }
  if (citation.endLine === undefined || citation.endLine === citation.startLine) {
    return `${citation.path}:${citation.startLine}`;
  }
  return `${citation.path}:${citation.startLine}-${citation.endLine}`;
}
