import { FINDING_CATEGORY, type Finding } from "@sentinel/schema";
import { useMemo, useState, type ChangeEvent } from "react";
import { citedFileCount } from "./uniqueFindings";

const FINDINGS_FILTER = {
  ALL: "all",
} as const;

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
      <div className="overflow-x-auto rounded-xl border border-[var(--md-outline)]/30">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--md-surface-container-high)]/80">
            <tr>
              <th className="px-3 py-2">Rank</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Files</th>
              <th className="px-3 py-2">Risk</th>
              <th className="px-3 py-2">Lifecycle</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((finding) => (
              <FindingRow
                key={finding.id}
                finding={finding}
                selected={selectedFindingId === finding.id}
                onSelectFinding={handleSelectFinding}
              />
            ))}
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
      className={`cursor-pointer border-t border-[var(--md-outline)]/20 text-[var(--md-on-surface)] ${
        selected ? "bg-[var(--md-primary-container)]/40" : ""
      }`}
      onClick={handleClick}
    >
      <td className="px-3 py-2">{finding.remediationRank ?? "—"}</td>
      <td className="px-3 py-2">{finding.title}</td>
      <td className="px-3 py-2">{citedFileCount(finding)}</td>
      <td className="px-3 py-2">{finding.riskScore ?? "—"}</td>
      <td className="px-3 py-2">{finding.lifecycle ?? "open"}</td>
      <td className="px-3 py-2">{finding.category}</td>
      <td className="px-3 py-2">{finding.status}</td>
    </tr>
  );
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
