import { PACKAGE_INVENTORY_LIMIT } from "@sentinel/analysis";
import { graphToMermaid } from "@sentinel/graph";
import type { AnalysisReport, Finding } from "@sentinel/schema";
import type { ProviderSettings } from "@sentinel/schema";
import type { RepositoryStore } from "@sentinel/ingestion";
import { Database, FileArchive } from "lucide-react";
import type { ReactNode } from "react";
import { REPORT_SECTION, type ReportAccordionItem } from "../../components/layout/ReportAccordion";
import { MaterialButton } from "../../components/material/MaterialButton";
import { exportReportCycloneDx } from "../export/reportExportActions";
import { ArchitectureOverview } from "../architecture/ArchitectureOverview";
import { FollowUpCopilot } from "../copilot/FollowUpCopilot";
import { FindingsBoard } from "../findings/FindingsTable";
import { Recommendations } from "../findings/Recommendations";
import { collapseFindingsByTitle } from "../findings/uniqueFindings";
import { FrameworkRiskPanel } from "../findings/FrameworkRiskPanel";
import { PullRequestReview } from "../findings/PullRequestReview";
import { StrideThreatModelPanel } from "../findings/StrideThreatModelPanel";
import { MermaidDiagram } from "../graph/MermaidDiagram";
import { OverallSummary } from "./OverallSummary";
import { findingsForMapLabel } from "../graph/mapSelection";

interface ReportAccordionInput {
  report: AnalysisReport;
  store: RepositoryStore | null;
  githubToken: string;
  selectedFindingId: string | undefined;
  selectedFinding: Finding | undefined;
  providerSettings: ProviderSettings;
  apiKey: string | null;
  transmissionConfirmed: boolean;
  browserReady: boolean;
  onSelectFinding: (findingId: string) => void;
  onDispositionChange: (stableKey: string, disposition: NonNullable<Finding["disposition"]>) => void;
  onExportJson: () => void;
  onExportMarkdown: () => void;
  onExportHtml: () => void;
  onExportSarif: () => void;
  onPersistReport: () => void;
  selectedMapLabel: string | undefined;
  onSelectMapLabel: (label: string) => void;
  onSelectCitation: (path: string) => void;
}

export function buildReportAccordionItems(input: ReportAccordionInput): ReportAccordionItem[] {
  const items: ReportAccordionItem[] = [
    {
      id: REPORT_SECTION.SUMMARY,
      title: "Summary",
      description: "The threat model written from the code reader notes and the later agents.",
      content: (
        <OverallSummary
          text={input.report.executiveSummary}
          providerSettings={input.providerSettings}
          apiKey={input.apiKey}
          transmissionConfirmed={input.transmissionConfirmed}
          browserReady={input.browserReady}
        />
      ),
    },
    {
      id: REPORT_SECTION.MAP,
      title: "Architecture map",
      description: "The cartographer maps services and how they connect, then draws this Mermaid diagram.",
      content: (
        <ArchitectureMapSection
          report={input.report}
          chart={input.report.architectureMermaid ?? graphToMermaid(input.report.graph)}
          fallbackChart={graphToMermaid(input.report.graph)}
          selectedLabel={input.selectedMapLabel}
          onSelectLabel={input.onSelectMapLabel}
          onSelectFinding={input.onSelectFinding}
        />
      ),
    },
    {
      id: REPORT_SECTION.OVERVIEW,
      title: "What this repository is",
      description: "Purpose, languages, and the architecture inferred from the indexed source.",
      content: <ArchitectureOverview report={input.report} />,
    },
    {
      id: REPORT_SECTION.STRIDE,
      title: "STRIDE threat model",
      description: "Spoofing, tampering, repudiation, information disclosure, denial of service, and elevation of privilege.",
      content: <StrideThreatModelPanel report={input.report} onSelectFinding={input.onSelectFinding} />,
    },
    {
      id: REPORT_SECTION.FRAMEWORK,
      title: "OWASP, ATLAS, data, and infrastructure",
      description: "Framework tags and the agent trace for this run.",
      content: <FrameworkRiskPanel report={input.report} onSelectFinding={input.onSelectFinding} />,
    },
  ];

  if (input.report.pullRequestReview) {
    items.push({
      id: REPORT_SECTION.PULL_REQUEST,
      title: "Pull request review",
      description: "New, fixed, and regressed findings since the last snapshot.",
      content: (
        <PullRequestReview
          review={input.report.pullRequestReview}
          owner={input.report.repository.owner}
          name={input.report.repository.name}
          githubToken={input.githubToken}
        />
      ),
    });
  }

  items.push({
    id: REPORT_SECTION.FINDINGS,
    title: "Findings",
    description: "Filter the evidence and open one finding at a time.",
    content: (
      <FindingsBoard
        findings={collapseFindingsByTitle(input.report.findings)}
        selectedFinding={input.selectedFinding}
        onSelectFinding={input.onSelectFinding}
        onDispositionChange={input.onDispositionChange}
      />
    ),
  });

  items.push({
    id: REPORT_SECTION.RECOMMENDATIONS,
    title: "Recommendations",
    description: "Each vulnerability is listed once, with every file that contains it.",
    content: <Recommendations recommendations={input.report.recommendations} onSelectCitation={input.onSelectCitation} />,
  });

  if (input.store) {
    items.push({
      id: REPORT_SECTION.COPILOT,
      title: "Follow-up copilot",
      description: "Ask about callers, sinks, and the ranked findings without starting a new audit.",
      content: (
        <FollowUpCopilot
          contents={input.store.contents}
          graph={input.report.graph}
          findings={input.report.findings}
          providerSettings={input.providerSettings}
          apiKey={input.apiKey}
          transmissionConfirmed={input.transmissionConfirmed}
          browserReady={input.browserReady}
        />
      ),
    });
  }

  items.push({
    id: REPORT_SECTION.COVERAGE,
    title: "Coverage and export",
    description: "Indexed coverage, budget, and report downloads.",
    content: (
      <CoverageExport
        report={input.report}
        providerSettings={input.providerSettings}
        apiKey={input.apiKey}
        transmissionConfirmed={input.transmissionConfirmed}
        browserReady={input.browserReady}
        onExportJson={input.onExportJson}
        onExportMarkdown={input.onExportMarkdown}
        onExportHtml={input.onExportHtml}
        onExportSarif={input.onExportSarif}
        onPersistReport={input.onPersistReport}
      />
    ),
  });

  return items;
}

interface CoverageExportProps {
  report: AnalysisReport;
  providerSettings: ProviderSettings;
  apiKey: string | null;
  transmissionConfirmed: boolean;
  browserReady: boolean;
  onExportJson: () => void;
  onExportMarkdown: () => void;
  onExportHtml: () => void;
  onExportSarif: () => void;
  onPersistReport: () => void;
}

function ArchitectureMapSection({
  report,
  chart,
  fallbackChart,
  selectedLabel,
  onSelectLabel,
  onSelectFinding,
}: {
  report: AnalysisReport;
  chart: string;
  fallbackChart: string;
  selectedLabel: string | undefined;
  onSelectLabel: (label: string) => void;
  onSelectFinding: (findingId: string) => void;
}): JSX.Element {
  const related = selectedLabel ? findingsForMapLabel(report.graph, report.findings, selectedLabel) : [];
  return (
    <div className="space-y-4">
      <MermaidDiagram chart={chart} fallbackChart={fallbackChart} onSelectLabel={onSelectLabel} />
      <MapSelection related={related} selectedLabel={selectedLabel} onSelectFinding={onSelectFinding} />
    </div>
  );
}

function MapSelection({
  related,
  selectedLabel,
  onSelectFinding,
}: {
  related: Finding[];
  selectedLabel: string | undefined;
  onSelectFinding: (findingId: string) => void;
}): JSX.Element {
  if (!selectedLabel) {
    return <p className="text-sm text-[var(--md-on-surface-variant)]">Select a node on the map to see the files and findings behind it.</p>;
  }
  return (
    <div data-testid="map-selection">
      <h3 className="text-sm font-semibold text-[var(--md-on-surface)]">{selectedLabel}</h3>
      {related.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--md-on-surface-variant)]">No findings are tied to this node.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {related.map((finding) => (
            <MapFinding key={finding.id} finding={finding} onSelectFinding={onSelectFinding} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MapFinding({ finding, onSelectFinding }: { finding: Finding; onSelectFinding: (findingId: string) => void }): JSX.Element {
  function handleClick(): void {
    onSelectFinding(finding.id);
  }
  const citation = finding.references[0];
  return (
    <li>
      <button type="button" className="text-left text-sm text-[var(--md-primary)] underline" onClick={handleClick}>
        {finding.title}
        {citation ? ` · ${citation.path}${citation.startLine ? `:${citation.startLine}` : ""}` : ""}
      </button>
    </li>
  );
}

function CoverageExport({
  report,
  providerSettings,
  apiKey,
  transmissionConfirmed,
  browserReady,
  onExportJson,
  onExportMarkdown,
  onExportHtml,
  onExportSarif,
  onPersistReport,
}: CoverageExportProps): JSX.Element {
  function handleExportCycloneDx(): void {
    exportReportCycloneDx(report);
  }

  const stats: Array<{ label: string; value: ReactNode }> = [
    { label: "Indexed files", value: report.coverage.totalFilesIndexed },
    { label: "Excluded", value: report.coverage.excludedFiles },
    { label: "Truncated", value: report.coverage.truncated ? "yes" : "no" },
    { label: "Requests", value: report.budget.requestsUsed },
    { label: "Tokens", value: report.budget.tokensUsed },
  ];

  return (
    <div className="flex max-h-[32rem] flex-col" data-testid="coverage-export">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1" data-testid="coverage-export-body">
      <OverallSummary
        text={report.executiveSummary}
        providerSettings={providerSettings}
        apiKey={apiKey}
        transmissionConfirmed={transmissionConfirmed}
        browserReady={browserReady}
      />
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <CoverageStat key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </ul>
      <ul className="mt-4 space-y-2" data-testid="coverage-entries">
        {report.coverage.entries.map((entry) => (
          <li key={entry.area} className="text-sm text-[var(--md-on-surface-variant)]">
            <span className="font-medium text-[var(--md-on-surface)]">{entry.area}</span>
            {": "}
            {entry.status}
            {entry.detail ? `. ${entry.detail}` : ""}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-amber-700 dark:text-amber-200/90">{report.disclaimer}</p>
      <SbomList components={report.sbom ?? []} />
      </div>
      <div className="mt-4 flex shrink-0 flex-wrap gap-2 border-t border-[var(--md-outline)]/30 bg-transparent pt-4" data-testid="coverage-export-actions">
        <MaterialButton variant="outlined" icon={<FileArchive className="h-4 w-4" aria-hidden />} onClick={onExportJson}>
          Export JSON
        </MaterialButton>
        <MaterialButton variant="outlined" onClick={onExportMarkdown}>
          Export Markdown
        </MaterialButton>
        <MaterialButton variant="outlined" onClick={onExportHtml}>
          Export HTML
        </MaterialButton>
        <MaterialButton variant="outlined" onClick={onExportSarif}>
          Export SARIF
        </MaterialButton>
        <MaterialButton variant="outlined" onClick={handleExportCycloneDx}>
          Export CycloneDX
        </MaterialButton>
        <MaterialButton variant="outlined" icon={<Database className="h-4 w-4" aria-hidden />} onClick={onPersistReport}>
          Save to IndexedDB
        </MaterialButton>
      </div>
    </div>
  );
}

interface CoverageStatProps {
  label: string;
  value: ReactNode;
}

function SbomList({ components }: { components: AnalysisReport["sbom"] }): JSX.Element {
  if (components.length === 0) {
    return <p className="mt-4 text-sm text-[var(--md-on-surface-variant)]">No lockfile components were recorded.</p>;
  }
  const directCount = components.filter((component) => component.scope === "direct").length;
  const referencedCount = components.filter((component) => component.referencedInSource).length;
  const preview = components.slice(0, 40);
  return (
    <div className="mt-4" data-testid="sbom-list">
      <h3 className="text-sm font-semibold text-[var(--md-on-surface)]">Software bill of materials</h3>
      <p className="mt-1 text-sm text-[var(--md-on-surface-variant)]">
        {components.length} components · {directCount} direct · {components.length - directCount} transitive · {referencedCount} named in source. Public advisory lookup checks this list, up to {PACKAGE_INVENTORY_LIMIT.toLocaleString("en-US")} versions, and records when a larger lockfile stops early.
      </p>
      <ul className="mt-2 space-y-1 text-sm text-[var(--md-on-surface-variant)]">
        {preview.map((component) => (
          <li key={`${component.ecosystem}:${component.name}:${component.version}`}>
            {component.scope ?? "transitive"} · {component.ecosystem} · {component.name}@{component.version}
            {component.referencedInSource ? " · referenced" : ""}
          </li>
        ))}
      </ul>
      {components.length > preview.length && (
        <p className="mt-2 text-sm text-[var(--md-on-surface-variant)]">
          {components.length - preview.length} more components are in the CycloneDX export.
        </p>
      )}
    </div>
  );
}

function CoverageStat({ label, value }: CoverageStatProps): JSX.Element {
  return (
    <li className="rounded-xl border border-[var(--md-outline)]/25 bg-[var(--md-surface-container-high)]/50 px-4 py-3 text-sm">
      <span className="text-[var(--md-on-surface-variant)]">{label}</span>
      <p className="font-display text-lg font-semibold text-[var(--md-on-surface)]">{value}</p>
    </li>
  );
}
