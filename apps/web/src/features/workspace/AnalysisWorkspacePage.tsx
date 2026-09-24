import { FINDING_DISPOSITION, type AnalysisReport, type AuditMemory } from "@sentinel/schema";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import {
  Bot,
  Database,
  FlaskConical,
  GitBranch,
  Github,
  ArrowLeft,
  LayoutDashboard,
  LockKeyhole,
  Play,
  Plus,
  ScanSearch,
  SlidersHorizontal,
  Square,
  Trash2,
  Upload,
} from "lucide-react";
import { MaterialButton } from "../../components/material/MaterialButton";
import { MaterialTextField } from "../../components/material/MaterialTextField";
import { PageHero } from "../../components/layout/PageHero";
import { PageSection } from "../../components/layout/PageSection";
import { AgentActivityPanel } from "../analysis/AgentActivityPanel";
import { useAnalysisRunner } from "../analysis/useAnalysisRunner";
import { exportReportHtml, exportReportJson, exportReportMarkdown, exportReportSarif } from "../export/reportExportActions";
import { rememberDisposition } from "@sentinel/analysis";
import { REPORT_SECTION } from "../../components/layout/ReportAccordion";
import { OpenWorkspaceReport } from "./OpenWorkspaceReport";
import { useRepositoryIngestion } from "../ingest/useRepositoryIngestion";
import { parseGitHubRepositoryUrl } from "@sentinel/ingestion";
import { deleteSavedReport, listSavedReports, saveReportLocally, type PersistedReportRecord } from "../persistence/indexedDbStore";
import type { AgentWorkItem } from "../analysis/AgentActivityPanel/agentWorkState";
import { RunHistory } from "./RunHistory";
import { WorkspaceJourney } from "./WorkspaceJourney";
import { buildWorkspaceJourney } from "./WorkspaceJourney/workspaceJourneyModel";
import { canRunProviderInBrowser } from "../provider/aiBrowserTransport";
import { useSession } from "../session/SessionProvider";
import { clearWorkspaceSession, loadWorkspaceSession, saveWorkspaceSession } from "./workspaceSessionStore";
import { indexedStoreMatchesReport } from "./workspaceRunSummary";
import {
  BACK_TO_WORKSPACES_LABEL,
  DELETE_WORKSPACE_BUSY_MESSAGE,
  DELETING_WORKSPACE_LABEL,
  deleteWorkspaceConfirmMessage,
  INSPECT_ANOTHER_WORKSPACE_LABEL,
  nextOpenRunId,
  REMOVE_INDEXED_WORKSPACE_CONFIRM,
  REMOVE_INDEXED_WORKSPACE_LABEL,
  shouldClearOpenWorkspace,
  WORKSPACE_VIEW,
  type WorkspaceViewMode,
} from "./workspaceView";
import type { RepositoryStore } from "@sentinel/ingestion";
import { DEMO_FIXTURE_LABEL, loadDemoFixtureStore } from "../demo/loadDemoFixture";

function StatusChip({ label, active }: { label: string; active: boolean }): JSX.Element {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
        active
          ? "bg-[var(--color-neon-green)]/15 text-[var(--color-neon-green)] ring-1 ring-[var(--color-neon-green)]/30"
          : "bg-[var(--md-surface-container-high)] text-[var(--md-on-surface-variant)] ring-1 ring-[var(--md-outline)]/30"
      }`}
    >
      {label}
    </span>
  );
}

export function AnalysisWorkspacePage(): JSX.Element {
  const session = useSession();
  const ingestion = useRepositoryIngestion();
  const runner = useAnalysisRunner();

  const [repoUrl, setRepoUrl] = useState("");
  const [exclusions, setExclusions] = useState(".env,secrets,id_rsa");
  const [githubToken, setGithubToken] = useState("");
  const [maxRequests, setMaxRequests] = useState(25);
  const [advisoryLookupConsent, setAdvisoryLookupConsent] = useState(false);
  const [maxTokens, setMaxTokens] = useState(200_000);
  const [selectedTreePath, setSelectedTreePath] = useState<string | undefined>();
  const [store, setStore] = useState<RepositoryStore | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string>("");
  const [commitSha, setCommitSha] = useState<string | undefined>();
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | undefined>();
  const [selectedMapLabel, setSelectedMapLabel] = useState<string | undefined>();
  const [openReportSection, setOpenReportSection] = useState<string>(REPORT_SECTION.MAP);

  useEffect(() => {
    setOpenReportSection(REPORT_SECTION.MAP);
  }, [report?.id]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [sessionRestored, setSessionRestored] = useState(false);
  const [savedRuns, setSavedRuns] = useState<PersistedReportRecord[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceViewMode>(WORKSPACE_VIEW.LIST);
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const [removingIndexedWorkspace, setRemovingIndexedWorkspace] = useState(false);
  const [openedAgentWork, setOpenedAgentWork] = useState<AgentWorkItem[]>([]);
  const [runListError, setRunListError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const restoreWorkspace = async (): Promise<void> => {
      const snapshot = await loadWorkspaceSession();
      if (cancelled) {
        return;
      }
      if (snapshot) {
        setStore(snapshot.store);
        setSourceLabel(snapshot.sourceLabel);
        setCommitSha(snapshot.commitSha);
        if (snapshot.repoUrl) {
          setRepoUrl(snapshot.repoUrl);
        }
        await rememberRestoredRun(snapshot.lastReport);
        if (cancelled) {
          return;
        }
        setStatusMessage(
          `Restored indexed repository (“${snapshot.sourceLabel}”) saved ${new Date(snapshot.savedAt).toLocaleString()}.`,
        );
      } else {
        await refreshSavedRuns();
      }
      if (!cancelled) {
        setSessionRestored(true);
      }
    };
    void restoreWorkspace();
    return () => {
      cancelled = true;
    };
  }, []);

  const exclusionList = useMemo(
    () =>
      exclusions
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [exclusions],
  );

  const selectedFinding = report?.findings.find((finding) => finding.id === selectedFindingId);
  const providerLabel = session.providerSettings.providerId;
  const aiBrowserReady = canRunProviderInBrowser(session.providerSettings.providerId);
  const progress = ingestion.progress ?? runner.progress;
  const providerReady =
    session.vaultStatus === "unlocked" &&
    Boolean(session.getModelApiKey()) &&
    session.connectionTested &&
    session.aiTransmissionConfirmed &&
    aiBrowserReady;
  const journey = buildWorkspaceJourney({
    vaultReady: providerReady,
    sourceIndexed: Boolean(store),
    analysisRunning: runner.isRunning,
    reportReady: Boolean(report),
  });
  const analysisBlockedReason = !store
    ? "Index a repository first."
    : session.vaultStatus !== "unlocked"
      ? "Unlock the vault on Providers."
      : !session.getModelApiKey()
        ? "Save a model API key in the vault."
        : !session.connectionTested
          ? "Run provider connection test on Providers."
          : !session.aiTransmissionConfirmed
            ? "Confirm AI transmission below."
            : !aiBrowserReady
              ? `${providerLabel} cannot call the API from the browser on this host.`
              : null;

  const persistIndexedRepository = async (
    nextStore: RepositoryStore,
    nextSourceLabel: string,
    nextCommitSha: string | undefined,
    nextRepoUrl: string,
    nextReport: AnalysisReport | null,
  ): Promise<void> => {
    try {
      await saveWorkspaceSession({
        store: nextStore,
        sourceLabel: nextSourceLabel,
        commitSha: nextCommitSha,
        repoUrl: nextRepoUrl || undefined,
        lastReport: nextReport,
      });
    } catch {
      setStatusMessage("Indexed repository is in memory but could not be saved to IndexedDB (storage quota).");
    }
  };

  const handleLoadDemoFixture = (): void => {
    const demoStore = loadDemoFixtureStore();
    setStore(demoStore);
    setSourceLabel(DEMO_FIXTURE_LABEL);
    setCommitSha(demoStore.index.commitSha);
    setReport(null);
    setStatusMessage(DEMO_FIXTURE_LABEL);
    void persistIndexedRepository(demoStore, DEMO_FIXTURE_LABEL, demoStore.index.commitSha, "", null);
  };

  const handleGitHubIngest = async (): Promise<void> => {
    let githubAccessToken: string | undefined;
    if (githubToken.trim()) {
      if (session.vaultStatus === "unlocked") {
        await session.setGithubToken(githubToken.trim());
        githubAccessToken = session.getGithubToken() ?? undefined;
      } else {
        githubAccessToken = githubToken.trim();
      }
    } else {
      githubAccessToken = session.getGithubToken() ?? undefined;
    }
    const result = await ingestion.ingestGitHubUrl(repoUrl, githubAccessToken, exclusionList);
    setStore(result.store);
    setSourceLabel(result.sourceLabel);
    setCommitSha(result.commitSha);
    setReport(null);
    const message = result.truncated
      ? "Repository indexed with truncation limits applied."
      : "Repository indexed successfully and saved to this browser session.";
    setStatusMessage(message);
    await persistIndexedRepository(result.store, result.sourceLabel, result.commitSha, repoUrl, null);
  };

  const handleZipUpload = async (file: File): Promise<void> => {
    const result = await ingestion.ingestZipFile(file, exclusionList);
    setStore(result.store);
    setSourceLabel(result.sourceLabel);
    setCommitSha(undefined);
    setReport(null);
    setStatusMessage("ZIP repository indexed locally and saved to this browser session.");
    await persistIndexedRepository(result.store, result.sourceLabel, undefined, "", null);
  };

  const handleZipInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) {
      void handleZipUpload(file);
    }
  };

  const handleRunAnalysis = async (): Promise<void> => {
    if (analysisBlockedReason) {
      setStatusMessage(analysisBlockedReason);
      return;
    }
    if (!store) {
      return;
    }
    setOpenedAgentWork([]);
    setStatusMessage("Running full-repository threat model, including open pull requests when GitHub is available…");
    const repoRef = repoUrl ? parseGitHubRepositoryUrl(repoUrl) : null;
    const priorMemory = report?.memory && report.repository.url === repoUrl ? report.memory : undefined;
    setReport(null);
    try {
      const completed = await runner.runBrowserAnalysis({
        store,
        sourceLabel,
        repositoryUrl: repoUrl || undefined,
        owner: repoRef?.owner,
        name: repoRef?.name,
        ref: repoRef?.ref,
        commitSha,
        githubToken: githubToken || undefined,
        priorMemory,
        providerSettings: session.providerSettings,
        apiKey: session.getModelApiKey() ?? undefined,
        enableAi: true,
        advisoryLookupConsent,
        exclusions: exclusionList,
        maxRequests,
        maxTokens,
      });
      setReport(completed.report);
      setOpenedAgentWork(completed.agentWork);
      setSelectedRunId(completed.report.id);
      await saveReportLocally(completed.report, completed.agentWork);
      await refreshSavedRuns();
      await persistIndexedRepository(store, sourceLabel, commitSha, repoUrl, completed.report);
      setWorkspaceView(WORKSPACE_VIEW.LIST);
      setStatusMessage(
        `Threat model complete — ${completed.report.findings.length} findings (${completed.report.budget.requestsUsed} AI requests, ${completed.report.budget.tokensUsed} tokens).`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Analysis failed.";
      setStatusMessage(message);
    }
  };

  const handlePersistReport = async (): Promise<void> => {
    if (!report) {
      return;
    }
    await saveReportLocally(report, openedAgentWork);
    await refreshSavedRuns();
    setSelectedRunId(report.id);
    setStatusMessage("Report saved locally in IndexedDB (secrets excluded).");
  };

  const handleRepoUrlChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setRepoUrl(event.target.value);
  };

  const handleGithubTokenChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setGithubToken(event.target.value);
  };

  const handleExclusionsChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setExclusions(event.target.value);
  };

  const handleAdvisoryConsentChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setAdvisoryLookupConsent(event.target.checked);
  };

  const handleTransmissionConfirmChange = (event: ChangeEvent<HTMLInputElement>): void => {
    session.setAiTransmissionConfirmed(event.target.checked);
  };

  const handleMaxRequestsChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setMaxRequests(Number(event.target.value));
  };

  const handleMaxTokensChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setMaxTokens(Number(event.target.value));
  };

  const handleSelectFinding = (findingId: string): void => {
    setSelectedFindingId(findingId);
    setOpenReportSection(REPORT_SECTION.FINDINGS);
  };

  const handleSelectCitation = (path: string): void => {
    setSelectedTreePath(path);
    setStatusMessage(`Opened ${path} from the recommendation citation.`);
    document.getElementById("repository-file-tree")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleExportJson = (): void => {
    if (report) {
      exportReportJson(report);
    }
  };

  const handleExportMarkdown = (): void => {
    if (report) {
      exportReportMarkdown(report);
    }
  };

  const handleExportSarif = (): void => {
    if (!report) {
      return;
    }
    exportReportSarif(report);
  };

  const handleDispositionChange = (
    stableKey: string,
    disposition: (typeof FINDING_DISPOSITION)[keyof typeof FINDING_DISPOSITION],
  ): void => {
    setReport((current) => {
      if (!current) {
        return current;
      }
      const memory = rememberDisposition(current.memory ?? emptyDispositionMemory(current), stableKey, disposition);
      return {
        ...current,
        memory,
        findings: current.findings.map((finding) =>
          finding.stableKey === stableKey ? { ...finding, disposition } : finding,
        ),
      };
    });
  };

  const handleOpenReportSection = (sectionId: string): void => {
    setOpenReportSection(sectionId);
  };

  const handleToggleRun = (runId: string): void => {
    const nextRunId = nextOpenRunId(selectedRunId, runId);
    if (!nextRunId) {
      setSelectedRunId(null);
      return;
    }
    handleSelectRun(nextRunId);
  };

  const handleInspectAnotherWorkspace = (): void => {
    if (runner.isRunning || ingestion.isLoading) {
      setStatusMessage("Finish or cancel the current inspection before starting another workspace.");
      return;
    }
    setWorkspaceView(WORKSPACE_VIEW.INSPECT);
    setSelectedRunId(null);
    setReport(null);
    setStore(null);
    setSourceLabel("");
    setCommitSha(undefined);
    setRepoUrl("");
    setSelectedFindingId(undefined);
    setSelectedMapLabel(undefined);
    setSelectedTreePath(undefined);
    setOpenedAgentWork([]);
    setStatusMessage(null);
    void clearWorkspaceSession().catch(() => {
      setStatusMessage("Could not clear the previous indexed repository.");
    });
  };

  const handleBackToWorkspaces = (): void => {
    setWorkspaceView(WORKSPACE_VIEW.LIST);
  };

  const handleContinueIndexedWorkspace = (): void => {
    setWorkspaceView(WORKSPACE_VIEW.INSPECT);
  };

  const handleDeleteRun = (runId: string): void => {
    const selected = savedRuns.find((run) => run.id === runId);
    if (!selected) {
      setRunListError("That workspace is no longer saved in this browser.");
      return;
    }
    if (runner.isRunning || ingestion.isLoading) {
      setRunListError(DELETE_WORKSPACE_BUSY_MESSAGE);
      return;
    }
    if (deletingRunId) {
      return;
    }
    const confirmed = window.confirm(deleteWorkspaceConfirmMessage(selected.report.title));
    if (!confirmed) {
      return;
    }
    void deleteWorkspace(selected);
  };

  const deleteWorkspace = async (selected: PersistedReportRecord): Promise<void> => {
    setDeletingRunId(selected.id);
    setRunListError(null);
    try {
      await deleteSavedReport(selected.id);
      if (shouldClearOpenWorkspace(selectedRunId, selected.id)) {
        setSelectedRunId(null);
        setReport(null);
        setOpenedAgentWork([]);
        setSelectedFindingId(undefined);
      }
      await refreshSavedRuns();
      try {
        await forgetDeletedReportFromSession(selected.id);
      } catch {
        setRunListError("The report was deleted, but this browser may restore it on the next visit.");
        return;
      }
      setStatusMessage(`Deleted “${selected.report.title}”.`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not delete that workspace.";
      setRunListError(message);
    } finally {
      setDeletingRunId(null);
    }
  };

  const forgetDeletedReportFromSession = async (reportId: string): Promise<void> => {
    const snapshot = await loadWorkspaceSession();
    if (!snapshot || snapshot.lastReport?.id !== reportId) {
      return;
    }
    await saveWorkspaceSession({
      store: snapshot.store,
      sourceLabel: snapshot.sourceLabel,
      repoUrl: snapshot.repoUrl,
      commitSha: snapshot.commitSha,
      lastReport: null,
    });
  };

  const handleRemoveIndexedWorkspace = (): void => {
    if (runner.isRunning || ingestion.isLoading) {
      setRunListError(DELETE_WORKSPACE_BUSY_MESSAGE);
      return;
    }
    if (removingIndexedWorkspace) {
      return;
    }
    const confirmed = window.confirm(REMOVE_INDEXED_WORKSPACE_CONFIRM);
    if (!confirmed) {
      return;
    }
    void removeIndexedWorkspace();
  };

  const removeIndexedWorkspace = async (): Promise<void> => {
    setRemovingIndexedWorkspace(true);
    setRunListError(null);
    try {
      await clearWorkspaceSession();
      setStore(null);
      setSourceLabel("");
      setCommitSha(undefined);
      setRepoUrl("");
      setStatusMessage("Removed the indexed repository. Saved reports are still in the list.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not remove the indexed repository.";
      setRunListError(message);
    } finally {
      setRemovingIndexedWorkspace(false);
    }
  };

  const handleSelectRun = (runId: string): void => {
    const selected = savedRuns.find((run) => run.id === runId);
    if (!selected) {
      setRunListError("That run is no longer saved in this browser.");
      return;
    }
    setRunListError(null);
    setSelectedRunId(selected.id);
    setReport(selected.report);
    setOpenedAgentWork(selected.agentWork);
    setSelectedFindingId(undefined);
    setStatusMessage(`Opened run “${selected.report.title}”.`);
  };

  const rememberRestoredRun = async (lastReport: AnalysisReport | undefined): Promise<void> => {
    try {
      if (lastReport) {
        const existing = await listSavedReports();
        const alreadySaved = existing.some((record) => record.id === lastReport.id);
        if (!alreadySaved) {
          await saveReportLocally(lastReport, []);
        }
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not load saved runs.";
      setRunListError(message);
      return;
    }
    await refreshSavedRuns();
  };

  const refreshSavedRuns = async (): Promise<void> => {
    try {
      const records = await listSavedReports();
      setSavedRuns(records);
      setRunListError(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not load saved runs.";
      setRunListError(message);
    }
  };

  const handleExportHtml = (): void => {
    if (report) {
      exportReportHtml(report);
    }
  };

  const showingWorkspaceList = workspaceView === WORKSPACE_VIEW.LIST;
  const openedStoreMatches = report
    ? indexedStoreMatchesReport({
        sourceLabel,
        repoUrl,
        commitSha,
        reportRepositoryName: report.repository.name,
        reportRepositoryUrl: report.repository.url,
        reportCommitSha: report.repository.commitSha,
      })
    : false;
  const openWorkspaceReport =
    report && selectedRunId === report.id ? (
      <OpenWorkspaceReport
        report={report}
        store={openedStoreMatches ? store : null}
        githubToken={githubToken}
        selectedFindingId={selectedFindingId}
        selectedFinding={selectedFinding}
        providerSettings={session.providerSettings}
        apiKey={session.getModelApiKey()}
        transmissionConfirmed={session.aiTransmissionConfirmed}
        browserReady={aiBrowserReady}
        agentWork={openedAgentWork}
        selectedTreePath={selectedTreePath}
        selectedMapLabel={selectedMapLabel}
        openReportSection={openReportSection}
        statusMessage={statusMessage}
        onSelectFinding={handleSelectFinding}
        onDispositionChange={handleDispositionChange}
        onExportJson={handleExportJson}
        onExportMarkdown={handleExportMarkdown}
        onExportHtml={handleExportHtml}
        onExportSarif={handleExportSarif}
        onPersistReport={handlePersistReport}
        onSelectMapLabel={setSelectedMapLabel}
        onSelectCitation={handleSelectCitation}
        onOpenReportSection={handleOpenReportSection}
        onSelectTreePath={setSelectedTreePath}
      />
    ) : null;

  return (
    <div className="page-shell mx-auto max-w-7xl space-y-8 pb-10" data-testid="workspace-page">
      <PageHero
        icon={LayoutDashboard}
        eyebrow="Analysis workspace"
        title={showingWorkspaceList ? "Workspaces" : "Inspect a repository"}
        description={
          showingWorkspaceList
            ? "Each row is a saved threat model. Open one to read the architecture, findings, and the rest of that report."
            : "Index a repository, run the threat model, then return to the list to read the report."
        }
      >
        <div className="flex flex-wrap gap-2">
          {showingWorkspaceList ? (
            <MaterialButton
              icon={<Plus className="h-4 w-4" aria-hidden />}
              onClick={handleInspectAnotherWorkspace}
              disabled={runner.isRunning || ingestion.isLoading}
              data-testid="inspect-another-workspace"
            >
              {INSPECT_ANOTHER_WORKSPACE_LABEL}
            </MaterialButton>
          ) : (
            <MaterialButton
              variant="outlined"
              icon={<ArrowLeft className="h-4 w-4" aria-hidden />}
              onClick={handleBackToWorkspaces}
              data-testid="back-to-workspaces"
            >
              {BACK_TO_WORKSPACES_LABEL}
            </MaterialButton>
          )}
        </div>
        {showingWorkspaceList ? (
          <p className="mt-3 text-sm text-[var(--md-on-surface-variant)]">
            {savedRuns.length === 1 ? "1 saved report" : `${savedRuns.length} saved reports`}
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusChip label="Indexed" active={Boolean(store)} />
            <StatusChip label="Session saved" active={sessionRestored && Boolean(store)} />
            <StatusChip label="Analyzing" active={runner.isRunning} />
            <StatusChip label="Vault unlocked" active={session.vaultStatus === "unlocked"} />
          </div>
        )}
        {!showingWorkspaceList && sourceLabel && (
          <p className="mt-3 text-sm text-[var(--md-on-surface-variant)]">
            <span className="font-medium text-[var(--md-on-surface)]">Source:</span> {sourceLabel}
            {commitSha && (
              <span className="ml-2 font-mono text-xs opacity-80">{commitSha.slice(0, 12)}</span>
            )}
          </p>
        )}
      </PageHero>

      {showingWorkspaceList && (
        <PageSection
          title="Reports"
          description="Open a workspace to see the map, findings, recommendations, and every other section of that report."
          icon={Database}
          testId="saved-runs"
        >
          {statusMessage && selectedRunId === null && (
            <p className="mb-3 text-sm text-[var(--md-on-surface-variant)]" data-testid="workspace-list-status">
              {statusMessage}
            </p>
          )}
          {store && (
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[var(--md-outline)]/30 bg-[var(--md-surface-container-high)]/40 px-4 py-4">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                data-testid="indexed-workspace"
                onClick={handleContinueIndexedWorkspace}
              >
                <span>
                  <span className="block text-sm font-semibold text-[var(--md-on-surface)]">Indexed repository</span>
                  <span className="mt-1 block text-sm text-[var(--md-on-surface-variant)]">{sourceLabel}</span>
                </span>
                <span className="text-sm font-medium text-[var(--md-primary)]">Continue</span>
              </button>
              <button
                type="button"
                className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-xs font-medium text-[var(--color-neon-pink)] hover:bg-[var(--color-neon-pink)]/10 disabled:opacity-50"
                data-testid="remove-indexed-workspace"
                disabled={removingIndexedWorkspace}
                onClick={handleRemoveIndexedWorkspace}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                {removingIndexedWorkspace ? DELETING_WORKSPACE_LABEL : REMOVE_INDEXED_WORKSPACE_LABEL}
              </button>
            </div>
          )}
          <RunHistory
            runs={savedRuns}
            selectedRunId={selectedRunId}
            error={runListError}
            onSelectRun={handleToggleRun}
            onDeleteRun={handleDeleteRun}
            deletingRunId={deletingRunId}
            openRunContent={openWorkspaceReport}
          />
        </PageSection>
      )}

      {!showingWorkspaceList && <WorkspaceJourney steps={journey.steps} nextAction={journey.nextAction} />}

      {!showingWorkspaceList && (
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <PageSection
          title="Repository input"
          description="Public GitHub URL or ZIP upload. Private repos need a token."
          icon={Github}
        >
          <div className="space-y-4">
            <MaterialTextField
              label="GitHub repository URL"
              data-testid="repo-url-input"
              placeholder="https://github.com/org/repo"
              value={repoUrl}
              onChange={handleRepoUrlChange}
              leadingIcon={<Github className="h-4 w-4" aria-hidden />}
            />
            <MaterialTextField
              label="GitHub token (optional)"
              type="password"
              autoComplete="off"
              value={githubToken}
              onChange={handleGithubTokenChange}
              helperText="Required for reliable browser indexing (CORS). Classic PAT with repo or public_repo scope. In dev, archive/API go through the Vite proxy. Stored in vault when unlocked."
            />
            <div>
              <span className="mb-1 block text-xs font-medium tracking-wide text-[var(--md-on-surface-variant)]">
                Repository ZIP
              </span>
              <label className="home-file-upload flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--md-outline)]/50 bg-[var(--md-surface-container-high)]/50 px-4 py-3 transition hover:border-[var(--md-primary)]/40">
                <Upload className="h-5 w-5 text-[var(--md-primary)]" aria-hidden />
                <span className="text-sm text-[var(--md-on-surface)]">Choose ZIP archive</span>
                <input
                  id="zip-upload"
                  data-testid="zip-upload-input"
                  type="file"
                  accept=".zip,application/zip"
                  className="sr-only"
                  onChange={handleZipInputChange}
                />
              </label>
            </div>
            <MaterialTextField
              label="Path exclusions"
              value={exclusions}
              onChange={handleExclusionsChange}
              helperText="Comma-separated fragments (e.g. .env, secrets)"
              leadingIcon={<SlidersHorizontal className="h-4 w-4" aria-hidden />}
            />
          </div>
        </PageSection>

        <PageSection
          title="Run analysis"
          description="Runs the multi-agent audit: cartographer, STRIDE, OWASP, MITRE ATLAS, data, and infrastructure. Requires vault, provider test, and transmission consent."
          icon={ScanSearch}
        >
          <div className="flex flex-wrap gap-2">
            <MaterialButton
              variant="outlined"
              icon={<FlaskConical className="h-4 w-4" aria-hidden />}
              onClick={handleLoadDemoFixture}
              data-testid="load-demo-fixture"
            >
              Demo fixture
            </MaterialButton>
            <MaterialButton
              variant="outlined"
              icon={<Github className="h-4 w-4" aria-hidden />}
              disabled={ingestion.isLoading || !repoUrl}
              onClick={handleGitHubIngest}
            >
              {ingestion.isLoading ? "Indexing…" : "Index GitHub"}
            </MaterialButton>
            <MaterialButton
              icon={<Play className="h-4 w-4" aria-hidden />}
              disabled={runner.isRunning || !store || Boolean(analysisBlockedReason)}
              onClick={handleRunAnalysis}
              data-testid="run-analysis-button"
            >
              {runner.isRunning ? "Threat modeling…" : "Run AI threat model"}
            </MaterialButton>
          </div>
          {analysisBlockedReason && store && (
            <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100" data-testid="analysis-blocked-reason">
              {analysisBlockedReason}
            </p>
          )}
          {runner.error && (
            <p className="mt-3 rounded-xl border border-[var(--color-neon-pink)]/30 bg-[var(--color-neon-pink)]/10 px-4 py-3 text-sm text-[var(--md-on-surface)]" data-testid="analysis-error">
              {runner.error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <MaterialButton variant="text" icon={<Square className="h-4 w-4" aria-hidden />} onClick={ingestion.cancel}>
              Cancel ingest
            </MaterialButton>
            <MaterialButton variant="text" icon={<Square className="h-4 w-4" aria-hidden />} onClick={runner.cancel}>
              Cancel analysis
            </MaterialButton>
          </div>

          <div className="mt-6 rounded-2xl border border-[var(--md-outline)]/40 bg-[var(--md-surface-container-high)]/40 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-[var(--md-on-surface)]">
              <Bot className="h-4 w-4 text-[var(--md-primary)]" aria-hidden />
              Multi-agent audit — architecture, STRIDE, OWASP, ATLAS, data, infrastructure
            </p>
            {session.vaultStatus !== "unlocked" && (
              <p className="mt-2 flex items-center gap-2 text-sm text-[var(--md-on-surface-variant)]">
                <LockKeyhole className="h-4 w-4" aria-hidden />
                Unlock the vault on{" "}
                <Link to="/providers" className="text-[var(--md-primary)] underline">
                  Providers
                </Link>
              </p>
            )}
            <div className="mt-3 space-y-2 text-sm text-[var(--md-on-surface-variant)]">
              <p>
                Each specialist reads a targeted evidence pack with repository tools, then a verifier checks citations against the indexed snapshot.
                Requests go to <strong>{providerLabel}</strong> (
                {aiBrowserReady ? "browser OK" : "not available in this browser context"}).
                The same graph runs in this browser and in the Deep Runner CLI.
              </p>
              {!session.connectionTested && (
                <p className="text-amber-600 dark:text-amber-300">Connection test required on Providers.</p>
              )}
              <label className="flex items-center gap-2 text-[var(--md-on-surface)]">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--md-primary)]"
                  data-testid="ai-transmission-confirm"
                  checked={session.aiTransmissionConfirmed}
                  onChange={handleTransmissionConfirmChange}
                />
                I confirm sending source snippets to the provider for detailed threat modeling
              </label>
              <label className="flex items-start gap-2 text-[var(--md-on-surface)]">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-[var(--md-primary)]"
                  data-testid="osv-lookup-confirm"
                  checked={advisoryLookupConsent}
                  onChange={handleAdvisoryConsentChange}
                />
                I confirm sending package names and versions from the indexed lockfile to the public OSV advisory service
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <MaterialTextField
                  label="Max AI requests"
                  type="number"
                  value={String(maxRequests)}
                  min={1}
                  max={80}
                  onChange={handleMaxRequestsChange}
                />
                <MaterialTextField
                  label="Max tokens"
                  type="number"
                  value={String(maxTokens)}
                  min={1000}
                  max={200000}
                  onChange={handleMaxTokensChange}
                />
              </div>
            </div>
          </div>
        </PageSection>
      </div>
      )}

      {!showingWorkspaceList && (progress || statusMessage || ingestion.error || runner.isRunning || runner.agentWork.length > 0) && (
        <PageSection
          title="Progress"
          description="The nine audit agents and the steps each one is taking."
          icon={GitBranch}
        >
          {progress && (
            <div data-testid="analysis-progress">
              <p className="text-sm font-medium text-[var(--md-on-surface)]">
                {progress.message} ({progress.completed}/{progress.total})
              </p>
              <div className="workspace-progress mt-3 h-2 overflow-hidden rounded-full bg-[var(--md-surface-container-high)]">
                <div
                  className="h-full rounded-full bg-[var(--md-primary)] transition-all duration-300"
                  style={{
                    width: `${Math.min(100, (progress.completed / Math.max(progress.total, 1)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
          {(runner.isRunning ? runner.agentWork : openedAgentWork).length > 0 && (
            <AgentActivityPanel agents={runner.isRunning ? runner.agentWork : openedAgentWork} />
          )}
          {(statusMessage || ingestion.error) && (
            <p className="mt-3 text-sm text-[var(--md-on-surface-variant)]" data-testid="workspace-status">
              {ingestion.error ?? statusMessage}
            </p>
          )}
        </PageSection>
      )}

    </div>
  );
}

function emptyDispositionMemory(report: AnalysisReport): AuditMemory {
  return {
    repositoryKey: report.repository.url ?? report.repository.name ?? "repository",
    commitSha: report.repository.commitSha,
    filesRead: [],
    filesPartial: [],
    filesUnread: [],
    openQuestions: [],
    priorFindingKeys: [],
    findingRecords: [],
    pullRequestsReviewed: [],
    dispositions: [],
    updatedAt: new Date().toISOString(),
  };
}
