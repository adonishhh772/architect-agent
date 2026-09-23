import type { Finding } from "@sentinel/schema";
import { RISK_DOMAIN } from "@sentinel/schema";

const RISK_DOMAIN_ORDER = [
  RISK_DOMAIN.CYBERSECURITY,
  RISK_DOMAIN.DATA,
  RISK_DOMAIN.INFRASTRUCTURE,
  RISK_DOMAIN.AI_EXECUTION,
] as const;

export interface RiskDomainGroup {
  domain: (typeof RISK_DOMAIN_ORDER)[number];
  findings: Finding[];
}

export function groupFindingsByRiskDomain(findings: Finding[]): RiskDomainGroup[] {
  return RISK_DOMAIN_ORDER.map((domain) => ({
    domain,
    findings: findings.filter((finding) => (finding.riskDomains ?? []).includes(domain)),
  }));
}

export function countFrameworkTags(findings: Finding[]): { owasp: number; atlas: number; stride: number } {
  let owasp = 0;
  let atlas = 0;
  let stride = 0;
  for (const finding of findings) {
    if ((finding.owaspCategories ?? []).length > 0) {
      owasp += 1;
    }
    if ((finding.atlasTechniqueIds ?? []).length > 0) {
      atlas += 1;
    }
    if (finding.strideCategories.length > 0) {
      stride += 1;
    }
  }
  return { owasp, atlas, stride };
}
