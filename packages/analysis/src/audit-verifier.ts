import { moduleNodeIdForPath } from "@sentinel/graph";
import {
  FINDING_CATEGORY,
  FINDING_STATUS,
  type ArchitectureGraph,
  type AttackPath,
  type Finding,
} from "@sentinel/schema";

const MISSING_PATH_NOTE = "Cited paths are not in the indexed snapshot";
const MISSING_REFERENCE_NOTE = "Security finding has no file reference in the indexed snapshot";

export function verifyAuditFindings(
  findings: Finding[],
  contents: Map<string, string>,
  graph: ArchitectureGraph,
): Finding[] {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  return findings.map((finding) => verifyFinding(finding, contents, nodeIds));
}

export function resolveAttackPaths(paths: AttackPath[], findings: Finding[]): AttackPath[] {
  const idByStableKey = new Map(findings.map((finding) => [finding.stableKey, finding.id]));
  const knownIds = new Set(findings.map((finding) => finding.id));
  const resolved: AttackPath[] = [];
  for (const path of paths) {
    const keys = path.unsupportedLinks.length > 0 ? path.unsupportedLinks : path.stepFindingIds;
    const stepFindingIds: string[] = [];
    const unresolved: string[] = [];
    for (const key of keys) {
      const findingId = idByStableKey.get(key) ?? (knownIds.has(key) ? key : undefined);
      if (findingId) {
        stepFindingIds.push(findingId);
      } else {
        unresolved.push(key);
      }
    }
    if (stepFindingIds.length === 0) {
      continue;
    }
    resolved.push({
      ...path,
      stepFindingIds,
      unsupportedLinks: unresolved,
    });
  }
  return resolved;
}

function verifyFinding(
  finding: Finding,
  contents: Map<string, string>,
  nodeIds: Set<string>,
): Finding {
  const linked = new Set(finding.affectedNodeIds);
  const missingPaths: string[] = [];
  for (const reference of finding.references) {
    const normalized = reference.path.replace(/\\/g, "/").replace(/^\/+/, "");
    const stored = contents.has(normalized) ? normalized : contents.has(reference.path) ? reference.path : undefined;
    if (!stored) {
      missingPaths.push(reference.path);
      continue;
    }
    const moduleId = moduleNodeIdForPath(stored);
    if (nodeIds.has(moduleId)) {
      linked.add(moduleId);
    }
  }

  const counterevidence = [...finding.counterevidence];
  let status = finding.status;
  let confidence = finding.confidence;
  const requiresReference =
    finding.category === FINDING_CATEGORY.SECURITY || finding.category === FINDING_CATEGORY.AI_SECURITY;

  if (finding.references.length > 0 && missingPaths.length === finding.references.length) {
    status = FINDING_STATUS.INSUFFICIENT_EVIDENCE;
    confidence = Math.min(confidence, 0.35);
    counterevidence.push(`${MISSING_PATH_NOTE}: ${missingPaths.join(", ")}`);
  } else if (requiresReference && finding.references.length === 0) {
    status = FINDING_STATUS.INSUFFICIENT_EVIDENCE;
    confidence = Math.min(confidence, 0.4);
    counterevidence.push(MISSING_REFERENCE_NOTE);
  }

  return {
    ...finding,
    affectedNodeIds: [...linked],
    status,
    confidence,
    counterevidence,
  };
}
