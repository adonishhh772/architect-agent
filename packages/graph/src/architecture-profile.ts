import {
  GRAPH_NODE_KIND,
  type ArchitectureGraph,
  type ArchitectureProfile,
} from "@sentinel/schema";
import { SOURCE_LANGUAGE } from "@sentinel/schema";
import { sourceLanguageForPath } from "./source-language.js";

const PURPOSE_LIMIT = 4000;
const HIGHLIGHT_LIMIT = 12;
const PURPOSE_FALLBACK =
  "No manifest description or readme summary was found. The map below is inferred from source files, HTTP entry points, data stores, and outbound calls.";

export function buildArchitectureProfile(
  files: Map<string, string>,
  graph: ArchitectureGraph,
): ArchitectureProfile {
  const languages = languagesPresent(files);
  const apiEntries = labelsFor(graph, GRAPH_NODE_KIND.API_ENTRY);
  const dataStores = labelsFor(graph, GRAPH_NODE_KIND.DATA_STORE);
  const externalSystems = labelsFor(graph, GRAPH_NODE_KIND.EXTERNAL_SYSTEM);
  const highlights = [
    languages.length > 0 ? `Languages in the snapshot: ${languages.join(", ")}.` : "",
    ...apiEntries.slice(0, 4).map((label) => `HTTP entry: ${label}`),
    ...dataStores.slice(0, 3).map((label) => `Data store: ${label}`),
    ...externalSystems.slice(0, 3).map((label) => `External system: ${label}`),
  ].filter((item) => item.length > 0).slice(0, HIGHLIGHT_LIMIT);

  return {
    purpose: readPurpose(files),
    languages,
    moduleCount: countKind(graph, GRAPH_NODE_KIND.MODULE),
    apiEntryCount: apiEntries.length,
    dataStoreCount: dataStores.length,
    externalSystemCount: externalSystems.length,
    trustBoundaryCount: countKind(graph, GRAPH_NODE_KIND.TRUST_BOUNDARY),
    highlights,
  };
}

function languagesPresent(files: Map<string, string>): ArchitectureProfile["languages"] {
  const found = new Set<ArchitectureProfile["languages"][number]>();
  for (const path of files.keys()) {
    const language = sourceLanguageForPath(path);
    if (language) {
      found.add(language);
    }
  }
  return [SOURCE_LANGUAGE.JAVASCRIPT, SOURCE_LANGUAGE.PYTHON, SOURCE_LANGUAGE.GO].filter((language) =>
    found.has(language),
  );
}

function labelsFor(graph: ArchitectureGraph, kind: string): string[] {
  const labels: string[] = [];
  for (const node of graph.nodes) {
    if (node.kind === kind && !labels.includes(node.label)) {
      labels.push(node.label);
    }
  }
  return labels;
}

function countKind(graph: ArchitectureGraph, kind: string): number {
  let count = 0;
  for (const node of graph.nodes) {
    if (node.kind === kind) {
      count += 1;
    }
  }
  return count;
}

function readPurpose(files: Map<string, string>): string {
  const pieces: string[] = [];
  const packageDescription = readPackageDescription(files.get("package.json"));
  const pythonDescription = readPythonDescription(files);
  const goModule = readGoModule(files.get("go.mod"));
  if (packageDescription) {
    pieces.push(packageDescription);
  }
  if (pythonDescription) {
    pieces.push(pythonDescription);
  }
  if (goModule) {
    pieces.push(`Go module ${goModule}.`);
  }
  if (pieces.length === 0) {
    const readme = firstParagraph(findReadme(files));
    if (readme) {
      pieces.push(readme);
    }
  }
  if (pieces.length === 0) {
    return PURPOSE_FALLBACK;
  }
  return pieces.join(" ").slice(0, PURPOSE_LIMIT);
}

function readPackageDescription(content: string | undefined): string | undefined {
  if (!content) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(content) as { description?: unknown };
    return typeof parsed.description === "string" && parsed.description.trim()
      ? parsed.description.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

function readPythonDescription(files: Map<string, string>): string | undefined {
  const pyproject = files.get("pyproject.toml");
  if (pyproject) {
    const match = /description\s*=\s*"([^"]+)"/.exec(pyproject);
    if (match?.[1]) {
      return match[1];
    }
  }
  return undefined;
}

function readGoModule(content: string | undefined): string | undefined {
  if (!content) {
    return undefined;
  }
  const match = /^module\s+(\S+)/m.exec(content);
  return match?.[1];
}

function findReadme(files: Map<string, string>): string | undefined {
  for (const [path, content] of files) {
    if (/(^|\/)README\.md$/i.test(path)) {
      return content;
    }
  }
  return undefined;
}

function firstParagraph(content: string | undefined): string | undefined {
  if (!content) {
    return undefined;
  }
  const lines: string[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("```")) {
      if (lines.length > 0) {
        break;
      }
      continue;
    }
    lines.push(trimmed);
  }
  const paragraph = lines.join(" ").trim();
  return paragraph.length > 0 ? paragraph : undefined;
}
