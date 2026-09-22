import type { IndexedFile } from "@sentinel/schema";

export interface RepositoryFileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  excluded: boolean;
  language?: string;
  children: RepositoryFileTreeNode[];
}

export function buildRepositoryFileTree(files: Iterable<IndexedFile>): RepositoryFileTreeNode {
  const root: RepositoryFileTreeNode = {
    name: "",
    path: "",
    isDirectory: true,
    excluded: false,
    children: [],
  };

  for (const file of files) {
    const segments = file.path.split("/").filter(Boolean);
    let current = root;
    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
      const segment = segments[segmentIndex] ?? "";
      const isLeaf = segmentIndex === segments.length - 1;
      const nodePath = segments.slice(0, segmentIndex + 1).join("/");
      let child = current.children.find((entry) => entry.name === segment);
      if (!child) {
        child = {
          name: segment,
          path: nodePath,
          isDirectory: !isLeaf,
          excluded: isLeaf ? file.excluded : false,
          language: isLeaf ? file.language : undefined,
          children: [],
        };
        current.children.push(child);
      }
      if (isLeaf) {
        child.excluded = file.excluded;
        child.language = file.language;
        child.isDirectory = false;
      }
      current = child;
    }
  }

  sortFileTreeNodes(root);
  return root;
}

function sortFileTreeNodes(node: RepositoryFileTreeNode): void {
  node.children.sort((left, right) => {
    if (left.isDirectory !== right.isDirectory) {
      return left.isDirectory ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
  for (const child of node.children) {
    sortFileTreeNodes(child);
  }
}

export function countIndexedFilesInTree(node: RepositoryFileTreeNode): {
  total: number;
  indexed: number;
  excluded: number;
} {
  if (!node.isDirectory) {
    return {
      total: 1,
      indexed: node.excluded ? 0 : 1,
      excluded: node.excluded ? 1 : 0,
    };
  }
  let total = 0;
  let indexed = 0;
  let excluded = 0;
  for (const child of node.children) {
    const counts = countIndexedFilesInTree(child);
    total += counts.total;
    indexed += counts.indexed;
    excluded += counts.excluded;
  }
  return { total, indexed, excluded };
}
