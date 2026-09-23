import type { Finding } from "@sentinel/schema";
import { useMemo, useState } from "react";

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
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return findings.filter((finding) => {
      if (categoryFilter !== "all" && finding.category !== categoryFilter) {
        return false;
      }
      if (query && !finding.title.toLowerCase().includes(query.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [findings, categoryFilter, query]);

  return (
    <div className="space-y-3" data-testid="findings-table">
      <div className="flex flex-wrap gap-2">
        <input
          className="glass-input max-w-xs"
          placeholder="Filter findings"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Filter findings"
        />
        <select
          className="glass-input max-w-xs"
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          aria-label="Category filter"
        >
          <option value="all">All categories</option>
          <option value="architecture">Architecture</option>
          <option value="security">Security</option>
          <option value="ai_security">AI security</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--md-outline)]/30">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--md-surface-container-high)]/80">
            <tr>
              <th className="px-3 py-2">Rank</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Risk</th>
              <th className="px-3 py-2">Lifecycle</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((finding) => (
              <tr
                key={finding.id}
                className={`cursor-pointer border-t border-[var(--md-outline)]/20 text-[var(--md-on-surface)] ${
                  selectedFindingId === finding.id ? "bg-[var(--md-primary-container)]/40" : ""
                }`}
                onClick={() => onSelectFinding(finding.id)}
              >
                <td className="px-3 py-2">{finding.remediationRank ?? "—"}</td>
                <td className="px-3 py-2">{finding.title}</td>
                <td className="px-3 py-2">{finding.riskScore ?? "—"}</td>
                <td className="px-3 py-2">{finding.lifecycle ?? "open"}</td>
                <td className="px-3 py-2">{finding.category}</td>
                <td className="px-3 py-2">{finding.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
