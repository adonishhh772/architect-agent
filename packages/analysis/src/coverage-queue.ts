import { AUDIT_AGENT } from "@sentinel/schema";
import { AUDIT_LIMITS, scorePathForAgent } from "./evidence-packs.js";

const SECURITY_AGENTS = [
  AUDIT_AGENT.STRIDE,
  AUDIT_AGENT.OWASP,
  AUDIT_AGENT.ATLAS,
  AUDIT_AGENT.DATA,
  AUDIT_AGENT.INFRASTRUCTURE,
  AUDIT_AGENT.CARTOGRAPHER,
] as const;

export function scorePathForCoverage(filePath: string): number {
  let score = 0;
  for (const agentId of SECURITY_AGENTS) {
    score += scorePathForAgent(filePath, agentId);
  }
  return score;
}

export function selectUnreadBatch(
  paths: string[],
  alreadyRead: ReadonlySet<string>,
  contents: Map<string, string>,
  limit: number = AUDIT_LIMITS.READER_BATCH_FILES,
  maxChars: number = AUDIT_LIMITS.READER_BATCH_CHARS,
): string[] {
  const ranked = paths
    .filter((path) => !alreadyRead.has(path))
    .map((path) => ({ path, score: scorePathForCoverage(path) }));
  ranked.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));

  const selected: string[] = [];
  let usedChars = 0;
  for (const entry of ranked) {
    if (selected.length >= limit) {
      break;
    }
    const size = contents.get(entry.path)?.length ?? 0;
    if (selected.length > 0 && usedChars + size > maxChars) {
      break;
    }
    selected.push(entry.path);
    usedChars += size;
  }
  return selected;
}

export function listUnreadPaths(paths: string[], alreadyRead: ReadonlySet<string>): string[] {
  const unread: string[] = [];
  for (const path of paths) {
    if (!alreadyRead.has(path)) {
      unread.push(path);
    }
  }
  return unread;
}
