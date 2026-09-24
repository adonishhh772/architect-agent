import { describe, expect, it } from "vitest";
import { splitSummarySentences } from "./strideSummary";

describe("splitSummarySentences", () => {
  it("splits a single paragraph into sentences", () => {
    const sentences = splitSummarySentences(
      "Mapped 283 architecture components. Agents read 32 indexed files. A weakness stays unread until the reader continues.",
    );
    expect(sentences).toEqual([
      "Mapped 283 architecture components.",
      "Agents read 32 indexed files.",
      "A weakness stays unread until the reader continues.",
    ]);
  });

  it("returns no sentences for blank text", () => {
    expect(splitSummarySentences("   ")).toEqual([]);
  });
});
