import { describe, expect, it } from "vitest";
import { buildRepositoryFileTree, countIndexedFilesInTree } from "../buildRepositoryFileTree";

describe("buildRepositoryFileTree", () => {
  it("builds nested folders and counts indexed files", () => {
    const tree = buildRepositoryFileTree([
      {
        path: "src/app.ts",
        size: 10,
        lineCount: 1,
        language: "typescript",
        excluded: false,
      },
      {
        path: "src/lib/util.ts",
        size: 10,
        lineCount: 1,
        language: "typescript",
        excluded: false,
      },
      {
        path: "dist/bundle.js",
        size: 10,
        lineCount: 1,
        language: "javascript",
        excluded: true,
        exclusionReason: "generated_or_vendored",
      },
    ]);

    expect(tree.children.map((node) => node.name)).toEqual(["dist", "src"]);
    const counts = countIndexedFilesInTree(tree);
    expect(counts.total).toBe(3);
    expect(counts.indexed).toBe(2);
    expect(counts.excluded).toBe(1);
  });
});
