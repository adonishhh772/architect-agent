import { unzipSync } from "fflate";

export const ZIP_LIMITS = {
  maxCompressedBytes: 50 * 1024 * 1024,
  maxUncompressedBytes: 200 * 1024 * 1024,
  maxFileCount: 20_000,
  maxSingleFileBytes: 5 * 1024 * 1024,
} as const;

const ZIP_MESSAGE = {
  COMPRESSED_TOO_LARGE: "ZIP archive exceeds size limit",
  INVALID_ARCHIVE: "Unable to decompress ZIP archive",
  TOO_MANY_FILES: "ZIP contains too many files",
  PATH_NOT_ALLOWED: "ZIP entry path is not allowed",
  UNCOMPRESSED_TOO_LARGE: "ZIP decompression exceeds total size limit",
  EMPTY_ARCHIVE: "ZIP archive has no readable text files",
} as const;

const ZIP_SKIPPED_ROOT = "__MACOSX";
const ZIP_SKIPPED_FILE_NAME = ".DS_Store";
const WINDOWS_DRIVE_PREFIX = /^[a-zA-Z]:/;

export interface SafeZipEntry {
  path: string;
  content: string;
}

export class ZipSafetyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ZipSafetyError";
    this.code = code;
  }
}

function normalizeZipPath(rawPath: string): string | null {
  const slashed = rawPath.replace(/\\/g, "/").replace(WINDOWS_DRIVE_PREFIX, "");
  const segments = slashed.split("/");
  const safeSegments: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (safeSegments.length === 0) {
        return null;
      }
      safeSegments.pop();
      continue;
    }
    if (segment.includes("\0")) {
      return null;
    }
    safeSegments.push(segment);
  }
  if (safeSegments.length === 0) {
    return null;
  }
  return safeSegments.join("/");
}

function isIgnorableZipPath(entryPath: string): boolean {
  const segments = entryPath.split("/");
  const fileName = segments[segments.length - 1];
  return segments[0] === ZIP_SKIPPED_ROOT || fileName === ZIP_SKIPPED_FILE_NAME;
}

export function stripCommonZipRoot(entries: readonly SafeZipEntry[]): SafeZipEntry[] {
  if (entries.length === 0) {
    return [];
  }
  const splitPaths = entries.map((entry) => entry.path.split("/"));
  const shortestDepth = splitPaths.reduce((shortest, parts) => Math.min(shortest, parts.length), splitPaths[0]?.length ?? 0);
  let sharedDepth = 0;
  while (sharedDepth < shortestDepth - 1) {
    const segment = splitPaths[0]?.[sharedDepth];
    if (!segment || splitPaths.some((parts) => parts[sharedDepth] !== segment)) {
      break;
    }
    sharedDepth += 1;
  }
  if (sharedDepth === 0) {
    return entries.map((entry) => ({ path: entry.path, content: entry.content }));
  }
  return entries.map((entry) => ({
    path: entry.path.split("/").slice(sharedDepth).join("/"),
    content: entry.content,
  }));
}

export function extractZipSafely(compressed: Uint8Array): SafeZipEntry[] {
  if (compressed.byteLength > ZIP_LIMITS.maxCompressedBytes) {
    throw new ZipSafetyError("compressed_too_large", ZIP_MESSAGE.COMPRESSED_TOO_LARGE);
  }

  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(compressed);
  } catch {
    throw new ZipSafetyError("invalid_archive", ZIP_MESSAGE.INVALID_ARCHIVE);
  }

  const paths = Object.keys(archive);
  if (paths.length > ZIP_LIMITS.maxFileCount) {
    throw new ZipSafetyError("too_many_files", ZIP_MESSAGE.TOO_MANY_FILES);
  }

  let totalUncompressed = 0;
  let rejectedPathCount = 0;
  const entries: SafeZipEntry[] = [];

  for (const rawPath of paths) {
    if (rawPath.endsWith("/")) {
      continue;
    }
    const path = normalizeZipPath(rawPath);
    if (!path) {
      rejectedPathCount += 1;
      continue;
    }
    if (isIgnorableZipPath(path)) {
      continue;
    }

    const data = archive[rawPath];
    totalUncompressed += data.byteLength;
    if (totalUncompressed > ZIP_LIMITS.maxUncompressedBytes) {
      throw new ZipSafetyError("uncompressed_too_large", ZIP_MESSAGE.UNCOMPRESSED_TOO_LARGE);
    }
    if (data.byteLength > ZIP_LIMITS.maxSingleFileBytes) {
      continue;
    }

    const decoder = new TextDecoder("utf-8", { fatal: false });
    const content = decoder.decode(data);
    if (content.includes("\u0000")) {
      continue;
    }
    entries.push({ path, content });
  }

  if (entries.length === 0 && rejectedPathCount > 0) {
    throw new ZipSafetyError("path_traversal", ZIP_MESSAGE.PATH_NOT_ALLOWED);
  }

  return entries;
}

export function prepareUploadedZipEntries(compressed: Uint8Array): SafeZipEntry[] {
  const entries = stripCommonZipRoot(extractZipSafely(compressed));
  if (entries.length === 0) {
    throw new ZipSafetyError("empty_archive", ZIP_MESSAGE.EMPTY_ARCHIVE);
  }
  return entries;
}
