import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { extractZipSafely, prepareUploadedZipEntries, ZipSafetyError } from "../zip-safety.js";

function archiveWith(files: Record<string, string>): Uint8Array {
  const encoded: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) {
    encoded[path] = new TextEncoder().encode(content);
  }
  return zipSync(encoded);
}

describe("extractZipSafely", () => {
  it("rejects an archive whose only entry escapes the root", () => {
    const archive = archiveWith({
      "../evil.txt": "bad",
    });
    expect(() => extractZipSafely(archive)).toThrow(ZipSafetyError);
  });

  it("keeps in-archive files when another entry escapes the root", () => {
    const archive = archiveWith({
      "../evil.txt": "bad",
      "src/index.ts": "export const x = 1;\n",
    });
    const entries = extractZipSafely(archive);
    expect(entries.map((entry) => entry.path)).toEqual(["src/index.ts"]);
  });

  it("keeps a file name that contains two dots", () => {
    const archive = archiveWith({
      "src/file..name.ts": "export const name = 1;\n",
    });
    const entries = extractZipSafely(archive);
    expect(entries[0]?.path).toBe("src/file..name.ts");
  });

  it("resolves a parent segment that stays inside the archive", () => {
    const archive = archiveWith({
      "src/nested/../index.ts": "export const x = 1;\n",
    });
    const entries = extractZipSafely(archive);
    expect(entries[0]?.path).toBe("src/index.ts");
  });

  it("accepts a Windows absolute path by dropping the drive prefix", () => {
    const archive = archiveWith({
      "C:\\Users\\me\\proj\\src\\app.ts": "export const app = 1;\n",
    });
    const entries = extractZipSafely(archive);
    expect(entries[0]?.path).toBe("Users/me/proj/src/app.ts");
  });

  it("skips macOS metadata and still returns project files", () => {
    const archive = archiveWith({
      "__MACOSX/._index.ts": "junk",
      ".DS_Store": "junk",
      "src/index.ts": "export const x = 1;\n",
    });
    const entries = extractZipSafely(archive);
    expect(entries.map((entry) => entry.path)).toEqual(["src/index.ts"]);
  });
});

describe("prepareUploadedZipEntries", () => {
  it("strips the shared project folder so the audit sees repository paths", () => {
    const archive = archiveWith({
      "my-repo/package.json": "{}\n",
      "my-repo/src/index.ts": "export const x = 1;\n",
    });
    const entries = prepareUploadedZipEntries(archive);
    expect(entries.map((entry) => entry.path).sort()).toEqual(["package.json", "src/index.ts"]);
  });

  it("strips a shared Windows absolute prefix down to the project files", () => {
    const archive = archiveWith({
      "C:\\Users\\me\\proj\\package.json": "{}\n",
      "C:\\Users\\me\\proj\\src\\app.ts": "export const app = 1;\n",
    });
    const entries = prepareUploadedZipEntries(archive);
    expect(entries.map((entry) => entry.path).sort()).toEqual(["package.json", "src/app.ts"]);
  });

  it("rejects an empty archive", () => {
    const archive = zipSync({});
    expect(() => prepareUploadedZipEntries(archive)).toThrow(ZipSafetyError);
  });
});
