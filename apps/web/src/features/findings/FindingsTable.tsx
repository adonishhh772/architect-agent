import { FINDING_CATEGORY, FINDING_DISPOSITION, FINDING_STATUS, type Finding } from "@sentinel/schema";
import { useMemo, useState, type ChangeEvent } from "react";
import { FindingDetailsPanel } from "./FindingDetailsPanel";
import { HIGH_FINDING_RISK } from "../workspace/workspaceRunSummary";
import { citedFileCount } from "./uniqueFindings";

const FINDINGS_FILTER = {
  ALL: "all",
} as const;

const EMPTY_FILTER_MESSAGE = "No findings match this filter.";
const MODERATE_FINDING_RISK = 9;

const STATUS_LABEL: Record<(typeof FINDING_STATUS)[keyof typeof FINDING_STATUS], string> = {
  [FINDING_STATUS.CODE_SUPPORTED]: "Code supported",
  [FINDING_STATUS.PLAUSIBLE_THREAT]: "Needs check",
  [FINDING_STATUS.ARCHITECTURE_CONCERN]: "Architecture",
  [FINDING_STATUS.INSUFFICIENT_EVIDENCE]: "Thin evidence",
};

type DispositionValue = (typeof FINDING_DISPOSITION)[keyof typeof FINDING_DISPOSITION];

interface FindingsBoardProps {
  findings: Finding[];
  selectedFinding?: Finding;
  onSelectFinding: (findingId: string) => void;
  onDispositionChange?: (stableKey: string, disposition: DispositionValue) => void;
}

export function FindingsBoard({
  findings,
  selectedFinding,
  onSelectFinding,
  onDispositionChange,
}: FindingsBoardProps): JSX.Element {
  return (
    <div
      className={
        selectedFinding
          ? "grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.7fr)]"
          : "min-w-0"
      }
      data-testid="findings-board"
    >
      <FindingsTable
        findings={findings}
        selectedFindingId={selectedFinding?.id}
        onSelectFinding={onSelectFinding}
      />
      {selectedFinding ? (
        <FindingDetailsPanel finding={selectedFinding} onDispositionChange={onDispositionChange} />
      ) : null}
    </div>
  );
}

interface FindingsTableProps {
  findings: Finding[];
  selectedFindingId?: string;
  onSelectFinding: (findingId: string) => void;
}

export function FindingsTable({
  findings,
  selectedFindingId,
  onSelectFinding,
}: FindingsTableProps): JSX.Element {
  const [categoryFilter, setCategoryFilter] = useState<string>(FINDINGS_FILTER.ALL);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => filterFindings(findings, categoryFilter, query), [findings, categoryFilter, query]);

  function handleQueryChange(event: ChangeEvent<HTMLInputElement>): void {
    setQuery(event.target.value);
  }

  function handleCategoryChange(event: ChangeEvent<HTMLSelectElement>): void {
    setCategoryFilter(event.target.value);
  }

  function handleSelectFinding(findingId: string): void {
    onSelectFinding(findingId);
  }

  return (
    <div className="space-y-3" data-testid="findings-table">
      <div className="flex flex-wrap gap-2">
        <input
          className="glass-input max-w-xs"
          placeholder="Filter findings"
          value={query}
          onChange={handleQueryChange}
          aria-label="Filter findings"
        />
        <select
          className="glass-input max-w-xs"
          value={categoryFilter}
          onChange={handleCategoryChange}
          aria-label="Category filter"
        >
          <option value={FINDINGS_FILTER.ALL}>All categories</option>
          <option value={FINDING_CATEGORY.ARCHITECTURE}>Architecture</option>
          <option value={FINDING_CATEGORY.SECURITY}>Security</option>
          <option value={FINDING_CATEGORY.AI_SECURITY}>AI security</option>
        </select>
      </div>
      <div
        className="max-h-[32rem] overflow-auto rounded-2xl border border-[var(--md-outline)]/30"
        data-testid="findings-table-scroll"
      >
        <table className="data-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Title</th>
              <th>Files</th>
              <th>Risk</th>
              <th>Lifecycle</th>
              <th>Category</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-sm text-[var(--md-on-surface-variant)]">
                  {EMPTY_FILTER_MESSAGE}
                </td>
              </tr>
            ) : (
              filtered.map((finding) => (
                <FindingRow
                  key={finding.id}
                  finding={finding}
                  selected={selectedFindingId === finding.id}
                  onSelectFinding={handleSelectFinding}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface FindingRowProps {
  finding: Finding;
  selected: boolean;
  onSelectFinding: (findingId: string) => void;
}

function FindingRow({ finding, selected, onSelectFinding }: FindingRowProps): JSX.Element {
  function handleClick(): void {
    onSelectFinding(finding.id);
  }

  return (
    <tr
      className={`cursor-pointer ${selected ? "bg-[var(--md-primary-container)]/55" : ""}`}
      onClick={handleClick}
    >
      <td className="whitespace-nowrap">{finding.remediationRank ?? "—"}</td>
      <td className="min-w-64 max-w-md font-medium">{finding.title}</td>
      <td className="whitespace-nowrap">{citedFileCount(finding)}</td>
      <td className="whitespace-nowrap">
        <span className={`meta-pill ${riskPillClass(finding.riskScore)}`}>{finding.riskScore ?? "—"}</span>
      </td>
      <td className="whitespace-nowrap">{readableLabel(finding.lifecycle ?? "open")}</td>
      <td className="whitespace-nowrap">{readableLabel(finding.category)}</td>
      <td className="whitespace-nowrap">
        <span className="meta-pill bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)]">
          {statusLabel(finding.status)}
        </span>
      </td>
    </tr>
  );
}

function statusLabel(status: string): string {
  if (isKnownStatus(status)) {
    return STATUS_LABEL[status];
  }
  return readableLabel(status);
}

function isKnownStatus(status: string): status is keyof typeof STATUS_LABEL {
  return Object.values(FINDING_STATUS).some((knownStatus) => knownStatus === status);
}

function readableLabel(value: string): string {
  return value.split("_").join(" ");
}

function riskPillClass(riskScore: number | undefined): string {
  if (riskScore === undefined) {
    return "bg-[var(--md-surface-container-high)] text-[var(--md-on-surface-variant)]";
  }
  if (riskScore >= HIGH_FINDING_RISK) {
    return "bg-[var(--color-neon-pink)]/15 text-[var(--color-neon-pink)]";
  }
  if (riskScore >= MODERATE_FINDING_RISK) {
    return "bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)]";
  }
  return "bg-[var(--color-neon-green)]/15 text-[var(--color-neon-green)]";
}

function filterFindings(findings: Finding[], categoryFilter: string, query: string): Finding[] {
  const normalizedQuery = query.toLowerCase();
  return findings.filter((finding) => {
    if (categoryFilter !== FINDINGS_FILTER.ALL && finding.category !== categoryFilter) {
      return false;
    }
    if (normalizedQuery && !finding.title.toLowerCase().includes(normalizedQuery)) {
      return false;
    }
    return true;
  });
}
