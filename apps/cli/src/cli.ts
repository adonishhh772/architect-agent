#!/usr/bin/env node
import { runAnalysisOrchestrator, reportToMarkdown } from "@sentinel/analysis";
import {
  buildRepositoryStore,
  fetchGitHubRepository,
  parseGitHubRepositoryUrl,
} from "@sentinel/ingestion";
import { createProviderAdapter } from "@sentinel/providers";
import { ANALYSIS_MODE, ProviderSettingsSchema, sanitizeReportForExport } from "@sentinel/schema";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const CliArgsSchema = z.object({
  repositoryUrl: z.string().url(),
  ref: z.string().optional(),
  providerId: z.enum(["openai", "anthropic", "gemini", "deepseek", "openai_compatible"]),
  modelId: z.string().min(1),
  outputDir: z.string().default("./analysis-artifacts"),
  maxRequests: z.coerce.number().int().positive().default(10),
  maxTokens: z.coerce.number().int().positive().default(100_000),
  enableAi: z.coerce.boolean().default(true),
});

function parseArgs(argv: string[]): z.infer<typeof CliArgsSchema> {
  const map: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = argv[index + 1];
      if (value && !value.startsWith("--")) {
        map[key] = value;
        index += 1;
      } else {
        map[key] = "true";
      }
    }
  }
  return CliArgsSchema.parse({
    repositoryUrl: map.repositoryUrl,
    ref: map.ref,
    providerId: map.providerId ?? "openai",
    modelId: map.modelId,
    outputDir: map.outputDir,
    maxRequests: map.maxRequests,
    maxTokens: map.maxTokens,
    enableAi: map.enableAi ?? "true",
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.SENTINEL_API_KEY ?? process.env.OPENAI_API_KEY;
  if (args.enableAi && !apiKey) {
    throw new Error("SENTINEL_API_KEY (or OPENAI_API_KEY) is required for AI-enabled Deep Runner");
  }

  const githubToken = process.env.GITHUB_TOKEN;
  const repoRef = parseGitHubRepositoryUrl(args.repositoryUrl);
  if (!repoRef) {
    throw new Error("Invalid repository URL");
  }
  if (args.ref) {
    repoRef.ref = args.ref;
  }

  const fetched = await fetchGitHubRepository(repoRef, {
    token: githubToken,
    maxFiles: 1000,
    onProgress: (message, completed, total) => {
      console.log(`[ingest] ${message} ${completed}/${total}`);
    },
  });

  const store = buildRepositoryStore(
    fetched.files.map((file) => ({ path: file.path, content: file.content })),
    { commitSha: fetched.commitSha },
  );

  const providerSettings = ProviderSettingsSchema.parse({
    providerId: args.providerId,
    modelId: args.modelId,
    endpoint: process.env.SENTINEL_API_ENDPOINT,
    customEndpointConfirmed: Boolean(process.env.SENTINEL_API_ENDPOINT),
    requestTimeoutMs: 120_000,
    maxConcurrency: 3,
    maxRetries: 2,
  });

  const provider = args.enableAi && apiKey ? createProviderAdapter(providerSettings) : undefined;

  const report = await runAnalysisOrchestrator({
    mode: ANALYSIS_MODE.DEEP_RUNNER,
    repository: {
      sourceType: "github",
      url: args.repositoryUrl,
      owner: repoRef.owner,
      name: repoRef.name,
      commitSha: fetched.commitSha,
      ref: repoRef.ref,
      analyzedAt: new Date().toISOString(),
    },
    store,
    provider,
    apiKey: apiKey ?? undefined,
    enableAi: args.enableAi,
    onProgress: (event) => {
      console.log(`[analysis] ${event.phase}: ${event.message}`);
    },
    budget: {
      maxRequests: args.maxRequests,
      maxTokens: args.maxTokens,
    },
  });

  const sanitized = sanitizeReportForExport(report);
  await mkdir(args.outputDir, { recursive: true });
  const jsonPath = path.join(args.outputDir, `report-${sanitized.id}.json`);
  const mdPath = path.join(args.outputDir, `report-${sanitized.id}.md`);
  await writeFile(jsonPath, JSON.stringify(sanitized, null, 2), "utf8");
  await writeFile(mdPath, reportToMarkdown(sanitized), "utf8");
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
