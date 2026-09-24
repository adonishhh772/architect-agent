import type { PersistedReportRecord } from "../../persistence/indexedDbStore";

const EMPTY_RUNS_MESSAGE = "No saved runs yet. Finish a threat model and it will appear here.";

interface RunHistoryProps {
  runs: PersistedReportRecord[];
  selectedRunId: string | null;
  error: string | null;
  onSelectRun: (runId: string) => void;
}

export function RunHistory({ runs, selectedRunId, error, onSelectRun }: RunHistoryProps): JSX.Element {
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
        <ul className="space-y-2">
          {runs.map((run) => (
            <RunHistoryItem
              key={run.id}
              run={run}
              selected={run.id === selectedRunId}
              onSelectRun={onSelectRun}
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
}

function RunHistoryItem({ run, selected, onSelectRun }: RunHistoryItemProps): JSX.Element {
  const handleSelect = (): void => {
    onSelectRun(run.id);
  };
  const repositoryName = run.report.repository.name ?? run.report.title;
  const analyzedAt = formatRunTime(run.report.repository.analyzedAt || run.savedAt);

  return (
    <li>
      <button
        type="button"
        className={`w-full rounded-xl border px-4 py-3 text-left transition ${
          selected
            ? "border-[var(--md-primary)] bg-[var(--md-primary-container)]/40"
            : "border-[var(--md-outline)]/30 bg-[var(--md-surface-container-high)]/40"
        }`}
        data-testid={`run-history-${run.id}`}
        aria-pressed={selected}
        onClick={handleSelect}
      >
        <span className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-[var(--md-on-surface)]">{run.report.title}</span>
          <span className="text-xs text-[var(--md-on-surface-variant)]">{analyzedAt}</span>
        </span>
        <span className="mt-1 block text-sm text-[var(--md-on-surface-variant)]">
          {repositoryName} · {run.report.findings.length} findings · {run.report.budget.requestsUsed} requests ·{" "}
          {run.report.budget.tokensUsed} tokens
        </span>
      </button>
    </li>
  );
}

function formatRunTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}
