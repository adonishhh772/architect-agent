import type { AiProviderAdapter } from "@sentinel/providers";
import { parseJsonWithRepair } from "@sentinel/providers";
import type { ArchitectureGraph, Finding } from "@sentinel/schema";
import { z } from "zod";
import { ANALYZER_SYSTEM_PROMPT, sanitizeRepositorySnippetForPrompt } from "./prompt-safety.js";
import {
  ToolName,
  executeInvestigationTool,
  type ToolNameValue,
} from "./investigation-tools.js";

const FOLLOW_UP_ROUND_LIMIT = 3;
const ANSWER_LIMIT = 8000;

const FOLLOW_UP_TOOLS = [
  ToolName.READ_FILE_RANGE,
  ToolName.SEARCH_CODE,
  ToolName.FIND_SYMBOL,
  ToolName.FIND_REFERENCES,
  ToolName.FIND_CALLERS,
  ToolName.TRACE_DATA_FLOW,
  ToolName.GET_GRAPH_NEIGHBORHOOD,
] as const;

const FollowUpResponseSchema = z.object({
  answer: z.string().max(8000).default(""),
  citations: z
    .array(
      z.object({
        path: z.string().min(1).max(1000),
        startLine: z.number().int().positive().optional(),
      }),
    )
    .default([]),
  toolCalls: z
    .array(
      z.object({
        tool: z.enum(FOLLOW_UP_TOOLS),
        args: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .max(4)
    .default([]),
});

export interface FollowUpCitation {
  path: string;
  startLine?: number;
}

export interface FollowUpResult {
  answer: string;
  citations: FollowUpCitation[];
  toolObservations: string[];
}

export async function runFollowUpCopilot(input: {
  question: string;
  contents: Map<string, string>;
  graph: ArchitectureGraph;
  findings: Finding[];
  provider: AiProviderAdapter;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<FollowUpResult> {
  const observations: string[] = [];
  let answer = "";
  let citations: FollowUpCitation[] = [];

  for (let round = 0; round < FOLLOW_UP_ROUND_LIMIT; round += 1) {
    if (input.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const completion = await input.provider.complete(input.apiKey, {
      messages: [
        { role: "system", content: followUpSystemPrompt() },
        { role: "user", content: followUpUserPrompt(input.question, input.findings, observations) },
      ],
      temperature: 0,
      maxOutputTokens: 2000,
    });
    const parsed = parseJsonWithRepair(completion.text, FollowUpResponseSchema);
    if (!parsed.success) {
      return {
        answer: "The follow-up answer was not valid JSON. Ask again with a narrower question.",
        citations: [],
        toolObservations: observations,
      };
    }
    const draftAnswer = parsed.data.answer ?? "";
    const draftCitations = parsed.data.citations ?? [];
    const draftToolCalls = parsed.data.toolCalls ?? [];
    answer = keepDefensiveAnswer(draftAnswer);
    citations = draftCitations.filter((citation) => input.contents.has(citation.path));
    if (draftToolCalls.length === 0) {
      break;
    }
    for (const call of draftToolCalls) {
      const observation = executeInvestigationTool(call.tool as ToolNameValue, call.args, {
        contents: input.contents,
        graph: input.graph,
      });
      observations.push(
        sanitizeRepositorySnippetForPrompt(`${call.tool}: ${JSON.stringify(observation).slice(0, 4000)}`),
      );
    }
  }

  if (!answer.trim()) {
    answer = "The indexed snapshot did not contain enough evidence to answer that question.";
  }
  return { answer, citations, toolObservations: observations };
}

function followUpSystemPrompt(): string {
  return `${ANALYZER_SYSTEM_PROMPT}
You are answering one follow-up question about an already indexed repository.
Use toolCalls to read a file range, search, find a symbol, find callers, or trace a data-flow edge before you answer.
Do not provide exploit steps, payloads, or reproduction procedures.
When you can answer, return citations that exist in the snapshot and leave toolCalls empty.
Return JSON only: {"answer":"...","citations":[{"path":"...","startLine":1}],"toolCalls":[{"tool":"readFileRange","args":{"path":"...","startLine":1,"endLine":40}}]}`;
}

function followUpUserPrompt(question: string, findings: Finding[], observations: string[]): string {
  const ranked = findings
    .filter((finding) => !finding.duplicateOfStableKey)
    .slice(0, 8)
    .map((finding) => {
      const flow = finding.dataFlow?.summary ? ` Data flow: ${finding.dataFlow.summary}` : "";
      return `- ${finding.title} (risk ${finding.riskScore ?? "unscored"}, ${finding.lifecycle ?? "open"}).${flow}`;
    });
  return [
    `Question: ${question.slice(0, 2000)}`,
    "Highest ranked findings:",
    ranked.join("\n") || "- None.",
    observations.length > 0 ? `Tool observations:\n${observations.join("\n")}` : "No tool observations yet.",
  ].join("\n");
}

function keepDefensiveAnswer(answer: string): string {
  return answer
    .split("\n")
    .filter((line) => !/payload|proof of concept|exploit step/i.test(line))
    .join("\n")
    .slice(0, ANSWER_LIMIT);
}
