import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { extractZipSafely, ZipSafetyError } from "../zip-safety.js";

describe("extractZipSafely", () => {
  it("rejects path traversal entries", () => {
    const archive = zipSync({
      "../evil.txt": new TextEncoder().encode("bad"),
    });
    expect(() => extractZipSafely(archive)).toThrow(ZipSafetyError);
  });

  it("extracts safe text files", () => {
    const archive = zipSync({
      "src/index.ts": new TextEncoder().encode("export const x = 1;\n"),
    });
    const entries = extractZipSafely(archive);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.path).toBe("src/index.ts");
  });
});
