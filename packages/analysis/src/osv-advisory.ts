import { moduleNodeIdForPath } from "@sentinel/graph";
import {
  FINDING_CATEGORY,
  FINDING_STATUS,
  OWASP_CATEGORY,
  RISK_DOMAIN,
  STRIDE_CATEGORY,
  type ArchitectureGraph,
  type Finding,
} from "@sentinel/schema";
import { listPackageInventory, type PackageCoordinate } from "./dependency-inventory.js";

const OSV_QUERY_URL = "https://api.osv.dev/v1/querybatch";
const BATCH_SIZE = 32;
const ADVISORY_SUMMARY_LIMIT = 240;

const ADVISORY_REACHABILITY = {
  IMPORTED: "imported",
  DIRECT_ONLY: "direct-only",
  LOCKFILE_ONLY: "lockfile-only",
} as const;

const ADVISORY_CONFIDENCE = {
  IMPORTED: 0.85,
  DIRECT_ONLY: 0.55,
  LOCKFILE_ONLY: 0.35,
} as const;

interface OsvVulnerability {
  id?: string;
  summary?: string;
}

interface OsvBatchResponse {
  results?: Array<{ vulns?: OsvVulnerability[] }>;
}

export interface AdvisoryLookupResult {
  findings: Finding[];
  status: "complete" | "partial" | "skipped" | "failed";
  detail: string;
}

export async function queryOsvAdvisories(
  contents: Map<string, string>,
  graph: ArchitectureGraph,
  options: { fetchImpl?: typeof fetch; commitSha?: string; signal?: AbortSignal } = {},
): Promise<AdvisoryLookupResult> {
  const inventory = listPackageInventory(contents);
  const packages = inventory.components;
  if (packages.length === 0) {
    return {
      findings: [],
      status: "skipped",
      detail: "No lockfile coordinates were available for advisory lookup.",
    };
  }
  const omittedCount = inventory.omittedCount;

  const fetchImpl = options.fetchImpl ?? fetch;
  const knownNodeIds = new Set(graph.nodes.map((node) => node.id));
  const findings: Finding[] = [];

  try {
    for (let offset = 0; offset < packages.length; offset += BATCH_SIZE) {
      const batch = packages.slice(offset, offset + BATCH_SIZE);
      const response = await fetchImpl(OSV_QUERY_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          queries: batch.map((coordinate) => ({
            package: { name: coordinate.name, ecosystem: coordinate.ecosystem },
            version: coordinate.version,
          })),
        }),
        signal: options.signal,
      });
      if (!response.ok) {
        return {
          findings,
          status: "failed",
          detail: `Advisory lookup returned HTTP ${response.status}.`,
        };
      }
      const payload = (await response.json()) as OsvBatchResponse;
      const results = payload.results ?? [];
      for (let index = 0; index < batch.length; index += 1) {
        const coordinate = batch[index];
        const vulnerabilities = results[index]?.vulns ?? [];
        if (!coordinate) {
          continue;
        }
        for (const vulnerability of vulnerabilities) {
          if (!vulnerability.id) {
            continue;
          }
          findings.push(advisoryFinding(coordinate, vulnerability, knownNodeIds, options.commitSha));
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Advisory lookup failed";
    return {
      findings,
      status: "failed",
      detail: message,
    };
  }

  if (omittedCount > 0) {
    return {
      findings,
      status: "partial",
      detail: `Checked ${packages.length} of ${packages.length + omittedCount} package versions. Lookup stopped early so the remaining ${omittedCount} names were not sent to the public advisory service. ${findings.length} published advisories matched.`,
    };
  }
  return {
    findings,
    status: "complete",
    detail: `Checked ${packages.length} package versions. ${findings.length} published advisories matched.`,
  };
}

function advisoryFinding(
  coordinate: PackageCoordinate,
  vulnerability: OsvVulnerability,
  knownNodeIds: Set<string>,
  commitSha?: string,
): Finding {
  const advisoryId = vulnerability.id ?? "unknown";
  const summary = defensiveSummary(vulnerability.summary);
  const moduleId = moduleNodeIdForPath(coordinate.manifestPath);
  const reachability = advisoryReachability(coordinate);
  const stableKey = `advisory-${coordinate.ecosystem}-${coordinate.name}-${coordinate.version}-${advisoryId}`;
  return {
    id: `finding-${stableKey}`,
    stableKey,
    title: `Published advisory ${advisoryId} for ${coordinate.name}@${coordinate.version} (${reachability})`,
    category: FINDING_CATEGORY.SECURITY,
    strideCategories: [STRIDE_CATEGORY.TAMPERING],
    owaspCategories: [OWASP_CATEGORY.VULNERABLE_COMPONENTS, OWASP_CATEGORY.LLM_SUPPLY_CHAIN],
    riskDomains: [RISK_DOMAIN.CYBERSECURITY],
    status: advisoryStatus(reachability),
    affectedNodeIds: knownNodeIds.has(moduleId) ? [moduleId] : [],
    affectedAssetSummary: `${coordinate.name}@${coordinate.version} (${reachability})`,
    commitSha,
    references: [{ path: coordinate.manifestPath, commitSha }],
    evidence: [],
    scenario: `${coordinate.name} ${coordinate.version} in ${coordinate.manifestPath} matches published advisory ${advisoryId}. Reachability: ${reachability}. ${summary}`,
    preconditions: ["The locked version is what production installs"],
    trustBoundaryCrossings: [],
    existingControls: [],
    counterevidence: [],
    confidence: advisoryConfidence(reachability),
    severityRationale: "A published advisory means the pinned version is in a known-affected range.",
    likelihoodRationale: advisoryLikelihood(reachability),
    assumptions: ["Versions come from the lockfile, not from an installed tree."],
    openQuestions: ["Is a fixed version available and compatible?"],
    mitigation: `Upgrade ${coordinate.name} to a version the advisory lists as fixed, then regenerate the lockfile. Advisory: https://osv.dev/vulnerability/${advisoryId}`,
    relatedFindingIds: [],
    attackPathIds: [],
  };
}

function advisoryReachability(coordinate: PackageCoordinate): (typeof ADVISORY_REACHABILITY)[keyof typeof ADVISORY_REACHABILITY] {
  if (coordinate.referencedInSource) {
    return ADVISORY_REACHABILITY.IMPORTED;
  }
  if (coordinate.scope === "direct") {
    return ADVISORY_REACHABILITY.DIRECT_ONLY;
  }
  return ADVISORY_REACHABILITY.LOCKFILE_ONLY;
}

function advisoryStatus(
  reachability: (typeof ADVISORY_REACHABILITY)[keyof typeof ADVISORY_REACHABILITY],
): Finding["status"] {
  if (reachability === ADVISORY_REACHABILITY.IMPORTED) {
    return FINDING_STATUS.CODE_SUPPORTED;
  }
  if (reachability === ADVISORY_REACHABILITY.DIRECT_ONLY) {
    return FINDING_STATUS.PLAUSIBLE_THREAT;
  }
  return FINDING_STATUS.INSUFFICIENT_EVIDENCE;
}

function advisoryConfidence(reachability: (typeof ADVISORY_REACHABILITY)[keyof typeof ADVISORY_REACHABILITY]): number {
  if (reachability === ADVISORY_REACHABILITY.IMPORTED) {
    return ADVISORY_CONFIDENCE.IMPORTED;
  }
  if (reachability === ADVISORY_REACHABILITY.DIRECT_ONLY) {
    return ADVISORY_CONFIDENCE.DIRECT_ONLY;
  }
  return ADVISORY_CONFIDENCE.LOCKFILE_ONLY;
}

function advisoryLikelihood(reachability: (typeof ADVISORY_REACHABILITY)[keyof typeof ADVISORY_REACHABILITY]): string {
  if (reachability === ADVISORY_REACHABILITY.IMPORTED) {
    return "The package name is imported in indexed source. That does not prove the vulnerable function runs.";
  }
  if (reachability === ADVISORY_REACHABILITY.DIRECT_ONLY) {
    return "The package is a direct dependency and was not imported in the indexed source.";
  }
  return "The package appears only in the lockfile. This is not a confirmed incident until an import is shown.";
}

function defensiveSummary(summary: string | undefined): string {
  if (!summary) {
    return "See the advisory id for the vendor description.";
  }
  if (/payload|proof of concept|exploit/i.test(summary)) {
    return "See the advisory id for the vendor description.";
  }
  return summary.slice(0, ADVISORY_SUMMARY_LIMIT);
}

export { PACKAGE_INVENTORY_LIMIT, listPackageCoordinates, sbomToCycloneDx } from "./dependency-inventory.js";
