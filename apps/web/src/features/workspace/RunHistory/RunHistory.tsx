import { ChevronRight, Download, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { PersistedReportRecord } from "../../persistence/indexedDbStore";
import { DELETE_WORKSPACE_LABEL, DELETING_WORKSPACE_LABEL, EXPORT_WORKSPACE_LABEL } from "../workspaceView";
import {
  findingCountLabel,
  HIGH_FINDING_RISK,
  recommendationCountLabel,
  summarizeWorkspaceRun,
} from "../workspaceRunSummary";

const EMPTY_RUNS_MESSAGE = "No workspaces yet. Inspect a repository to create the first report.";

interface RunHistoryProps {
  runs: PersistedReportRecord[];
  selectedRunId: string | null;
  error: string | null;
  onSelectRun: (runId: string) => void;
  onExportRun: (runId: string) => void;
  onDeleteRun: (runId: string) => void;
  deletingRunId: string | null;
  openRunContent: ReactNode | null;
}

export function RunHistory({
  runs,
  selectedRunId,
  error,
  onSelectRun,
  onExportRun,
  onDeleteRun,
  deletingRunId,
  openRunContent,
}: RunHistoryProps): JSX.Element {
  return (
    <div className="space-y-3" data-testid="run-history">
      {error && (
        <p className="text-sm text-[var(--color-neon-pink)]" data-testid="run-history-error">
          {error}
        </p>
      )}
      {runs.length === 0 ? (
        <p className="text-sm text-[var(--md-on-surface-variant)]" data-testid="run-history-empty">
          {EMPTY_RUNS_MESSAGE}
        </p>
      ) : (
        <ul className="space-y-3">
          {runs.map((run) => (
            <RunHistoryItem
              key={run.id}
              run={run}
              selected={run.id === selectedRunId}
              onSelectRun={onSelectRun}
              onExportRun={onExportRun}
              onDeleteRun={onDeleteRun}
              deleting={deletingRunId === run.id}
              openRunContent={run.id === selectedRunId ? openRunContent : null}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface RunHistoryItemProps {
  run: PersistedReportRecord;
  selected: boolean;
  onSelectRun: (runId: string) => void;
  onExportRun: (runId: string) => void;
  onDeleteRun: (runId: string) => void;
  deleting: boolean;
  openRunContent: ReactNode | null;
}

function RunHistoryItem({
  run,
  selected,
  onSelectRun,
  onExportRun,
  onDeleteRun,
  deleting,
  openRunContent,
}: RunHistoryItemProps): JSX.Element {
  const summary = summarizeWorkspaceRun(run);
  const analyzedAt = formatRunTime(summary.analyzedAt);

  const handleSelect = (): void => {
    onSelectRun(run.id);
  };

  const handleExport = (): void => {
    onExportRun(run.id);
  };

  const handleDelete = (): void => {
    onDeleteRun(run.id);
  };

  return (
    <li
      className={`overflow-hidden rounded-2xl border transition duration-200 ${
        selected
          ? "border-[var(--md-primary)]/50 bg-[var(--md-surface-container)] shadow-[var(--sentinel-card-shadow)]"
          : "border-[var(--md-outline)]/30 bg-[var(--md-surface-container-high)]/40 hover:border-[var(--md-primary)]/35"
      }`}
    >
      <div className="flex items-start">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-start gap-3 px-4 py-4 text-left"
        data-testid={`run-history-${run.id}`}
        aria-expanded={selected}
        onClick={handleSelect}
      >
        <ChevronRight
          className={`mt-1 h-4 w-4 shrink-0 text-[var(--md-primary)] transition ${selected ? "rotate-90" : ""}`}
          aria-hidden
        />
        <span className={`mt-1 h-10 w-1 shrink-0 rounded-full ${riskStripeClass(summary.highestRisk)}`} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-display text-base font-semibold text-[var(--md-on-surface)]">{summary.title}</span>
            <span className="text-xs text-[var(--md-on-surface-variant)]">{analyzedAt}</span>
          </span>
          <span className="mt-1 block text-sm text-[var(--md-on-surface-variant)]">
            {summary.repositoryName} · {findingCountLabel(summary.findingCount)} ·{" "}
            {recommendationCountLabel(summary.recommendationCount)}
          </span>
        </span>
      </button>
      <div className="mr-3 mt-3 flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-medium text-[var(--md-primary)] hover:bg-[var(--md-primary-container)]/40"
          data-testid={`export-workspace-${run.id}`}
          aria-label={`${EXPORT_WORKSPACE_LABEL} ${summary.title}`}
          onClick={handleExport}
        >
          <Download className="h-4 w-4" aria-hidden />
          {EXPORT_WORKSPACE_LABEL}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-medium text-[var(--color-neon-pink)] hover:bg-[var(--color-neon-pink)]/10 disabled:opacity-50"
          data-testid={`delete-workspace-${run.id}`}
          aria-label={`${DELETE_WORKSPACE_LABEL} ${summary.title}`}
          disabled={deleting}
          onClick={handleDelete}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          {deleting ? DELETING_WORKSPACE_LABEL : DELETE_WORKSPACE_LABEL}
        </button>
      </div>
      </div>
      {selected && openRunContent && (
        <div className="border-t border-[var(--md-outline)]/25 px-4 py-5" data-testid={`run-report-${run.id}`}>
          {openRunContent}
        </div>
      )}
    </li>
  );
}

function riskStripeClass(highestRisk: number | null): string {
  if (highestRisk === null) {
    return "bg-[var(--md-outline)]";
  }
  if (highestRisk >= HIGH_FINDING_RISK) {
    return "bg-[var(--color-neon-pink)]";
  }
  return "bg-[var(--color-neon-green)]";
}

function formatRunTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}
