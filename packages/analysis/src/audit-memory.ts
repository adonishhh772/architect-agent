import { FINDING_LIFECYCLE, type AuditMemory, type Finding } from "@sentinel/schema";
import type { PullRequestSnapshot } from "@sentinel/ingestion";

const OPEN_QUESTION_LIMIT = 40;

export function buildAuditMemory(input: {
  repositoryKey: string;
  commitSha?: string;
  architectureBrief?: string;
  indexedPaths: string[];
  pathsRead: readonly string[];
  pathsPartial: readonly string[];
  findings: Finding[];
  pullRequests: PullRequestSnapshot[];
  updatedAt: string;
}): AuditMemory {
  const readSet = new Set(input.pathsRead);
  const filesUnread = input.indexedPaths.filter((path) => !readSet.has(path));
  const openQuestions: string[] = [];
  for (const finding of input.findings) {
    for (const question of finding.openQuestions) {
      if (openQuestions.length >= OPEN_QUESTION_LIMIT) {
        break;
      }
      if (!openQuestions.includes(question)) {
        openQuestions.push(question);
      }
    }
  }
  return {
    repositoryKey: input.repositoryKey,
    commitSha: input.commitSha,
    architectureBrief: input.architectureBrief,
    filesRead: [...readSet],
    filesPartial: [...new Set(input.pathsPartial)],
    filesUnread,
    openQuestions,
    priorFindingKeys: input.findings.map((finding) => finding.stableKey),
    findingRecords: [],
    pullRequestsReviewed: input.pullRequests.map((pullRequest) => ({
      number: pullRequest.number,
      title: pullRequest.title.slice(0, 500),
      state: pullRequest.state.slice(0, 40),
      filenames: pullRequest.files.map((file) => file.filename).slice(0, 40),
    })),
    updatedAt: input.updatedAt,
  };
}

export function formatMemoryForPrompt(memory: AuditMemory | undefined): string {
  if (!memory) {
    return "No prior memory for this repository.";
  }
  const unreadPreview = memory.filesUnread.slice(0, 30).map((path) => `- ${path}`);
  const questions = memory.openQuestions.slice(0, 12).map((question) => `- ${question}`);
  return [
    `Prior snapshot ${memory.commitSha ?? "unknown commit"} updated ${memory.updatedAt}.`,
    memory.architectureBrief ? `Prior architecture brief: ${memory.architectureBrief}` : "",
    `Previously read ${memory.filesRead.length} files. Unread last time: ${memory.filesUnread.length}.`,
    unreadPreview.length > 0 ? unreadPreview.join("\n") : "",
    questions.length > 0 ? `Open questions:\n${questions.join("\n")}` : "",
    memory.pullRequestsReviewed.length > 0
      ? `Pull requests already noted: ${memory.pullRequestsReviewed.map((pullRequest) => `#${pullRequest.number}`).join(", ")}`
      : "",
    `Finding lifecycle: ${countLifecycle(memory, FINDING_LIFECYCLE.OPEN)} open, ${countLifecycle(memory, FINDING_LIFECYCLE.FIXED)} fixed, ${countLifecycle(memory, FINDING_LIFECYCLE.REGRESSED)} regressed.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function countLifecycle(memory: AuditMemory, lifecycle: FindingRecordLifecycle): number {
  return memory.findingRecords.filter((record) => record.lifecycle === lifecycle).length;
}

type FindingRecordLifecycle = AuditMemory["findingRecords"][number]["lifecycle"];
