import { SOURCE_LANGUAGE } from "@sentinel/schema";

const JAVASCRIPT_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const PYTHON_FILE = /\.py$/;
const GO_FILE = /\.go$/;
const HTML_FILE = /\.html?$/;
const YAML_FILE = /\.ya?ml$/;
const SQL_FILE = /\.sql$/;
const SHELL_FILE = /\.(sh|bash)$/;

export type SourceLanguage = (typeof SOURCE_LANGUAGE)[keyof typeof SOURCE_LANGUAGE];

export function sourceLanguageForPath(filePath: string): SourceLanguage | undefined {
  if (JAVASCRIPT_FILE.test(filePath)) {
    return SOURCE_LANGUAGE.JAVASCRIPT;
  }
  if (PYTHON_FILE.test(filePath)) {
    return SOURCE_LANGUAGE.PYTHON;
  }
  if (GO_FILE.test(filePath)) {
    return SOURCE_LANGUAGE.GO;
  }
  if (HTML_FILE.test(filePath)) {
    return SOURCE_LANGUAGE.HTML;
  }
  if (YAML_FILE.test(filePath)) {
    return SOURCE_LANGUAGE.YAML;
  }
  if (SQL_FILE.test(filePath)) {
    return SOURCE_LANGUAGE.SQL;
  }
  if (SHELL_FILE.test(filePath)) {
    return SOURCE_LANGUAGE.SHELL;
  }
  return undefined;
}

export function isPythonPath(filePath: string): boolean {
  return PYTHON_FILE.test(filePath);
}

export function isGoPath(filePath: string): boolean {
  return GO_FILE.test(filePath);
}

export function isJavaScriptPath(filePath: string): boolean {
  return JAVASCRIPT_FILE.test(filePath);
}

export function isReviewedTextPath(filePath: string): boolean {
  return isJavaScriptPath(filePath) || isPythonPath(filePath) || isGoPath(filePath) || sourceLanguageForPath(filePath) !== undefined;
}
