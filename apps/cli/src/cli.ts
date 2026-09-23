#!/usr/bin/env node
import { runAnalysisOrchestrator, reportToMarkdown } from "@sentinel/analysis";
import {
  buildRepositoryStore,
  fetchGitHubRepository,
  parseGitHubRepositoryUrl,
  postPullRequestComment,
} from "@sentinel/ingestion";
import { createProviderAdapter } from "@sentinel/providers";
import { ANALYSIS_MODE, AuditMemorySchema, ProviderSettingsSchema, sanitizeReportForExport } from "@sentinel/schema";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const CliArgsSchema = z.object({
  repositoryUrl: z.string().url(),
  ref: z.string().optional(),
  providerId: z.enum(["openai", "anthropic", "gemini", "deepseek", "openai_compatible"]),
  modelId: z.string().min(1),
  outputDir: z.string().default("./analysis-artifacts"),
  maxRequests: z.coerce.number().int().positive().default(24),
  maxTokens: z.coerce.number().int().positive().default(100_000),
  enableAi: z.coerce.boolean().default(true),
  memoryPath: z.string().optional(),
  pullRequestNumber: z.coerce.number().int().positive().optional(),
  postReview: z.coerce.boolean().default(false),
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
    memoryPath: map.memory,
    pullRequestNumber: map.pullRequest,
    postReview: map.postReview ?? "false",
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
    githubToken,
    priorMemory: await readPriorMemory(args.memoryPath),
  });

  const sanitized = sanitizeReportForExport(report);
  await mkdir(args.outputDir, { recursive: true });
  const jsonPath = path.join(args.outputDir, `report-${sanitized.id}.json`);
  const mdPath = path.join(args.outputDir, `report-${sanitized.id}.md`);
  await writeFile(jsonPath, JSON.stringify(sanitized, null, 2), "utf8");
  await writeFile(mdPath, reportToMarkdown(sanitized), "utf8");
  const memoryPath = path.join(args.outputDir, "memory.json");
  if (sanitized.memory) {
    await writeFile(memoryPath, JSON.stringify(sanitized.memory, null, 2), "utf8");
    console.log(`Wrote ${memoryPath}`);
  }
  if (args.postReview) {
    if (!githubToken) {
      throw new Error("GITHUB_TOKEN is required to post a pull request review comment");
    }
    if (!args.pullRequestNumber) {
      throw new Error("--pullRequest is required with --postReview");
    }
    if (!report.pullRequestReview) {
      throw new Error("The report has no pull request review comment to post");
    }
    await postPullRequestComment(repoRef, args.pullRequestNumber, report.pullRequestReview.commentBody, {
      token: githubToken,
      runtime: "node",
    });
    console.log(`Posted review comment on pull request #${args.pullRequestNumber}`);
  }
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
}

async function readPriorMemory(memoryPath: string | undefined) {
  if (!memoryPath) {
    return undefined;
  }
  const raw = await readFile(memoryPath, "utf8");
  return AuditMemorySchema.parse(JSON.parse(raw));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
