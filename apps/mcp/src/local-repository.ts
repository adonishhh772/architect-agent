import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { RawRepositoryFile } from "@sentinel/ingestion";

const MAX_FILES = 1000;
const MAX_FILE_BYTES = 1_000_000;
const SKIP_DIRECTORIES = new Set([".git", "node_modules", "vendor", "dist", "coverage", ".next", "analysis-artifacts"]);

export async function readLocalRepositoryFiles(root: string): Promise<RawRepositoryFile[]> {
  const absoluteRoot = path.resolve(root);
  const files: RawRepositoryFile[] = [];
  await walkDirectory(absoluteRoot, absoluteRoot, files);
  return files;
}

async function walkDirectory(root: string, current: string, files: RawRepositoryFile[]): Promise<void> {
  if (files.length >= MAX_FILES) {
    return;
  }
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (files.length >= MAX_FILES) {
      return;
    }
    if (SKIP_DIRECTORIES.has(entry.name)) {
      continue;
    }
    const absolutePath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await walkDirectory(root, absolutePath, files);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const info = await stat(absolutePath);
    if (info.size > MAX_FILE_BYTES) {
      continue;
    }
    const content = await readFile(absolutePath, "utf8").catch(() => undefined);
    if (content === undefined) {
      continue;
    }
    files.push({
      path: path.relative(root, absolutePath).replace(/\\/g, "/"),
      content,
    });
  }
}
