const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".tar",
  ".7z",
  ".wasm",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".mp3",
  ".mp4",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
]);

const GENERATED_PATTERNS = [
  /^dist\//,
  /^build\//,
  /^\.next\//,
  /^coverage\//,
  /^node_modules\//,
  /^vendor\//,
  /\.min\.js$/,
  /\.bundle\./,
  /-lock\.json$/,
];

const ALWAYS_INCLUDE_MANIFESTS = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "go.mod",
  "go.sum",
  "Cargo.toml",
  "requirements.txt",
  "pyproject.toml",
  "docker-compose.yml",
  "docker-compose.yaml",
  "Dockerfile",
]);

export interface ExclusionResult {
  excluded: boolean;
  reason?: string;
}

export function shouldExcludePath(normalizedPath: string): ExclusionResult {
  const baseName = normalizedPath.split("/").pop() ?? normalizedPath;
  if (ALWAYS_INCLUDE_MANIFESTS.has(baseName)) {
    return { excluded: false };
  }

  const lower = normalizedPath.toLowerCase();
  for (const ext of BINARY_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      return { excluded: true, reason: "binary_file" };
    }
  }

  for (const pattern of GENERATED_PATTERNS) {
    if (pattern.test(normalizedPath)) {
      if (baseName === "package-lock.json" || baseName.endsWith("-lock.json")) {
        continue;
      }
      return { excluded: true, reason: "generated_or_vendored" };
    }
  }

  if (normalizedPath.includes("node_modules/")) {
    return { excluded: true, reason: "vendored_dependency" };
  }

  return { excluded: false };
}

export function detectLanguage(path: string): string | undefined {
  const ext = path.includes(".") ? path.slice(path.lastIndexOf(".")).toLowerCase() : "";
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".json": "json",
    ".md": "markdown",
    ".dockerfile": "docker",
  };
  if (path.toLowerCase().endsWith("dockerfile")) {
    return "docker";
  }
  return map[ext];
}

export function countLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  let count = 1;
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) === 10) {
      count += 1;
    }
  }
  return count;
}
