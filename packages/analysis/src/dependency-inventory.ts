const PACKAGE_ECOSYSTEM = {
  NPM: "npm",
  PYPI: "PyPI",
  GO: "Go",
  CARGO: "crates.io",
  MAVEN: "Maven",
  NUGET: "NuGet",
} as const;

const PACKAGE_SCOPE = {
  DIRECT: "direct",
  TRANSITIVE: "transitive",
} as const;

export const PACKAGE_INVENTORY_LIMIT = 5000;

export interface PackageCoordinate {
  ecosystem: (typeof PACKAGE_ECOSYSTEM)[keyof typeof PACKAGE_ECOSYSTEM];
  name: string;
  version: string;
  manifestPath: string;
  scope: (typeof PACKAGE_SCOPE)[keyof typeof PACKAGE_SCOPE];
  purl: string;
  referencedInSource: boolean;
}

export interface PackageInventory {
  components: PackageCoordinate[];
  omittedCount: number;
}

export function listPackageCoordinates(contents: Map<string, string>): PackageCoordinate[] {
  return listPackageInventory(contents).components;
}

export function listPackageInventory(contents: Map<string, string>): PackageInventory {
  const referenced = collectReferencedNames(contents);
  const directNames = collectDirectNames(contents);
  const collected = [
    ...collectNpmPackages(contents, directNames),
    ...collectPnpmPackages(contents, directNames),
    ...collectYarnPackages(contents, directNames),
    ...collectPythonPackages(contents, directNames),
    ...collectPoetryPackages(contents, directNames),
    ...collectPipfilePackages(contents, directNames),
    ...collectGoPackages(contents, directNames),
    ...collectCargoPackages(contents, directNames),
    ...collectMavenPackages(contents),
    ...collectNugetPackages(contents, directNames),
  ];
  const ranked = dedupeCoordinates(collected, referenced).sort(comparePackagePriority);
  return {
    components: ranked.slice(0, PACKAGE_INVENTORY_LIMIT),
    omittedCount: Math.max(0, ranked.length - PACKAGE_INVENTORY_LIMIT),
  };
}

function comparePackagePriority(left: PackageCoordinate, right: PackageCoordinate): number {
  const priorityDelta = packagePriority(left) - packagePriority(right);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }
  return left.name.localeCompare(right.name);
}

function packagePriority(coordinate: PackageCoordinate): number {
  if (coordinate.referencedInSource && coordinate.scope === "direct") {
    return 0;
  }
  if (coordinate.referencedInSource) {
    return 1;
  }
  if (coordinate.scope === "direct") {
    return 2;
  }
  return 3;
}

export function sbomToCycloneDx(
  components: Array<{
    ecosystem: string;
    name: string;
    version: string;
    manifestPath: string;
    scope?: string;
    purl?: string;
    referencedInSource?: boolean;
  }>,
  serialNumber: string,
): string {
  return JSON.stringify(
    {
      bomFormat: "CycloneDX",
      specVersion: "1.5",
      version: 1,
      serialNumber,
      components: components.map((component) => ({
        type: "library",
        name: component.name,
        version: component.version,
        purl: component.purl ?? "",
        scope: component.scope === "direct" ? "required" : "optional",
        properties: [
          { name: "sentinel:ecosystem", value: component.ecosystem },
          { name: "sentinel:manifest", value: component.manifestPath },
          { name: "sentinel:referencedInSource", value: String(component.referencedInSource === true) },
        ],
      })),
    },
    null,
    2,
  );
}

function dedupeCoordinates(collected: PackageCoordinate[], referenced: Set<string>): PackageCoordinate[] {
  const seen = new Set<string>();
  const coordinates: PackageCoordinate[] = [];
  for (const coordinate of collected) {
    const key = `${coordinate.ecosystem}:${coordinate.name}@${coordinate.version}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    coordinates.push({
      ...coordinate,
      referencedInSource: referenced.has(coordinate.name),
    });
  }
  return coordinates;
}

function collectNpmPackages(contents: Map<string, string>, directNames: Set<string>): PackageCoordinate[] {
  const lockText = contents.get("package-lock.json") ?? contents.get("npm-shrinkwrap.json");
  if (!lockText) {
    return [];
  }
  const manifestPath = contents.has("package-lock.json") ? "package-lock.json" : "npm-shrinkwrap.json";
  let parsed: {
    packages?: Record<string, { version?: string }>;
    dependencies?: Record<string, { version?: string; dependencies?: Record<string, { version?: string }> }>;
  };
  try {
    parsed = JSON.parse(lockText) as typeof parsed;
  } catch {
    return [];
  }
  const coordinates: PackageCoordinate[] = [];
  for (const [key, value] of Object.entries(parsed.packages ?? {})) {
    if (!key.includes("node_modules/") || !value.version) {
      continue;
    }
    const name = npmNameFromPath(key);
    if (!name) {
      continue;
    }
    coordinates.push(coordinate(PACKAGE_ECOSYSTEM.NPM, name, value.version, manifestPath, directNames));
  }
  collectNpmDependencyTree(parsed.dependencies ?? {}, manifestPath, directNames, coordinates);
  return coordinates;
}

function collectNpmDependencyTree(
  dependencies: Record<string, { version?: string; dependencies?: Record<string, { version?: string }> }>,
  manifestPath: string,
  directNames: Set<string>,
  coordinates: PackageCoordinate[],
): void {
  for (const [name, value] of Object.entries(dependencies)) {
    if (value.version) {
      coordinates.push(coordinate(PACKAGE_ECOSYSTEM.NPM, name, value.version, manifestPath, directNames));
    }
    if (value.dependencies) {
      collectNpmDependencyTree(value.dependencies, manifestPath, directNames, coordinates);
    }
  }
}

function npmNameFromPath(key: string): string | undefined {
  const marker = "node_modules/";
  const index = key.lastIndexOf(marker);
  if (index < 0) {
    return undefined;
  }
  const name = key.slice(index + marker.length);
  return name.length > 0 ? name : undefined;
}

function collectPnpmPackages(contents: Map<string, string>, directNames: Set<string>): PackageCoordinate[] {
  const text = contents.get("pnpm-lock.yaml");
  if (!text) {
    return [];
  }
  return versionsFromAtLines(text, "pnpm-lock.yaml", PACKAGE_ECOSYSTEM.NPM, directNames);
}

function collectYarnPackages(contents: Map<string, string>, directNames: Set<string>): PackageCoordinate[] {
  const text = contents.get("yarn.lock");
  if (!text) {
    return [];
  }
  const coordinates: PackageCoordinate[] = [];
  let pendingName = "";
  for (const line of text.split("\n")) {
    const header = /^"?(@?[^@"\s]+)@/.exec(line.trim());
    if (header?.[1] && line.trim().endsWith(":")) {
      pendingName = header[1];
      continue;
    }
    const version = /version:?\s*"?([0-9][^"\s]*)"?/.exec(line);
    if (pendingName && version?.[1]) {
      coordinates.push(coordinate(PACKAGE_ECOSYSTEM.NPM, pendingName, version[1], "yarn.lock", directNames));
      pendingName = "";
    }
  }
  return coordinates;
}

function collectPythonPackages(contents: Map<string, string>, directNames: Set<string>): PackageCoordinate[] {
  const coordinates: PackageCoordinate[] = [];
  for (const [path, content] of contents) {
    if (!path.endsWith("requirements.txt")) {
      continue;
    }
    for (const line of content.split("\n")) {
      const match = /^([A-Za-z0-9_.-]+)==([0-9][A-Za-z0-9.*+]*)\s*(?:#.*)?$/.exec(line.trim());
      if (!match?.[1] || !match[2]) {
        continue;
      }
      coordinates.push(coordinate(PACKAGE_ECOSYSTEM.PYPI, match[1], match[2], path, directNames));
    }
  }
  return coordinates;
}

function collectPoetryPackages(contents: Map<string, string>, directNames: Set<string>): PackageCoordinate[] {
  const text = contents.get("poetry.lock");
  if (!text) {
    return [];
  }
  return tomlPackageTables(text, "poetry.lock", PACKAGE_ECOSYSTEM.PYPI, directNames);
}

function collectPipfilePackages(contents: Map<string, string>, directNames: Set<string>): PackageCoordinate[] {
  const text = contents.get("Pipfile.lock");
  if (!text) {
    return [];
  }
  let parsed: { default?: Record<string, { version?: string }>; develop?: Record<string, { version?: string }> };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    return [];
  }
  const coordinates: PackageCoordinate[] = [];
  for (const section of [parsed.default ?? {}, parsed.develop ?? {}]) {
    for (const [name, value] of Object.entries(section)) {
      const version = value.version?.replace(/^=+/, "");
      if (!version) {
        continue;
      }
      coordinates.push(coordinate(PACKAGE_ECOSYSTEM.PYPI, name, version, "Pipfile.lock", directNames));
    }
  }
  return coordinates;
}

function collectGoPackages(contents: Map<string, string>, directNames: Set<string>): PackageCoordinate[] {
  const sum = contents.get("go.sum");
  if (!sum) {
    return [];
  }
  const coordinates: PackageCoordinate[] = [];
  for (const line of sum.split("\n")) {
    const match = /^(\S+)\s+v([0-9][^\s/]*)/.exec(line.trim());
    if (!match?.[1] || !match[2]) {
      continue;
    }
    coordinates.push(coordinate(PACKAGE_ECOSYSTEM.GO, match[1], `v${match[2]}`, "go.sum", directNames));
  }
  return coordinates;
}

function collectCargoPackages(contents: Map<string, string>, directNames: Set<string>): PackageCoordinate[] {
  const text = contents.get("Cargo.lock");
  if (!text) {
    return [];
  }
  return tomlPackageTables(text, "Cargo.lock", PACKAGE_ECOSYSTEM.CARGO, directNames);
}

function collectMavenPackages(contents: Map<string, string>): PackageCoordinate[] {
  const coordinates: PackageCoordinate[] = [];
  for (const [path, content] of contents) {
    if (!path.endsWith("pom.xml")) {
      continue;
    }
    const pattern = /<dependency>([\s\S]*?)<\/dependency>/g;
    let match = pattern.exec(content);
    while (match) {
      const block = match[1] ?? "";
      const groupId = tagValue(block, "groupId");
      const artifactId = tagValue(block, "artifactId");
      const version = tagValue(block, "version");
      if (groupId && artifactId && version && !version.startsWith("${")) {
        const name = `${groupId}:${artifactId}`;
        coordinates.push({
          ecosystem: PACKAGE_ECOSYSTEM.MAVEN,
          name,
          version,
          manifestPath: path,
          scope: PACKAGE_SCOPE.DIRECT,
          purl: `pkg:maven/${groupId}/${artifactId}@${version}`,
          referencedInSource: false,
        });
      }
      match = pattern.exec(content);
    }
  }
  return coordinates;
}

function collectNugetPackages(contents: Map<string, string>, directNames: Set<string>): PackageCoordinate[] {
  const text = contents.get("packages.lock.json");
  if (!text) {
    return [];
  }
  let parsed: { dependencies?: Record<string, Record<string, { resolved?: string }>> };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    return [];
  }
  const coordinates: PackageCoordinate[] = [];
  for (const frameworks of Object.values(parsed.dependencies ?? {})) {
    for (const [name, value] of Object.entries(frameworks)) {
      if (!value.resolved) {
        continue;
      }
      coordinates.push(coordinate(PACKAGE_ECOSYSTEM.NUGET, name, value.resolved, "packages.lock.json", directNames));
    }
  }
  return coordinates;
}

function versionsFromAtLines(
  text: string,
  manifestPath: string,
  ecosystem: PackageCoordinate["ecosystem"],
  directNames: Set<string>,
): PackageCoordinate[] {
  const coordinates: PackageCoordinate[] = [];
  const pattern = /^\s*\/?((?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+)@([0-9][^:\s'"]*)/gm;
  let match = pattern.exec(text);
  while (match) {
    if (match[1] && match[2]) {
      coordinates.push(coordinate(ecosystem, match[1], match[2], manifestPath, directNames));
    }
    match = pattern.exec(text);
  }
  return coordinates;
}

function tomlPackageTables(
  text: string,
  manifestPath: string,
  ecosystem: PackageCoordinate["ecosystem"],
  directNames: Set<string>,
): PackageCoordinate[] {
  const coordinates: PackageCoordinate[] = [];
  const blocks = text.split("[[package]]");
  for (const block of blocks.slice(1)) {
    const name = /name\s*=\s*"([^"]+)"/.exec(block)?.[1];
    const version = /version\s*=\s*"([^"]+)"/.exec(block)?.[1];
    if (!name || !version) {
      continue;
    }
    coordinates.push(coordinate(ecosystem, name, version, manifestPath, directNames));
  }
  return coordinates;
}

function collectDirectNames(contents: Map<string, string>): Set<string> {
  const names = new Set<string>();
  addJsonDependencyNames(contents.get("package.json"), names);
  addGoModNames(contents.get("go.mod"), names);
  addTomlDependencyNames(contents.get("Cargo.toml"), names);
  addTomlDependencyNames(contents.get("pyproject.toml"), names);
  return names;
}

function addJsonDependencyNames(packageJson: string | undefined, names: Set<string>): void {
  if (!packageJson) {
    return;
  }
  try {
    const parsed = JSON.parse(packageJson) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    for (const section of [parsed.dependencies, parsed.devDependencies, parsed.optionalDependencies]) {
      for (const name of Object.keys(section ?? {})) {
        names.add(name);
      }
    }
  } catch {
    return;
  }
}

function addGoModNames(goMod: string | undefined, names: Set<string>): void {
  if (!goMod) {
    return;
  }
  const pattern = /^\s*([A-Za-z0-9_.\-/]+)\s+v[0-9]/gm;
  let match = pattern.exec(goMod);
  while (match) {
    if (match[1]) {
      names.add(match[1]);
    }
    match = pattern.exec(goMod);
  }
}

function addTomlDependencyNames(text: string | undefined, names: Set<string>): void {
  if (!text) {
    return;
  }
  const pattern = /^([A-Za-z0-9_.-]+)\s*=\s*["{]/gm;
  let match = pattern.exec(text);
  while (match) {
    if (match[1] && match[1] !== "name" && match[1] !== "version") {
      names.add(match[1]);
    }
    match = pattern.exec(text);
  }
}

const SOURCE_EXTENSION = {
  PYTHON: ".py",
} as const;

function collectReferencedNames(contents: Map<string, string>): Set<string> {
  const names = new Set<string>();
  const specifier = /(?:from\s+|import\s+|require\(\s*)['"]([^'"]+)['"]/g;
  const pythonImport = /^(?:import|from)\s+([A-Za-z_][\w.]*)/gm;
  for (const [path, content] of contents) {
    const source = sourceWithoutComments(path, content);
    let match = specifier.exec(source);
    while (match) {
      addSpecifier(names, match[1] ?? "");
      match = specifier.exec(source);
    }
    specifier.lastIndex = 0;
    match = pythonImport.exec(source);
    while (match) {
      addSpecifier(names, (match[1] ?? "").split(".")[0] ?? "");
      match = pythonImport.exec(source);
    }
    pythonImport.lastIndex = 0;
  }
  return names;
}

function sourceWithoutComments(path: string, content: string): string {
  if (path.endsWith(SOURCE_EXTENSION.PYTHON)) {
    return stripHashComments(content);
  }
  return stripSlashComments(content);
}

function stripSlashComments(content: string): string {
  let result = "";
  let inBlock = false;
  let inLine = false;
  let stringQuote = "";
  for (let index = 0; index < content.length; index += 1) {
    const current = content[index] ?? "";
    const next = content[index + 1] ?? "";
    if (inLine) {
      if (current === "\n") {
        inLine = false;
        result += "\n";
      }
      continue;
    }
    if (inBlock) {
      if (current === "*" && next === "/") {
        inBlock = false;
        index += 1;
      } else if (current === "\n") {
        result += "\n";
      }
      continue;
    }
    if (stringQuote.length > 0) {
      result += current;
      if (current === "\\" ) {
        const escaped = content[index + 1];
        if (escaped) {
          result += escaped;
          index += 1;
        }
      } else if (current === stringQuote) {
        stringQuote = "";
      }
      continue;
    }
    if (current === "/" && next === "/") {
      inLine = true;
      index += 1;
      continue;
    }
    if (current === "/" && next === "*") {
      inBlock = true;
      index += 1;
      continue;
    }
    if (current === "\"" || current === "'" || current === "`") {
      stringQuote = current;
    }
    result += current;
  }
  return result;
}

function stripHashComments(content: string): string {
  let result = "";
  let stringQuote = "";
  for (let index = 0; index < content.length; index += 1) {
    const current = content[index] ?? "";
    if (stringQuote.length > 0) {
      result += current;
      if (current === "\\" && stringQuote !== "\"\"\"") {
        const escaped = content[index + 1];
        if (escaped) {
          result += escaped;
          index += 1;
        }
      } else if (content.startsWith(stringQuote, index)) {
        result += stringQuote.slice(1);
        index += stringQuote.length - 1;
        stringQuote = "";
      }
      continue;
    }
    if (content.startsWith("\"\"\"", index) || content.startsWith("'''", index)) {
      stringQuote = content.slice(index, index + 3);
      result += stringQuote;
      index += 2;
      continue;
    }
    if (current === "\"" || current === "'") {
      stringQuote = current;
      result += current;
      continue;
    }
    if (current === "#") {
      const lineEnd = content.indexOf("\n", index);
      if (lineEnd < 0) {
        break;
      }
      result += "\n";
      index = lineEnd;
      continue;
    }
    result += current;
  }
  return result;
}

function addSpecifier(names: Set<string>, raw: string): void {
  const cleaned = raw.replace(/\\/g, "/");
  if (!cleaned) {
    return;
  }
  names.add(cleaned);
  const parts = cleaned.split("/");
  if (cleaned.startsWith("@") && parts.length >= 2) {
    names.add(`${parts[0]}/${parts[1]}`);
    return;
  }
  if (parts[0]) {
    names.add(parts[0]);
  }
}

function coordinate(
  ecosystem: PackageCoordinate["ecosystem"],
  name: string,
  version: string,
  manifestPath: string,
  directNames: Set<string>,
): PackageCoordinate {
  return {
    ecosystem,
    name,
    version,
    manifestPath,
    scope: directNames.has(name) ? PACKAGE_SCOPE.DIRECT : PACKAGE_SCOPE.TRANSITIVE,
    purl: purlFor(ecosystem, name, version),
    referencedInSource: false,
  };
}

function purlFor(ecosystem: PackageCoordinate["ecosystem"], name: string, version: string): string {
  if (ecosystem === PACKAGE_ECOSYSTEM.NPM) {
    return `pkg:npm/${encodePurlName(name)}@${version}`;
  }
  if (ecosystem === PACKAGE_ECOSYSTEM.PYPI) {
    return `pkg:pypi/${name.toLowerCase()}@${version}`;
  }
  if (ecosystem === PACKAGE_ECOSYSTEM.GO) {
    return `pkg:golang/${name}@${version}`;
  }
  if (ecosystem === PACKAGE_ECOSYSTEM.CARGO) {
    return `pkg:cargo/${name}@${version}`;
  }
  if (ecosystem === PACKAGE_ECOSYSTEM.MAVEN) {
    const [group, artifact] = name.split(":");
    return `pkg:maven/${group}/${artifact}@${version}`;
  }
  return `pkg:nuget/${name}@${version}`;
}

function encodePurlName(name: string): string {
  return name.replace(/^@/, "%40").replace("/", "%2F");
}

function tagValue(block: string, tag: string): string | undefined {
  return new RegExp(`<${tag}>([^<]+)</${tag}>`).exec(block)?.[1]?.trim();
}
