import type { AnalysisReport } from "./report.js";
import { AnalysisReportSchema } from "./report.js";

const SECRET_KEY_PATTERN =
  /^(apiKey|api_key|token|secret|password|authorization|credential)$/i;

export function stripSecretsFromObject(
  value: unknown,
  depth = 0,
): unknown {
  if (depth > 20) {
    return "[truncated]";
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripSecretsFromObject(item, depth + 1));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        continue;
      }
      result[key] = stripSecretsFromObject(val, depth + 1);
    }
    return result;
  }
  return value;
}

export function sanitizeReportForExport(report: AnalysisReport): AnalysisReport {
  const cloned = JSON.parse(JSON.stringify(report)) as AnalysisReport;
  for (const evidence of cloned.findings.flatMap((finding) => finding.evidence)) {
    for (const ref of evidence.references) {
      if (ref.excerpt && ref.excerpt.length > 2000) {
        ref.excerpt = `${ref.excerpt.slice(0, 2000)}…`;
      }
    }
  }
  return AnalysisReportSchema.parse(stripSecretsFromObject(cloned));
}

export function sanitizeMarkdownText(text: string): string {
  return text
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "data-blocked=");
}
