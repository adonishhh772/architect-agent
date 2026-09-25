import { FINDING_CATEGORY, type Finding } from "@sentinel/schema";
import { useMemo, useState, type ChangeEvent } from "react";
import { HIGH_FINDING_RISK } from "../workspace/workspaceRunSummary";
import { citedFileCount } from "./uniqueFindings";

const FINDINGS_FILTER = {
  ALL: "all",
} as const;

const EMPTY_FILTER_MESSAGE = "No findings match this filter.";
const MODERATE_FINDING_RISK = 9;

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
      <div className="overflow-x-auto rounded-2xl border border-[var(--md-outline)]/30">
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
      <td>{finding.remediationRank ?? "—"}</td>
      <td className="font-medium">{finding.title}</td>
      <td>{citedFileCount(finding)}</td>
      <td>
        <span className={`meta-pill ${riskPillClass(finding.riskScore)}`}>{finding.riskScore ?? "—"}</span>
      </td>
      <td>{readableLabel(finding.lifecycle ?? "open")}</td>
      <td>{readableLabel(finding.category)}</td>
      <td>
        <span className="meta-pill bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)]">
          {readableLabel(finding.status)}
        </span>
      </td>
    </tr>
  );
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
