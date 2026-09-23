import { runAnalysisOrchestrator } from "@sentinel/analysis";
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

export function useAnalysisRunner(): {
  isRunning: boolean;
  progress: AnalysisRunnerProgress | null;
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
    exclusions: string[];
    maxRequests: number;
    maxTokens: number;
  }) => Promise<AnalysisReport>;
  cancel: () => void;
} {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<AnalysisRunnerProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
  }, []);

  const runBrowserAnalysis = useCallback(
    async (input) => {
      setIsRunning(true);
      setError(null);
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
          onProgress: (event) => setProgress(event),
          budget: {
            maxRequests: input.maxRequests,
            maxTokens: input.maxTokens,
          },
          githubToken: input.githubToken,
          priorMemory: input.priorMemory,
        });
        return report;
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

  return { isRunning, progress, error, runBrowserAnalysis, cancel };
}
