import { extractJsonFromText } from "@sentinel/providers";
import { FINDING_CATEGORY } from "@sentinel/schema";
import { z } from "zod";
import { ToolName } from "./investigation-tools.js";

const TOOL_NAMES = new Set<string>(Object.values(ToolName));
const FINDING_LIMIT = 8;
const TOOL_CALL_LIMIT = 4;
const ATTACK_PATH_LIMIT = 4;
const TEXT_LIMIT = 12000;
const OVERVIEW_LIMIT = 8000;

const CATEGORY_BY_ALIAS: Record<string, string> = {
  architecture: FINDING_CATEGORY.ARCHITECTURE,
  security: FINDING_CATEGORY.SECURITY,
  ai_security: FINDING_CATEGORY.AI_SECURITY,
  aisecurity: FINDING_CATEGORY.AI_SECURITY,
  cybersecurity: FINDING_CATEGORY.SECURITY,
};

export function parseLooseJson(text: string): unknown | null {
  const extracted = extractJsonFromText(text);
  if (!extracted) {
    return null;
  }
  const repaired = extracted.replace(/,\s*([}\]])/g, "$1");
  const direct = readJson(repaired);
  if (direct !== undefined) {
    return direct;
  }
  return readJson(closeTruncatedJson(repaired));
}

export function normalizeSpecialistPayload(value: unknown): Record<string, unknown> {
  const source = unwrapSpecialistRecord(value);
  return {
    architectureBrief: clipText(source.architectureBrief, TEXT_LIMIT),
    architectureMermaid: clipText(source.architectureMermaid, TEXT_LIMIT),
    threatModelOverview: clipText(
      source.threatModelOverview ?? source.overview ?? source.summary,
      OVERVIEW_LIMIT,
    ),
    toolCalls: normalizeToolCalls(source.toolCalls ?? source.tool_calls),
    findings: normalizeFindings(source.findings),
    attackPaths: normalizeAttackPaths(source.attackPaths ?? source.attack_paths),
  };
}

export function parseSpecialistResponse<T>(text: string, schema: z.ZodType<T>): { success: true; data: T } | { success: false; error: string } {
  const parsed = parseLooseJson(text);
  if (parsed === null) {
    return { success: false, error: "no_json_found" };
  }
  const validated = schema.safeParse(normalizeSpecialistPayload(parsed));
  if (!validated.success) {
    return { success: false, error: validated.error.message.slice(0, 500) };
  }
  return { success: true, data: validated.data };
}

function readJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function closeTruncatedJson(text: string): string {
  const closers: string[] = [];
  let inString = false;
  let escaped = false;
  for (const character of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") {
      closers.push("}");
      continue;
    }
    if (character === "[") {
      closers.push("]");
      continue;
    }
    if ((character === "}" || character === "]") && closers.length > 0) {
      closers.pop();
    }
  }
  let closed = text;
  if (inString) {
    closed = `${closed}"`;
  }
  for (let index = closers.length - 1; index >= 0; index -= 1) {
    closed = `${closed}${closers[index] ?? ""}`;
  }
  return closed.replace(/,\s*([}\]])/g, "$1");
}

function unwrapSpecialistRecord(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return { findings: value };
  }
  if (!isRecord(value)) {
    return {};
  }
  const nested = value.response ?? value.audit ?? value.result ?? value.data;
  if (isRecord(nested) && (nested.findings !== undefined || nested.threatModelOverview !== undefined || nested.toolCalls !== undefined)) {
    return nested;
  }
  return value;
}

function normalizeFindings(value: unknown): unknown[] {
  const items = asList(value);
  const findings: unknown[] = [];
  for (let index = 0; index < items.length && findings.length < FINDING_LIMIT; index += 1) {
    const finding = normalizeFinding(items[index], index);
    if (finding) {
      findings.push(finding);
    }
  }
  return findings;
}

function normalizeFinding(value: unknown, index: number): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }
  const title = clipText(value.title ?? value.name, 500);
  if (!title) {
    return null;
  }
  const stableKey = clipText(value.stableKey ?? value.stable_key ?? value.id, 200) ?? `finding-${index + 1}`;
  return {
    stableKey,
    title,
    category: normalizeCategory(value.category),
    strideCategories: asStringList(value.strideCategories ?? value.stride_categories),
    owaspCategories: asStringList(value.owaspCategories ?? value.owasp_categories),
    atlasTechniqueIds: asStringList(value.atlasTechniqueIds ?? value.atlas_technique_ids),
    riskDomains: asStringList(value.riskDomains ?? value.risk_domains),
    scenario: clipText(value.scenario ?? value.description ?? title, 4000) ?? title,
    mitigation: clipText(value.mitigation ?? value.recommendation ?? "Confirm the control in the indexed source.", 4000) ?? title,
    preconditions: asStringList(value.preconditions),
    trustBoundaryCrossings: asStringList(value.trustBoundaryCrossings ?? value.trust_boundary_crossings),
    existingControls: asStringList(value.existingControls ?? value.existing_controls),
    counterevidence: asStringList(value.counterevidence),
    openQuestions: asStringList(value.openQuestions ?? value.open_questions),
    severityRationale: clipText(value.severityRationale ?? value.severity_rationale, 4000),
    likelihoodRationale: clipText(value.likelihoodRationale ?? value.likelihood_rationale, 4000),
    confidence: normalizeConfidence(value.confidence),
    references: normalizeReferences(value.references ?? value.citations),
  };
}

function normalizeToolCalls(value: unknown): unknown[] {
  const calls: unknown[] = [];
  for (const item of asList(value)) {
    if (calls.length >= TOOL_CALL_LIMIT) {
      break;
    }
    const call = normalizeToolCall(item);
    if (call) {
      calls.push(call);
    }
  }
  return calls;
}

function normalizeToolCall(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }
  const tool = normalizeToolName(value.tool ?? value.name);
  if (!tool) {
    return null;
  }
  const args = isRecord(value.args) ? value.args : isRecord(value.arguments) ? value.arguments : {};
  return { tool, args };
}

function normalizeAttackPaths(value: unknown): unknown[] {
  const paths: unknown[] = [];
  for (const item of asList(value)) {
    if (paths.length >= ATTACK_PATH_LIMIT || !isRecord(item)) {
      continue;
    }
    const title = clipText(item.title, 500);
    const id = clipText(item.id, 200);
    const description = clipText(item.description, 4000);
    const stepStableKeys = asStringList(item.stepStableKeys ?? item.step_stable_keys);
    if (!title || !id || !description || stepStableKeys.length === 0) {
      continue;
    }
    paths.push({ id, title, description, stepStableKeys });
  }
  return paths;
}

function normalizeReferences(value: unknown): unknown[] {
  const references: unknown[] = [];
  for (const item of asList(value)) {
    if (typeof item === "string" && item.trim()) {
      references.push({ path: item.trim() });
      continue;
    }
    if (!isRecord(item)) {
      continue;
    }
    const path = clipText(item.path ?? item.file ?? item.filename, 1000);
    if (!path) {
      continue;
    }
    references.push({
      path,
      startLine: asLine(item.startLine ?? item.start_line),
      endLine: asLine(item.endLine ?? item.end_line),
    });
  }
  return references;
}

function normalizeCategory(value: unknown): string {
  if (typeof value !== "string") {
    return FINDING_CATEGORY.SECURITY;
  }
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return CATEGORY_BY_ALIAS[key] ?? FINDING_CATEGORY.SECURITY;
}

function normalizeConfidence(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampUnit(value > 1 ? value / 100 : value);
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return clampUnit(numeric > 1 ? numeric / 100 : numeric);
    }
    const label = value.trim().toLowerCase();
    if (label === "high") {
      return 0.8;
    }
    if (label === "medium") {
      return 0.5;
    }
    if (label === "low") {
      return 0.3;
    }
  }
  return 0.5;
}

function normalizeToolName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  if (TOOL_NAMES.has(value)) {
    return value;
  }
  const compact = value.replace(/[_-\s]/g, "").toLowerCase();
  for (const toolName of TOOL_NAMES) {
    if (toolName.toLowerCase() === compact) {
      return toolName;
    }
  }
  return null;
}

function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [value];
}

function asStringList(value: unknown): string[] {
  return asList(value)
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function asLine(value: unknown): number | undefined {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric) || numeric < 1) {
    return undefined;
  }
  return Math.floor(numeric);
}

function clipText(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return trimmed.slice(0, limit);
}

function clampUnit(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
