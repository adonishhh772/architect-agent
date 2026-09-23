#!/usr/bin/env node
import { runAnalysisOrchestrator } from "@sentinel/analysis";
import { buildRepositoryStore } from "@sentinel/ingestion";
import { ANALYSIS_MODE, type AnalysisReport } from "@sentinel/schema";
import readline from "node:readline";
import path from "node:path";
import { readLocalRepositoryFiles } from "./local-repository.js";

const SERVER_NAME = "architecture-sentinel";
const PROTOCOL_VERSION = "2024-11-05";
const FINDING_PREVIEW_LIMIT = 40;

const TOOLS = [
  {
    name: "scan_repository",
    description:
      "Read a local repository and return its purpose, architecture counts, and advisory vulnerability findings. Does not execute repository code or call a model.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or relative path to the repository root." },
      },
      required: ["path"],
    },
  },
  {
    name: "explain_architecture",
    description: "Summarize what the repository is, which languages it contains, and how its entries, stores, and external systems connect.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
      },
      required: ["path"],
    },
  },
  {
    name: "list_findings",
    description: "List advisory findings for a local repository. Optional language filter: javascript, python, or go.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        language: { type: "string" },
      },
      required: ["path"],
    },
  },
] as const;

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: unknown;
}

function main(): void {
  const reader = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  reader.on("line", (line) => {
    void handleLine(line);
  });
}

async function handleLine(line: string): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }
  let request: JsonRpcRequest;
  try {
    request = JSON.parse(trimmed) as JsonRpcRequest;
  } catch {
    writeMessage({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  if (request.id === undefined || request.id === null) {
    return;
  }
  try {
    const result = await dispatch(request.method ?? "", request.params);
    writeMessage({ jsonrpc: "2.0", id: request.id, result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Tool failed";
    writeMessage({ jsonrpc: "2.0", id: request.id, error: { code: -32000, message } });
  }
}

async function dispatch(method: string, params: unknown): Promise<unknown> {
  if (method === "initialize") {
    return {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: "1.0.0" },
    };
  }
  if (method === "ping") {
    return {};
  }
  if (method === "tools/list") {
    return { tools: TOOLS };
  }
  if (method === "tools/call") {
    return callTool(params);
  }
  throw new Error(`Unknown method ${method}`);
}

async function callTool(params: unknown): Promise<unknown> {
  const record = readRecord(params);
  const name = typeof record.name === "string" ? record.name : "";
  const args = readRecord(record.arguments);
  const repositoryPath = typeof args.path === "string" ? args.path : "";
  if (!repositoryPath) {
    throw new Error("path is required");
  }
  const report = await scanRepository(repositoryPath);
  if (name === "explain_architecture") {
    return textResult(explainArchitecture(report));
  }
  if (name === "list_findings") {
    const language = typeof args.language === "string" ? args.language : undefined;
    return textResult(listFindings(report, language));
  }
  if (name === "scan_repository") {
    return textResult(`${explainArchitecture(report)}\n\n${listFindings(report, undefined)}`);
  }
  throw new Error(`Unknown tool ${name}`);
}

async function scanRepository(repositoryPath: string): Promise<AnalysisReport> {
  const files = await readLocalRepositoryFiles(repositoryPath);
  const store = buildRepositoryStore(files);
  const folderName = path.basename(path.resolve(repositoryPath));
  return runAnalysisOrchestrator({
    mode: ANALYSIS_MODE.DEEP_RUNNER,
    repository: {
      sourceType: "zip",
      name: folderName,
      analyzedAt: new Date().toISOString(),
    },
    store,
    enableAi: false,
  });
}

function explainArchitecture(report: AnalysisReport): string {
  const profile = report.architectureProfile;
  const lines = [
    profile?.purpose ?? report.executiveSummary,
    profile ? `Languages: ${profile.languages.join(", ") || "none"}.` : "",
    profile
      ? `Modules ${profile.moduleCount}, HTTP entries ${profile.apiEntryCount}, data stores ${profile.dataStoreCount}, external systems ${profile.externalSystemCount}, trust boundaries ${profile.trustBoundaryCount}.`
      : "",
    ...(profile?.highlights ?? []),
  ];
  return lines.filter((line) => line.length > 0).join("\n");
}

function listFindings(report: AnalysisReport, language: string | undefined): string {
  const findings = report.findings
    .filter((finding) => !finding.duplicateOfStableKey)
    .filter((finding) => (language ? finding.language === language : true))
    .slice(0, FINDING_PREVIEW_LIMIT);
  if (findings.length === 0) {
    return "No advisory findings for that filter.";
  }
  return findings
    .map((finding) => {
      const reference = finding.references[0];
      const location = reference ? `${reference.path}:${reference.startLine ?? 1}` : finding.affectedAssetSummary;
      const cwe = (finding.cweIds ?? []).join(", ");
      return `- ${finding.title} [${finding.language ?? "other"}] ${cwe} (${location}). ${finding.mitigation}`;
    })
    .join("\n");
}

function textResult(text: string): unknown {
  return { content: [{ type: "text", text }] };
}

function readRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function writeMessage(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

main();
