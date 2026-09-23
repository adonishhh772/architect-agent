import { describe, expect, it } from "vitest";
import { buildRepositoryStore } from "@sentinel/ingestion";
import { ATLAS_TECHNIQUE, OWASP_CATEGORY, RISK_DOMAIN } from "@sentinel/schema";
import { extractArchitectureFromTypeScript } from "@sentinel/graph";
import { generateStaticFindings } from "../static-findings.js";

describe("generateStaticFindings framework tags", () => {
  it("tags published ports, secret logs, and eval with framework ids", () => {
    const store = buildRepositoryStore([
      { path: "src/app.ts", content: "eval('1');\n" },
      { path: "src/logger.ts", content: "console.log(password);\n" },
      { path: "docker-compose.yml", content: "services:\n  db:\n    ports:\n      - \"5432:5432\"\n" },
      { path: ".env", content: "API_KEY=local\n" },
    ]);
    const graph = extractArchitectureFromTypeScript({ files: store.contents });
    const findings = generateStaticFindings({ contents: store.contents, graph });
    const evalFinding = findings.find((finding) => finding.stableKey.startsWith("eval-"));
    const portFinding = findings.find((finding) => finding.stableKey.startsWith("published-port-"));
    const logFinding = findings.find((finding) => finding.stableKey.startsWith("secret-log-"));
    const envFinding = findings.find((finding) => finding.stableKey.startsWith("env-file-"));

    expect(evalFinding?.owaspCategories).toContain(OWASP_CATEGORY.INJECTION);
    expect(evalFinding?.affectedNodeIds.length).toBeGreaterThan(0);
    expect(portFinding?.riskDomains).toContain(RISK_DOMAIN.INFRASTRUCTURE);
    expect(portFinding?.owaspCategories).toContain(OWASP_CATEGORY.SECURITY_MISCONFIGURATION);
    expect(logFinding?.riskDomains).toContain(RISK_DOMAIN.DATA);
    expect(logFinding?.atlasTechniqueIds).toContain(ATLAS_TECHNIQUE.LLM_DATA_LEAKAGE);
    expect(envFinding?.atlasTechniqueIds).toContain(ATLAS_TECHNIQUE.UNSECURED_CREDENTIALS);
  });
});
