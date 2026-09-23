#!/usr/bin/env node
import { findingsBlockingGate, rememberDisposition, reportToMarkdown, reportToSarif, runAnalysisOrchestrator } from "@sentinel/analysis";
import {
  buildRepositoryStore,
  fetchGitHubRepository,
  fetchPullRequestFileNames,
  parseGitHubRepositoryUrl,
  postPullRequestReview,
} from "@sentinel/ingestion";
import { createProviderAdapter } from "@sentinel/providers";
import {
  ANALYSIS_MODE,
  AuditMemorySchema,
  FINDING_DISPOSITION_LIST,
  ProviderSettingsSchema,
  sanitizeReportForExport,
  type AuditMemory,
} from "@sentinel/schema";
import { readLocalRepositoryFiles } from "./local-repository.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const DispositionFileSchema = z.array(
  z.object({
    stableKey: z.string().min(1).max(300),
    disposition: z.enum(FINDING_DISPOSITION_LIST),
    note: z.string().max(2000).optional(),
  }),
);

const CliArgsSchema = z
  .object({
    repositoryUrl: z.string().url().optional(),
    repositoryPath: z.string().min(1).optional(),
    ref: z.string().optional(),
    providerId: z.enum(["openai", "anthropic", "gemini", "deepseek", "openai_compatible"]),
    modelId: z.string().min(1).optional(),
    outputDir: z.string().default("./analysis-artifacts"),
    maxRequests: z.coerce.number().int().positive().default(24),
    maxTokens: z.coerce.number().int().positive().default(100_000),
    enableAi: z.boolean().default(true),
    memoryPath: z.string().optional(),
    pullRequestNumber: z.coerce.number().int().positive().optional(),
    postReview: z.boolean().default(false),
    failOnRisk: z.coerce.number().int().positive().optional(),
    exclude: z.string().optional(),
    dispositionPath: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (!value.repositoryUrl && !value.repositoryPath) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide --repositoryUrl or --repositoryPath",
        path: ["repositoryUrl"],
      });
    }
    if (value.enableAi && !value.modelId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "--modelId is required when AI is enabled",
        path: ["modelId"],
      });
    }
  });

function parseFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  return value === "true" || value === "1";
}

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
    repositoryPath: map.repositoryPath,
    ref: map.ref,
    providerId: map.providerId ?? "openai",
    modelId: map.modelId,
    outputDir: map.outputDir,
    maxRequests: map.maxRequests,
    maxTokens: map.maxTokens,
    enableAi: parseFlag(map.enableAi, true),
    memoryPath: map.memory,
    pullRequestNumber: map.pullRequest,
    postReview: parseFlag(map.postReview, false),
    failOnRisk: map.failOnRisk,
    exclude: map.exclude,
    dispositionPath: map.dispositions,
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.SENTINEL_API_KEY ?? process.env.OPENAI_API_KEY;
  if (args.enableAi && !apiKey) {
    throw new Error("SENTINEL_API_KEY (or OPENAI_API_KEY) is required for AI-enabled Deep Runner");
  }

  const githubToken = process.env.GITHUB_TOKEN;
  const exclusions = (args.exclude ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const loaded = await loadRepository(args, githubToken, exclusions);
  const store = loaded.store;

  const provider =
    args.enableAi && apiKey && args.modelId
      ? createProviderAdapter(
          ProviderSettingsSchema.parse({
            providerId: args.providerId,
            modelId: args.modelId,
            endpoint: process.env.SENTINEL_API_ENDPOINT,
            customEndpointConfirmed: Boolean(process.env.SENTINEL_API_ENDPOINT),
            requestTimeoutMs: 120_000,
            maxConcurrency: 3,
            maxRetries: 2,
          }),
        )
      : undefined;

  const report = await runAnalysisOrchestrator({
    mode: ANALYSIS_MODE.DEEP_RUNNER,
    repository: {
      sourceType: loaded.sourceType,
      url: args.repositoryUrl,
      owner: loaded.owner,
      name: loaded.name,
      commitSha: loaded.commitSha,
      ref: loaded.ref,
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
    priorMemory: await readPriorMemory(args.memoryPath, args.dispositionPath, loaded.repositoryKey),
  });

  const sanitized = sanitizeReportForExport(report);
  await mkdir(args.outputDir, { recursive: true });
  const jsonPath = path.join(args.outputDir, `report-${sanitized.id}.json`);
  const mdPath = path.join(args.outputDir, `report-${sanitized.id}.md`);
  await writeFile(jsonPath, JSON.stringify(sanitized, null, 2), "utf8");
  await writeFile(mdPath, reportToMarkdown(sanitized), "utf8");
  const sarifPath = path.join(args.outputDir, `report-${sanitized.id}.sarif`);
  await writeFile(sarifPath, reportToSarif(sanitized), "utf8");
  console.log(`Wrote ${sarifPath}`);
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
    if (!loaded.owner || !loaded.name) {
      throw new Error("A GitHub owner and name are required to post a pull request review");
    }
    const changedFiles = await fetchPullRequestFileNames(
      { owner: loaded.owner, name: loaded.name, ref: loaded.ref },
      args.pullRequestNumber,
      { token: githubToken, runtime: "node" },
    );
    const changed = new Set(changedFiles);
    const inlineComments = report.pullRequestReview.inlineComments.filter((comment) => changed.has(comment.path));
    await postPullRequestReview(
      { owner: loaded.owner, name: loaded.name, ref: loaded.ref },
      args.pullRequestNumber,
      loaded.commitSha ?? "",
      report.pullRequestReview.commentBody,
      inlineComments,
      { token: githubToken, runtime: "node" },
    );
    console.log(`Posted review comment on pull request #${args.pullRequestNumber}`);
  }
  if (args.failOnRisk !== undefined) {
    const blocking = findingsBlockingGate(sanitized.findings, args.failOnRisk);
    if (blocking.length > 0) {
      console.error(
        `${blocking.length} finding(s) at or above risk ${args.failOnRisk}. First: ${blocking[0]?.title ?? "finding"}`,
      );
      process.exitCode = 1;
    }
  }
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
}

async function readPriorMemory(
  memoryPath: string | undefined,
  dispositionPath: string | undefined,
  repositoryKey: string,
): Promise<AuditMemory | undefined> {
  const base = memoryPath
    ? AuditMemorySchema.parse(JSON.parse(await readFile(memoryPath, "utf8")))
    : emptyMemory(repositoryKey);
  if (!dispositionPath) {
    return memoryPath ? base : undefined;
  }
  const parsed = DispositionFileSchema.parse(JSON.parse(await readFile(dispositionPath, "utf8")));
  let memory = base;
  for (const record of parsed) {
    memory = rememberDisposition(memory, record.stableKey, record.disposition, record.note);
  }
  return memory;
}

function emptyMemory(repositoryKey: string): AuditMemory {
  return {
    repositoryKey,
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

async function loadRepository(
  args: z.infer<typeof CliArgsSchema>,
  githubToken: string | undefined,
  exclusions: string[],
): Promise<{
  store: ReturnType<typeof buildRepositoryStore>;
  sourceType: "github" | "zip";
  owner?: string;
  name?: string;
  commitSha?: string;
  ref?: string;
  repositoryKey: string;
}> {
  if (args.repositoryPath) {
    const files = await readLocalRepositoryFiles(args.repositoryPath);
    const folderName = path.basename(path.resolve(args.repositoryPath));
    return {
      store: buildRepositoryStore(files, { userExclusions: exclusions }),
      sourceType: "zip",
      name: folderName,
      repositoryKey: folderName,
    };
  }
  const repositoryUrl = args.repositoryUrl;
  if (!repositoryUrl) {
    throw new Error("Provide --repositoryUrl or --repositoryPath");
  }
  const repoRef = parseGitHubRepositoryUrl(repositoryUrl);
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
  return {
    store: buildRepositoryStore(
      fetched.files.map((file) => ({ path: file.path, content: file.content })),
      { commitSha: fetched.commitSha, userExclusions: exclusions },
    ),
    sourceType: "github",
    owner: repoRef.owner,
    name: repoRef.name,
    commitSha: fetched.commitSha,
    ref: repoRef.ref,
    repositoryKey: `${repoRef.owner}/${repoRef.name}`,
  };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
