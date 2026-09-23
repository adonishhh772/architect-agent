import {
  FINDING_LIFECYCLE,
  type AuditMemory,
  type Finding,
  type FindingRecord,
  type PullRequestReview,
} from "@sentinel/schema";

const COMMENT_FINDING_LIMIT = 8;
const RECORD_LIMIT = 400;

export interface FindingLifecycleResult {
  findings: Finding[];
  records: FindingRecord[];
  newFindingKeys: string[];
  fixedFindingKeys: string[];
  regressedFindingKeys: string[];
}

export function reconcileFindingLifecycle(input: {
  findings: Finding[];
  priorMemory?: AuditMemory;
  commitSha?: string;
}): FindingLifecycleResult {
  const prior = priorLifecycle(input.priorMemory);
  const currentKeys = new Set(input.findings.map((finding) => finding.stableKey));
  const fixedFindingKeys: string[] = [];
  for (const [stableKey, lifecycle] of prior) {
    if (!currentKeys.has(stableKey) && lifecycle !== FINDING_LIFECYCLE.FIXED) {
      fixedFindingKeys.push(stableKey);
    }
  }

  const newFindingKeys: string[] = [];
  const regressedFindingKeys: string[] = [];
  const findings = input.findings.map((finding) => {
    const previous = prior.get(finding.stableKey);
    if (previous === FINDING_LIFECYCLE.FIXED) {
      regressedFindingKeys.push(finding.stableKey);
      return { ...finding, lifecycle: FINDING_LIFECYCLE.REGRESSED };
    }
    if (!previous) {
      newFindingKeys.push(finding.stableKey);
    }
    return { ...finding, lifecycle: FINDING_LIFECYCLE.OPEN };
  });

  const records: FindingRecord[] = [
    ...findings.map((finding) => ({
      stableKey: finding.stableKey,
      lifecycle: finding.lifecycle ?? FINDING_LIFECYCLE.OPEN,
      commitSha: input.commitSha,
    })),
    ...fixedFindingKeys.map((stableKey) => ({
      stableKey,
      lifecycle: FINDING_LIFECYCLE.FIXED,
      commitSha: input.commitSha,
    })),
  ].slice(0, RECORD_LIMIT);

  return { findings, records, newFindingKeys, fixedFindingKeys, regressedFindingKeys };
}

export function buildPullRequestReview(input: {
  findings: Finding[];
  lifecycle: FindingLifecycleResult;
  hasPriorMemory: boolean;
}): PullRequestReview {
  const highlighted = input.findings
    .filter((finding) => !finding.duplicateOfStableKey)
    .filter(
      (finding) =>
        input.lifecycle.regressedFindingKeys.includes(finding.stableKey) ||
        input.lifecycle.newFindingKeys.includes(finding.stableKey) ||
        !input.hasPriorMemory,
    )
    .slice(0, COMMENT_FINDING_LIMIT);

  const lines = [
    "## Architecture Sentinel review",
    "",
    "Advisory only. This comment lists missing controls and mitigations. It does not include exploit steps.",
    "",
  ];
  if (!input.hasPriorMemory) {
    lines.push("First snapshot for this repository. Later runs will mark findings fixed or regressed.");
    lines.push("");
  }
  lines.push("### New or regressed");
  if (highlighted.length === 0) {
    lines.push("- No new findings in this snapshot.");
  } else {
    for (const finding of highlighted) {
      const reference = finding.references[0];
      const location = reference
        ? `${reference.path}${reference.startLine ? `:${reference.startLine}` : ""}`
        : finding.affectedAssetSummary;
      const lifecycle = finding.lifecycle ?? FINDING_LIFECYCLE.OPEN;
      lines.push(`- [${lifecycle}] ${finding.title} (\`${location}\`) — ${firstSentence(finding.mitigation)}`);
    }
  }
  lines.push("");
  lines.push("### Fixed since the last snapshot");
  if (input.lifecycle.fixedFindingKeys.length === 0) {
    lines.push("- None.");
  } else {
    for (const stableKey of input.lifecycle.fixedFindingKeys.slice(0, COMMENT_FINDING_LIMIT)) {
      lines.push(`- \`${stableKey}\``);
    }
  }
  lines.push("");
  lines.push(
    `Regressed: ${input.lifecycle.regressedFindingKeys.length}. Fixed: ${input.lifecycle.fixedFindingKeys.length}.`,
  );

  return {
    commentBody: lines.join("\n").slice(0, 16000),
    newFindingKeys: input.lifecycle.newFindingKeys,
    fixedFindingKeys: input.lifecycle.fixedFindingKeys,
    regressedFindingKeys: input.lifecycle.regressedFindingKeys,
  };
}

function priorLifecycle(memory: AuditMemory | undefined): Map<string, FindingRecord["lifecycle"]> {
  const prior = new Map<string, FindingRecord["lifecycle"]>();
  if (!memory) {
    return prior;
  }
  if (memory.findingRecords.length > 0) {
    for (const record of memory.findingRecords) {
      prior.set(record.stableKey, record.lifecycle);
    }
    return prior;
  }
  for (const stableKey of memory.priorFindingKeys) {
    prior.set(stableKey, FINDING_LIFECYCLE.OPEN);
  }
  return prior;
}

function firstSentence(text: string): string {
  const sentence = text.split(". ")[0] ?? text;
  return sentence.slice(0, 240);
}
