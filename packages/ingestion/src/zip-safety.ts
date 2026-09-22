import { unzipSync } from "fflate";

export const ZIP_LIMITS = {
  maxCompressedBytes: 50 * 1024 * 1024,
  maxUncompressedBytes: 200 * 1024 * 1024,
  maxFileCount: 20_000,
  maxSingleFileBytes: 5 * 1024 * 1024,
} as const;

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
  const normalized = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (
    normalized.includes("..") ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

export function extractZipSafely(compressed: Uint8Array): SafeZipEntry[] {
  if (compressed.byteLength > ZIP_LIMITS.maxCompressedBytes) {
    throw new ZipSafetyError("compressed_too_large", "ZIP archive exceeds size limit");
  }

  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(compressed);
  } catch {
    throw new ZipSafetyError("invalid_archive", "Unable to decompress ZIP archive");
  }

  const paths = Object.keys(archive);
  if (paths.length > ZIP_LIMITS.maxFileCount) {
    throw new ZipSafetyError("too_many_files", "ZIP contains too many files");
  }

  let totalUncompressed = 0;
  const entries: SafeZipEntry[] = [];

  for (const rawPath of paths) {
    if (rawPath.endsWith("/")) {
      continue;
    }
    const path = normalizeZipPath(rawPath);
    if (!path) {
      throw new ZipSafetyError("path_traversal", "ZIP entry path is not allowed");
    }

    const data = archive[rawPath];
    totalUncompressed += data.byteLength;
    if (totalUncompressed > ZIP_LIMITS.maxUncompressedBytes) {
      throw new ZipSafetyError(
        "uncompressed_too_large",
        "ZIP decompression exceeds total size limit",
      );
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

  return entries;
}
