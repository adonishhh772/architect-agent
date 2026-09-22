import type { AiProviderAdapter } from "@sentinel/providers";
import { parseJsonWithRepair } from "@sentinel/providers";
import type { AnalysisReport } from "@sentinel/schema";
import { STRIDE_CATEGORY } from "@sentinel/schema";
import type { RepositoryStore } from "@sentinel/ingestion";
import { z } from "zod";
import { buildEvidenceCorpus } from "./evidence-corpus.js";
import {
  ANALYZER_SYSTEM_PROMPT,
  buildAiInvestigationUserPrompt,
  sanitizeRepositorySnippetForPrompt,
} from "./prompt-safety.js";

const StridePassSchema = z.object({
  threatModelOverview: z.string().max(8000).optional(),
  findings: z
    .array(
      z.object({
        stableKey: z.string(),
        title: z.string(),
        category: z.enum(["architecture", "security", "ai_security"]),
        strideCategories: z.array(z.string()).optional(),
        scenario: z.string(),
        mitigation: z.string(),
        preconditions: z.array(z.string()).optional(),
        trustBoundaryCrossings: z.array(z.string()).optional(),
        existingControls: z.array(z.string()).optional(),
        counterevidence: z.array(z.string()).optional(),
        openQuestions: z.array(z.string()).optional(),
        severityRationale: z.string().optional(),
        likelihoodRationale: z.string().optional(),
        confidence: z.number().min(0).max(1),
        references: z
          .array(
            z.object({
              path: z.string(),
              startLine: z.number().optional(),
              endLine: z.number().optional(),
            }),
          )
          .optional(),
      }),
    )
    .max(16),
  attackPaths: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        stepStableKeys: z.array(z.string()).min(1),
      }),
    )
    .max(6)
    .optional(),
});

const STRIDE_PASS_ORDER: Array<(typeof STRIDE_CATEGORY)[keyof typeof STRIDE_CATEGORY]> = [
  STRIDE_CATEGORY.SPOOFING,
  STRIDE_CATEGORY.TAMPERING,
  STRIDE_CATEGORY.REPUDIATION,
  STRIDE_CATEGORY.INFORMATION_DISCLOSURE,
  STRIDE_CATEGORY.DENIAL_OF_SERVICE,
  STRIDE_CATEGORY.ELEVATION_OF_PRIVILEGE,
];

export interface DeepInvestigationAgentOptions {
  store: RepositoryStore;
  graph: AnalysisReport["graph"];
  provider: AiProviderAdapter;
  apiKey: string;
  signal?: AbortSignal;
  budget?: { maxRequests?: number; maxTokens?: number };
  onPhase?: (message: string, completed: number, total: number) => void;
  onUsage?: (usage: { totalTokens: number }) => void;
  getUsage?: () => { requestsUsed: number; tokensUsed: number };
}

export interface DeepInvestigationAgentResult {
  findings: AnalysisReport["findings"];
  attackPaths: AnalysisReport["attackPaths"];
  threatModelOverview?: string;
  filesSampled: number;
  totalIndexedFiles: number;
  aiPassesCompleted: number;
}

function isStrideCategory(value: string): value is AnalysisReport["findings"][number]["strideCategories"][number] {
  return Object.values(STRIDE_CATEGORY).includes(value as (typeof STRIDE_CATEGORY)[keyof typeof STRIDE_CATEGORY]);
}

function mapAiFindings(
  items: z.infer<typeof StridePassSchema>["findings"],
  commitSha: string | undefined,
): AnalysisReport["findings"] {
  return items.map((item) => ({
    id: `finding-${item.stableKey}`,
    stableKey: item.stableKey,
    title: item.title,
    category: item.category,
    strideCategories: (item.strideCategories ?? []).filter(isStrideCategory),
    status: "plausible_threat_requiring_verification" as const,
    affectedNodeIds: [],
    affectedAssetSummary: item.references?.[0]?.path ?? "unknown",
    commitSha,
    references: (item.references ?? []).map((ref) => ({
      path: ref.path,
      startLine: ref.startLine,
      endLine: ref.endLine,
      commitSha,
    })),
    evidence: [],
    scenario: item.scenario,
    preconditions: item.preconditions ?? [],
    trustBoundaryCrossings: item.trustBoundaryCrossings ?? [],
    existingControls: item.existingControls ?? [],
    counterevidence: item.counterevidence ?? [],
    confidence: item.confidence,
    severityRationale: item.severityRationale ?? "AI-assisted hypothesis; confirm with testing.",
    likelihoodRationale: item.likelihoodRationale ?? "Based on indexed repository evidence.",
    assumptions: ["AI-generated finding requires verification"],
    openQuestions: item.openQuestions ?? [],
    mitigation: item.mitigation,
    relatedFindingIds: [],
    attackPathIds: [],
  }));
}

function budgetAllowsRequest(options: DeepInvestigationAgentOptions): boolean {
  const usage = options.getUsage?.() ?? { requestsUsed: 0, tokensUsed: 0 };
  if (
    options.budget?.maxRequests !== undefined &&
    usage.requestsUsed >= options.budget.maxRequests
  ) {
    return false;
  }
  if (options.budget?.maxTokens !== undefined && usage.tokensUsed >= options.budget.maxTokens) {
    return false;
  }
  return true;
}

export async function runDeepInvestigationAgent(
  options: DeepInvestigationAgentOptions,
): Promise<DeepInvestigationAgentResult> {
  const corpus = buildEvidenceCorpus(options.store);
  const commitSha = options.store.index.commitSha;
  const trustBoundaryCount = options.graph.nodes.filter((node) => node.kind === "trust_boundary").length;
  const graphSummary = `nodes=${options.graph.nodes.length}, edges=${options.graph.edges.length}, trust_boundary_nodes=${trustBoundaryCount}`;

  const mergedFindings = new Map<string, AnalysisReport["findings"][number]>();
  const attackPathMap = new Map<string, AnalysisReport["attackPaths"][number]>();
  let threatModelOverview = "";
  let passesCompleted = 0;

  const totalPhases = STRIDE_PASS_ORDER.length + 1;

  options.onPhase?.("Building repository evidence corpus", 1, totalPhases);

  for (let passIndex = 0; passIndex < STRIDE_PASS_ORDER.length; passIndex += 1) {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    if (!budgetAllowsRequest(options)) {
      break;
    }

    const strideFocus = STRIDE_PASS_ORDER[passIndex];
    options.onPhase?.(`STRIDE pass: ${strideFocus}`, passIndex + 2, totalPhases);

    const passPrompt = [
      buildAiInvestigationUserPrompt(
        [
          `Deep review for STRIDE category: ${strideFocus}`,
          "Analyze ALL indexed paths in the manifest — not only the snippets.",
          "Cross-reference frontend, backend, infra, auth, and AI/agent code.",
          "Produce specific findings with file references for this STRIDE category.",
        ],
        corpus.snippets,
        graphSummary,
      ),
      "",
      corpus.fileManifest,
      "",
      `Prior pass finding keys already reported (avoid duplicates): ${[...mergedFindings.keys()].join(", ") || "none"}`,
    ].join("\n");

    const completion = await options.provider.complete(options.apiKey, {
      messages: [
        { role: "system", content: ANALYZER_SYSTEM_PROMPT },
        { role: "user", content: passPrompt },
      ],
      jsonSchema: {},
      maxOutputTokens: 8192,
    });

    options.onUsage?.(completion.usage);
    passesCompleted += 1;

    const parsed = parseJsonWithRepair(completion.text, StridePassSchema);
    if (!parsed.success) {
      continue;
    }

    if (parsed.data.threatModelOverview) {
      threatModelOverview = `${threatModelOverview}\n\n${parsed.data.threatModelOverview}`.trim();
    }

    for (const finding of mapAiFindings(parsed.data.findings, commitSha)) {
      mergedFindings.set(finding.stableKey, finding);
    }

    for (const path of parsed.data.attackPaths ?? []) {
      attackPathMap.set(path.id, {
        id: path.id,
        title: path.title,
        description: path.description,
        stepFindingIds: [],
        prerequisiteFindingIds: [],
        unsupportedLinks: path.stepStableKeys,
      });
    }
  }

  if (budgetAllowsRequest(options) && mergedFindings.size < 6) {
    options.onPhase?.("Final synthesis pass", totalPhases, totalPhases);
    const synthesisPrompt = sanitizeRepositorySnippetForPrompt(
      [
        "Synthesize additional architecture and AI-security findings missed earlier.",
        corpus.fileManifest,
        ...corpus.snippets.slice(0, 20),
      ].join("\n\n"),
    );
    const completion = await options.provider.complete(options.apiKey, {
      messages: [
        { role: "system", content: ANALYZER_SYSTEM_PROMPT },
        {
          role: "user",
          content: `${buildAiInvestigationUserPrompt(["Final gap analysis across entire codebase"], corpus.snippets.slice(0, 30), graphSummary)}\n\n${synthesisPrompt}`,
        },
      ],
      jsonSchema: {},
      maxOutputTokens: 8192,
    });
    options.onUsage?.(completion.usage);
    passesCompleted += 1;
    const parsed = parseJsonWithRepair(completion.text, StridePassSchema);
    if (parsed.success) {
      for (const finding of mapAiFindings(parsed.data.findings, commitSha)) {
        mergedFindings.set(finding.stableKey, finding);
      }
    }
  }

  const findings = [...mergedFindings.values()];
  const findingIdByStableKey = new Map(findings.map((finding) => [finding.stableKey, finding.id]));
  const attackPaths: AnalysisReport["attackPaths"] = [...attackPathMap.values()].map((path) => ({
    ...path,
    stepFindingIds: path.unsupportedLinks
      .map((stableKey) => findingIdByStableKey.get(stableKey))
      .filter((findingId): findingId is string => Boolean(findingId)),
  }));

  return {
    findings,
    attackPaths,
    threatModelOverview: threatModelOverview || undefined,
    filesSampled: corpus.filesSampled,
    totalIndexedFiles: corpus.totalIndexedFiles,
    aiPassesCompleted: passesCompleted,
  };
}
