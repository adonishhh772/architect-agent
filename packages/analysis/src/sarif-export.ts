import type { AnalysisReport, Finding } from "@sentinel/schema";

const SARIF_SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json";
const TOOL_NAME = "Architecture Sentinel";

export function reportToSarif(report: AnalysisReport): string {
  const findings = report.findings.filter((finding) => !finding.duplicateOfStableKey);
  const rules = uniqueRules(findings);
  const document = {
    $schema: SARIF_SCHEMA,
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: TOOL_NAME,
            version: report.schemaVersion,
            informationUri: "https://github.com/adonishhh772/architect-agent",
            rules: rules.map((rule) => ({
              id: rule.id,
              shortDescription: { text: rule.title },
              help: { text: rule.mitigation },
              properties: {
                tags: rule.cweIds,
              },
            })),
          },
        },
        results: findings.map((finding) => sarifResult(finding)),
      },
    ],
  };
  return JSON.stringify(document, null, 2);
}

function uniqueRules(findings: Finding[]): Array<{ id: string; title: string; mitigation: string; cweIds: string[] }> {
  const rules = new Map<string, { id: string; title: string; mitigation: string; cweIds: string[] }>();
  for (const finding of findings) {
    if (rules.has(finding.stableKey)) {
      continue;
    }
    rules.set(finding.stableKey, {
      id: finding.stableKey,
      title: finding.title,
      mitigation: finding.mitigation,
      cweIds: finding.cweIds ?? [],
    });
  }
  return [...rules.values()];
}

function sarifResult(finding: Finding): {
  ruleId: string;
  level: string;
  message: { text: string };
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string };
      region?: { startLine: number };
    };
  }>;
} {
  const reference = finding.references[0];
  const location = reference
    ? {
        physicalLocation: {
          artifactLocation: { uri: reference.path },
          region: reference.startLine ? { startLine: reference.startLine } : undefined,
        },
      }
    : {
        physicalLocation: {
          artifactLocation: { uri: finding.affectedAssetSummary },
        },
      };
  return {
    ruleId: finding.stableKey,
    level: sarifLevel(finding.riskScore ?? 0),
    message: { text: `${finding.title}. ${finding.mitigation}` },
    locations: [location],
  };
}

function sarifLevel(riskScore: number): string {
  if (riskScore >= 16) {
    return "error";
  }
  if (riskScore >= 8) {
    return "warning";
  }
  return "note";
}
