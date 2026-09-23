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
  lines.push("## What this repository is");
  lines.push(sanitizeMarkdownText(report.architectureProfile?.purpose ?? report.architectureOverview ?? "No architecture summary was produced."));
  if (report.architectureProfile) {
    lines.push("");
    lines.push(
      `Languages: ${report.architectureProfile.languages.join(", ") || "none detected"}. Modules: ${report.architectureProfile.moduleCount}. HTTP entries: ${report.architectureProfile.apiEntryCount}. Data stores: ${report.architectureProfile.dataStoreCount}.`,
    );
    for (const highlight of report.architectureProfile.highlights) {
      lines.push(`- ${sanitizeMarkdownText(highlight)}`);
    }
  }
  lines.push("");
  lines.push("## Architecture overview");
  lines.push(sanitizeMarkdownText(report.architectureOverview ?? "No cartographer overview was produced."));
  lines.push("");
  if (report.agentTrace.length > 0) {
    lines.push("## Agent trace");
    for (const entry of report.agentTrace) {
      lines.push(`- ${entry.agentId}: ${entry.status} (${entry.toolCallCount} tool calls) — ${sanitizeMarkdownText(entry.detail)}`);
    }
    lines.push("");
  }
  if (report.pullRequestReview) {
    lines.push("## Pull request review");
    lines.push(sanitizeMarkdownText(report.pullRequestReview.commentBody));
    lines.push("");
  }
  lines.push("## Findings");
  for (const finding of report.findings) {
    lines.push(`### ${sanitizeMarkdownText(finding.title)} (${finding.id})`);
    lines.push(`- Category: ${finding.category}`);
    lines.push(`- Status: ${finding.status}`);
    lines.push(`- Confidence: ${finding.confidence}`);
    if (finding.strideCategories.length > 0) {
      lines.push(`- STRIDE: ${finding.strideCategories.join(", ")}`);
    }
    if ((finding.owaspCategories ?? []).length > 0) {
      lines.push(`- OWASP: ${(finding.owaspCategories ?? []).join(", ")}`);
    }
    if ((finding.atlasTechniqueIds ?? []).length > 0) {
      lines.push(`- MITRE ATLAS: ${(finding.atlasTechniqueIds ?? []).join(", ")}`);
    }
    if ((finding.riskDomains ?? []).length > 0) {
      lines.push(`- Risk domains: ${(finding.riskDomains ?? []).join(", ")}`);
    }
    if (finding.riskScore !== undefined) {
      lines.push(`- Risk: ${finding.riskScore} (impact ${finding.impact ?? "-"}, likelihood ${finding.likelihood ?? "-"}, rank ${finding.remediationRank ?? "-"})`);
    }
    if (finding.lifecycle) {
      lines.push(`- Lifecycle: ${finding.lifecycle}`);
    }
    if (finding.dataFlow) {
      lines.push(`- Data flow: ${sanitizeMarkdownText(finding.dataFlow.summary)}`);
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
