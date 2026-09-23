import { SOURCE_LANGUAGE } from "@sentinel/schema";

const JAVASCRIPT_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const PYTHON_FILE = /\.py$/;
const GO_FILE = /\.go$/;

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
