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

const OSV_QUERY_URL = "https://api.osv.dev/v1/querybatch";
const BATCH_SIZE = 32;
const MAX_PACKAGES = 80;
const ADVISORY_SUMMARY_LIMIT = 240;

const ECOSYSTEM = {
  NPM: "npm",
  PYPI: "PyPI",
  GO: "Go",
} as const;

type PackageEcosystem = (typeof ECOSYSTEM)[keyof typeof ECOSYSTEM];

interface PackageCoordinate {
  ecosystem: PackageEcosystem;
  name: string;
  version: string;
  manifestPath: string;
}

interface OsvVulnerability {
  id?: string;
  summary?: string;
}

interface OsvBatchResponse {
  results?: Array<{ vulns?: OsvVulnerability[] }>;
}

export interface AdvisoryLookupResult {
  findings: Finding[];
  status: "complete" | "skipped" | "failed";
  detail: string;
}

export async function queryOsvAdvisories(
  contents: Map<string, string>,
  graph: ArchitectureGraph,
  options: { fetchImpl?: typeof fetch; commitSha?: string; signal?: AbortSignal } = {},
): Promise<AdvisoryLookupResult> {
  const packages = collectPackages(contents);
  if (packages.length === 0) {
    return {
      findings: [],
      status: "skipped",
      detail: "No lockfile coordinates were available for advisory lookup.",
    };
  }

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
  const stableKey = `advisory-${coordinate.ecosystem}-${coordinate.name}-${coordinate.version}-${advisoryId}`;
  return {
    id: `finding-${stableKey}`,
    stableKey,
    title: `Published advisory ${advisoryId} for ${coordinate.name}@${coordinate.version}`,
    category: FINDING_CATEGORY.SECURITY,
    strideCategories: [STRIDE_CATEGORY.TAMPERING],
    owaspCategories: [OWASP_CATEGORY.VULNERABLE_COMPONENTS, OWASP_CATEGORY.LLM_SUPPLY_CHAIN],
    riskDomains: [RISK_DOMAIN.CYBERSECURITY],
    status: FINDING_STATUS.CODE_SUPPORTED,
    affectedNodeIds: knownNodeIds.has(moduleId) ? [moduleId] : [],
    affectedAssetSummary: `${coordinate.name}@${coordinate.version}`,
    commitSha,
    references: [{ path: coordinate.manifestPath, commitSha }],
    evidence: [],
    scenario: `${coordinate.name} ${coordinate.version} in ${coordinate.manifestPath} matches published advisory ${advisoryId}. ${summary}`,
    preconditions: ["The locked version is what production installs"],
    trustBoundaryCrossings: [],
    existingControls: [],
    counterevidence: [],
    confidence: 0.95,
    severityRationale: "A published advisory means the pinned version is in a known-affected range.",
    likelihoodRationale: "The lockfile version matched the advisory query. Confirm the package is reachable in production.",
    assumptions: ["Versions come from the lockfile, not from an installed tree."],
    openQuestions: ["Is a fixed version available and compatible?"],
    mitigation: `Upgrade ${coordinate.name} to a version the advisory lists as fixed, then regenerate the lockfile. Advisory: https://osv.dev/vulnerability/${advisoryId}`,
    relatedFindingIds: [],
    attackPathIds: [],
  };
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

function collectPackages(contents: Map<string, string>): PackageCoordinate[] {
  const packages: PackageCoordinate[] = [];
  packages.push(...collectNpmPackages(contents));
  packages.push(...collectPythonPackages(contents));
  packages.push(...collectGoPackages(contents));
  return packages.slice(0, MAX_PACKAGES);
}

function collectNpmPackages(contents: Map<string, string>): PackageCoordinate[] {
  const lockText = contents.get("package-lock.json") ?? contents.get("npm-shrinkwrap.json");
  if (!lockText) {
    return [];
  }
  const directNames = readDirectNpmNames(contents.get("package.json"));
  let parsed: { packages?: Record<string, { version?: string }> };
  try {
    parsed = JSON.parse(lockText) as { packages?: Record<string, { version?: string }> };
  } catch {
    return [];
  }
  const coordinates: PackageCoordinate[] = [];
  for (const [key, value] of Object.entries(parsed.packages ?? {})) {
    if (!key.startsWith("node_modules/") || key.slice("node_modules/".length).includes("node_modules/")) {
      continue;
    }
    const name = key.slice("node_modules/".length);
    const version = value.version;
    if (!version || (directNames.size > 0 && !directNames.has(name))) {
      continue;
    }
    coordinates.push({
      ecosystem: ECOSYSTEM.NPM,
      name,
      version,
      manifestPath: "package-lock.json",
    });
  }
  return coordinates;
}

function readDirectNpmNames(packageJson: string | undefined): Set<string> {
  if (!packageJson) {
    return new Set();
  }
  try {
    const parsed = JSON.parse(packageJson) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return new Set([
      ...Object.keys(parsed.dependencies ?? {}),
      ...Object.keys(parsed.devDependencies ?? {}),
    ]);
  } catch {
    return new Set();
  }
}

function collectPythonPackages(contents: Map<string, string>): PackageCoordinate[] {
  const coordinates: PackageCoordinate[] = [];
  for (const [path, content] of contents) {
    if (!path.endsWith("requirements.txt")) {
      continue;
    }
    for (const line of content.split("\n")) {
      const match = /^([A-Za-z0-9_.-]+)==([0-9][A-Za-z0-9.*+]*)\s*$/.exec(line.trim());
      if (!match?.[1] || !match[2]) {
        continue;
      }
      coordinates.push({
        ecosystem: ECOSYSTEM.PYPI,
        name: match[1],
        version: match[2],
        manifestPath: path,
      });
    }
  }
  return coordinates;
}

function collectGoPackages(contents: Map<string, string>): PackageCoordinate[] {
  const sum = contents.get("go.sum");
  if (!sum) {
    return [];
  }
  const coordinates: PackageCoordinate[] = [];
  const seen = new Set<string>();
  for (const line of sum.split("\n")) {
    const match = /^(\S+)\s+v([0-9][^\s/]*)/.exec(line.trim());
    if (!match?.[1] || !match[2]) {
      continue;
    }
    const key = `${match[1]}@${match[2]}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    coordinates.push({
      ecosystem: ECOSYSTEM.GO,
      name: match[1],
      version: match[2],
      manifestPath: "go.sum",
    });
  }
  return coordinates.slice(0, 40);
}
