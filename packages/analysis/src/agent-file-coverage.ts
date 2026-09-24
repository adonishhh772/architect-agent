export interface AgentFileCoverage {
  filesRead: number;
  unreadCount: number;
  status: "complete" | "partial";
  detail: string;
}

export function describeAgentFileCoverage(filesRead: number, filesIndexed: number, filesPartial = 0): AgentFileCoverage {
  const unreadCount = Math.max(0, filesIndexed - filesRead);
  const partialNote = `${filesPartial} files were only partly read.`;
  if (unreadCount === 0 && filesPartial === 0) {
    return {
      filesRead,
      unreadCount: 0,
      status: "complete",
      detail: `Agents read all ${filesIndexed} indexed files. ${partialNote}`,
    };
  }
  return {
    filesRead,
    unreadCount,
    status: "partial",
    detail: `Agents read ${filesRead} indexed files and did not read ${unreadCount}. ${partialNote} A weakness below a partial window stays unread until the reader continues. Deterministic scanners still checked the indexed snapshot.`,
  };
}
