import type { AnalysisReport } from "@sentinel/schema";

interface ArchitectureOverviewProps {
  report: AnalysisReport;
}

export function ArchitectureOverview({ report }: ArchitectureOverviewProps): JSX.Element {
  const profile = report.architectureProfile;
  const purpose = profile?.purpose ?? report.architectureOverview ?? report.executiveSummary;
  return (
    <div data-testid="architecture-overview">
      <p className="text-sm leading-relaxed text-[var(--md-on-surface)]" data-testid="architecture-purpose">
        {purpose}
      </p>
      {profile && (
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <OverviewStat label="Languages" value={profile.languages.join(", ") || "none"} />
          <OverviewStat label="Modules" value={String(profile.moduleCount)} />
          <OverviewStat label="HTTP entries" value={String(profile.apiEntryCount)} />
          <OverviewStat label="Data stores" value={String(profile.dataStoreCount)} />
          <OverviewStat label="External systems" value={String(profile.externalSystemCount)} />
        </dl>
      )}
      {profile && profile.highlights.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-[var(--md-on-surface-variant)]" data-testid="architecture-highlights">
          {profile.highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OverviewStat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-[var(--md-outline)]/25 bg-[var(--md-surface-container-high)]/50 px-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--md-on-surface-variant)]">{label}</dt>
      <dd className="font-display mt-1 text-lg font-semibold text-[var(--md-on-surface)]">{value}</dd>
    </div>
  );
}
