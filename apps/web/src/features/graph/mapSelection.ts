import type { ArchitectureGraph, Finding } from "@sentinel/schema";

export function findingsForMapLabel(graph: ArchitectureGraph, findings: Finding[], label: string): Finding[] {
  const node = graph.nodes.find((item) => item.label === label);
  if (!node) {
    return [];
  }
  const paths = new Set<string>();
  for (const reference of node.provenance.references) {
    paths.add(reference.path);
  }
  const filePath = readFileMetadata(node.metadata);
  if (filePath) {
    paths.add(filePath);
  }
  return findings.filter((finding) => findingMatchesNode(finding, node.id, paths, label));
}

function findingMatchesNode(finding: Finding, nodeId: string, paths: Set<string>, label: string): boolean {
  if (finding.duplicateOfStableKey) {
    return false;
  }
  if (finding.affectedNodeIds.includes(nodeId)) {
    return true;
  }
  return finding.references.some((reference) => paths.has(reference.path) || reference.path === label);
}

function readFileMetadata(metadata: Record<string, unknown> | undefined): string | undefined {
  const filePath = metadata?.file;
  return typeof filePath === "string" ? filePath : undefined;
}
