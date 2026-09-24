import { FINDING_DISPOSITION, type AnalysisReport, type Finding, type ProviderSettings } from "@sentinel/schema";
import { FileArchive } from "lucide-react";
import type { RepositoryStore } from "@sentinel/ingestion";
import { ReportAccordion } from "../../../components/layout/ReportAccordion";
import { PageSection } from "../../../components/layout/PageSection";
import { AgentActivityPanel } from "../../analysis/AgentActivityPanel";
import type { AgentWorkItem } from "../../analysis/AgentActivityPanel/agentWorkState";
import { RepositoryFileTree } from "../../ingest/RepositoryFileTree";
import { buildReportAccordionItems } from "../buildReportAccordionItems";

interface OpenWorkspaceReportProps {
  report: AnalysisReport;
  store: RepositoryStore | null;
  githubToken: string;
  selectedFindingId: string | undefined;
  selectedFinding: Finding | undefined;
  providerSettings: ProviderSettings;
  apiKey: string | null;
  transmissionConfirmed: boolean;
  browserReady: boolean;
  agentWork: AgentWorkItem[];
  selectedTreePath: string | undefined;
  selectedMapLabel: string | undefined;
  openReportSection: string;
  statusMessage: string | null;
  onSelectFinding: (findingId: string) => void;
  onDispositionChange: (
    stableKey: string,
    disposition: (typeof FINDING_DISPOSITION)[keyof typeof FINDING_DISPOSITION],
  ) => void;
  onExportJson: () => void;
  onExportMarkdown: () => void;
  onExportHtml: () => void;
  onExportSarif: () => void;
  onPersistReport: () => void;
  onSelectMapLabel: (label: string) => void;
  onSelectCitation: (path: string) => void;
  onOpenReportSection: (sectionId: string) => void;
  onSelectTreePath: (path: string) => void;
}

export function OpenWorkspaceReport({
  report,
  store,
  githubToken,
  selectedFindingId,
  selectedFinding,
  providerSettings,
  apiKey,
  transmissionConfirmed,
  browserReady,
  agentWork,
  selectedTreePath,
  selectedMapLabel,
  openReportSection,
  statusMessage,
  onSelectFinding,
  onDispositionChange,
  onExportJson,
  onExportMarkdown,
  onExportHtml,
  onExportSarif,
  onPersistReport,
  onSelectMapLabel,
  onSelectCitation,
  onOpenReportSection,
  onSelectTreePath,
}: OpenWorkspaceReportProps): JSX.Element {
  return (
    <div className="space-y-6" data-testid="open-workspace-report">
      {statusMessage && (
        <p className="text-sm text-[var(--md-on-surface-variant)]" data-testid="workspace-status">
          {statusMessage}
        </p>
      )}
      {agentWork.length > 0 && <AgentActivityPanel agents={agentWork} />}
      <ReportAccordion
        items={buildReportAccordionItems({
          report,
          store,
          githubToken,
          selectedFindingId,
          selectedFinding,
          providerSettings,
          apiKey,
          transmissionConfirmed,
          browserReady,
          onSelectFinding,
          onDispositionChange,
          onExportJson,
          onExportMarkdown,
          onExportHtml,
          onExportSarif,
          onPersistReport,
          selectedMapLabel,
          onSelectMapLabel,
          onSelectCitation,
        })}
        openSectionId={openReportSection}
        onOpenSectionChange={onOpenReportSection}
      />
      {store && (
        <PageSection
          title="Repository tree"
          description="Indexed paths for this workspace. Excluded files are struck through."
          icon={FileArchive}
        >
          <div id="repository-file-tree">
            <RepositoryFileTree store={store} selectedPath={selectedTreePath} onSelectPath={onSelectTreePath} />
          </div>
        </PageSection>
      )}
    </div>
  );
}
