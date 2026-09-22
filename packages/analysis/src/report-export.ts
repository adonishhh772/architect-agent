import { sanitizeMarkdownText, type AnalysisReport } from "@sentinel/schema";

export function reportToMarkdown(report: AnalysisReport): string {
  const lines: string[] = [];
  lines.push(`# ${sanitizeMarkdownText(report.title)}`);
  lines.push("");
  lines.push(`**Mode:** ${report.mode}`);
  lines.push(`**Analyzed at:** ${report.repository.analyzedAt}`);
  if (report.repository.commitSha) {
    lines.push(`**Commit:** \`${report.repository.commitSha}\``);
  }
  lines.push("");
  lines.push("## Executive summary");
  lines.push(sanitizeMarkdownText(report.executiveSummary));
  lines.push("");
  lines.push("## Disclaimer");
  lines.push(sanitizeMarkdownText(report.disclaimer));
  lines.push("");
  lines.push("## Findings");
  for (const finding of report.findings) {
    lines.push(`### ${sanitizeMarkdownText(finding.title)} (${finding.id})`);
    lines.push(`- Category: ${finding.category}`);
    lines.push(`- Status: ${finding.status}`);
    lines.push(`- Confidence: ${finding.confidence}`);
    if (finding.strideCategories.length > 0) {
      lines.push(`- STRIDE: ${finding.strideCategories.join(", ")}`);
    }
    lines.push("");
    lines.push(sanitizeMarkdownText(finding.scenario));
    lines.push("");
    lines.push(`**Mitigation:** ${sanitizeMarkdownText(finding.mitigation)}`);
    if (finding.references.length > 0) {
      lines.push("");
      lines.push("**Evidence references:**");
      for (const ref of finding.references) {
        const range =
          ref.startLine !== undefined
            ? `:${ref.startLine}${ref.endLine !== undefined ? `-${ref.endLine}` : ""}`
            : "";
        lines.push(`- \`${ref.path}${range}\``);
      }
    }
    lines.push("");
  }
  lines.push("## Coverage");
  lines.push(`- Indexed files: ${report.coverage.totalFilesIndexed}`);
  lines.push(`- Excluded files: ${report.coverage.excludedFiles}`);
  lines.push(`- Truncated: ${report.coverage.truncated}`);
  if (report.coverage.unresolvedQuestions.length > 0) {
    lines.push("- Unresolved questions:");
    for (const question of report.coverage.unresolvedQuestions) {
      lines.push(`  - ${sanitizeMarkdownText(question)}`);
    }
  }
  return lines.join("\n");
}

export function reportToPrintableHtml(report: AnalysisReport): string {
  const md = reportToMarkdown(report);
  const escaped = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${sanitizeMarkdownText(report.title)}</title><style>body{font-family:system-ui,sans-serif;max-width:900px;margin:2rem auto;line-height:1.5;padding:0 1rem}pre{white-space:pre-wrap;background:#f4f4f5;padding:1rem;border-radius:8px}</style></head><body><pre>${escaped}</pre></body></html>`;
}
