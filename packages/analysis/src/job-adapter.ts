import type { AnalysisReport } from "@sentinel/schema";

export interface DeepRunnerJobRequest {
  repositoryUrl: string;
  ref?: string;
  providerId: string;
  modelId: string;
  maxTokens?: number;
  maxRequests?: number;
}

export interface DeepRunnerJobResult {
  artifactPath: string;
  report: AnalysisReport;
}

/**
 * Adapter boundary for a future authenticated job backend.
 * GitHub Actions implements this interface operationally via workflow dispatch + artifact upload.
 */
export interface AnalysisJobAdapter {
  submitJob(request: DeepRunnerJobRequest): Promise<{ jobId: string }>;
  pollJob(jobId: string): Promise<{ status: "queued" | "running" | "completed" | "failed"; report?: AnalysisReport; error?: string }>;
}

export class ManualGitHubActionsJobAdapter implements AnalysisJobAdapter {
  async submitJob(_request: DeepRunnerJobRequest): Promise<{ jobId: string }> {
    throw new Error(
      "Deep Runner jobs are started manually via GitHub Actions workflow dispatch. GitHub Pages does not execute background analysis.",
    );
  }

  async pollJob(_jobId: string): Promise<{ status: "failed"; error: string }> {
    return {
      status: "failed",
      error: "Polling is not available in browser mode. Import the workflow artifact JSON instead.",
    };
  }
}
