import { runAnalysisOrchestrator } from "@sentinel/analysis";
import { applyAgentActivity, createPendingAgentWork, type AgentWorkItem } from "./AgentActivityPanel";
import { createProviderAdapter } from "@sentinel/providers";
import { ANALYSIS_MODE, type AnalysisReport, type AuditMemory, type ProviderSettings } from "@sentinel/schema";
import type { RepositoryStore } from "@sentinel/ingestion";
import { useCallback, useRef, useState } from "react";
import { getBrowserProviderSettingsForAi } from "../provider/aiBrowserTransport";

export interface AnalysisRunnerProgress {
  phase: string;
  message: string;
  completed: number;
  total: number;
}

export interface AnalysisRunResult {
  report: AnalysisReport;
  agentWork: AgentWorkItem[];
}

export function useAnalysisRunner(): {
  isRunning: boolean;
  progress: AnalysisRunnerProgress | null;
  agentWork: AgentWorkItem[];
  error: string | null;
  runBrowserAnalysis: (input: {
    store: RepositoryStore;
    sourceLabel: string;
    repositoryUrl?: string;
    owner?: string;
    name?: string;
    ref?: string;
    commitSha?: string;
    githubToken?: string;
    priorMemory?: AuditMemory;
    providerSettings: ProviderSettings;
    apiKey?: string;
    enableAi: boolean;
    advisoryLookupConsent: boolean;
    exclusions: string[];
  }) => Promise<AnalysisRunResult>;
  cancel: () => void;
} {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<AnalysisRunnerProgress | null>(null);
  const [agentWork, setAgentWork] = useState<AgentWorkItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const agentWorkRef = useRef<AgentWorkItem[]>([]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
  }, []);

  const runBrowserAnalysis = useCallback(
    async (input) => {
      setIsRunning(true);
      setError(null);
      agentWorkRef.current = [];
      setAgentWork([]);
      abortRef.current = new AbortController();
      try {
        const providerSettingsForBrowser = getBrowserProviderSettingsForAi(input.providerSettings);
        const provider =
          input.enableAi && input.apiKey
            ? createProviderAdapter(providerSettingsForBrowser)
            : undefined;

        const report = await runAnalysisOrchestrator({
          mode: ANALYSIS_MODE.BROWSER,
          repository: {
            sourceType: input.repositoryUrl ? "github" : "zip",
            url: input.repositoryUrl,
            owner: input.owner,
            name: input.name ?? input.sourceLabel,
            ref: input.ref,
            commitSha: input.commitSha,
            analyzedAt: new Date().toISOString(),
          },
          store: input.store,
          provider,
          apiKey: input.apiKey,
          enableAi: input.enableAi,
          signal: abortRef.current.signal,
          onProgress: (event) => {
            setProgress(event);
            if (!event.agentActivity) {
              return;
            }
            const activity = event.agentActivity;
            const nextWork = applyAgentActivity(
              agentWorkRef.current.length === 0 ? createPendingAgentWork() : agentWorkRef.current,
              activity,
            );
            agentWorkRef.current = nextWork;
            setAgentWork(nextWork);
          },
          budget: {},
          githubToken: input.githubToken,
          priorMemory: input.priorMemory,
          advisoryLookupConsent: input.advisoryLookupConsent,
        });
        return { report, agentWork: agentWorkRef.current };
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Analysis failed";
        setError(message);
        throw caught;
      } finally {
        setIsRunning(false);
        setProgress(null);
      }
    },
    [],
  );

  return { isRunning, progress, agentWork, error, runBrowserAnalysis, cancel };
}
