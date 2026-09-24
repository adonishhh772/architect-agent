import { describe, expect, it } from "vitest";
import { SOURCE_LANGUAGE } from "@sentinel/schema";
import { isReviewedTextPath, sourceLanguageForPath } from "../source-language.js";

describe("sourceLanguageForPath", () => {
  it("treats html, yaml, sql, and shell files as reviewed text", () => {
    expect(sourceLanguageForPath("web/index.html")).toBe(SOURCE_LANGUAGE.HTML);
    expect(sourceLanguageForPath("deploy/app.yaml")).toBe(SOURCE_LANGUAGE.YAML);
    expect(sourceLanguageForPath("db/schema.sql")).toBe(SOURCE_LANGUAGE.SQL);
    expect(sourceLanguageForPath("scripts/start.sh")).toBe(SOURCE_LANGUAGE.SHELL);
    expect(isReviewedTextPath("app.py")).toBe(true);
    expect(isReviewedTextPath("scripts/start.sh")).toBe(true);
    expect(isReviewedTextPath("README.md")).toBe(false);
  });
});
