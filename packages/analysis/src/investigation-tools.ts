import { getGraphNeighborhood } from "@sentinel/graph";
import type { ArchitectureGraph } from "@sentinel/schema";
import { z } from "zod";

export const ToolName = {
  LIST_FILES: "listFiles",
  READ_FILE_RANGE: "readFileRange",
  SEARCH_CODE: "searchCode",
  FIND_SYMBOL: "findSymbol",
  FIND_REFERENCES: "findReferences",
  INSPECT_ROUTE: "inspectRoute",
  INSPECT_CONFIGURATION: "inspectConfiguration",
  GET_GRAPH_NEIGHBORHOOD: "getGraphNeighborhood",
} as const;

export type ToolNameValue = (typeof ToolName)[keyof typeof ToolName];

export const ListFilesArgsSchema = z.object({
  prefix: z.string().max(500).optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

export const ReadFileRangeArgsSchema = z.object({
  path: z.string().min(1).max(1000),
  startLine: z.number().int().min(1).max(100_000),
  endLine: z.number().int().min(1).max(100_000),
});

export const SearchCodeArgsSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(100).default(25),
});

export const FindSymbolArgsSchema = z.object({
  symbol: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(50).default(20),
});

export const FindReferencesArgsSchema = FindSymbolArgsSchema;

export const InspectRouteArgsSchema = z.object({
  method: z.string().max(20).optional(),
  pathContains: z.string().max(200).optional(),
});

export const InspectConfigurationArgsSchema = z.object({
  filename: z.string().min(1).max(200),
});

export const GetGraphNeighborhoodArgsSchema = z.object({
  nodeId: z.string().min(1).max(500),
  depth: z.number().int().min(1).max(3).default(1),
});

export interface InvestigationToolContext {
  contents: Map<string, string>;
  graph: ArchitectureGraph;
}

function validatePath(path: string, contents: Map<string, string>): string | null {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!contents.has(normalized)) {
    return null;
  }
  return normalized;
}

export function executeInvestigationTool(
  toolName: ToolNameValue,
  rawArgs: unknown,
  context: InvestigationToolContext,
): unknown {
  switch (toolName) {
    case ToolName.LIST_FILES: {
      const args = ListFilesArgsSchema.parse(rawArgs);
      const paths = [...context.contents.keys()]
        .filter((path) => (args.prefix ? path.startsWith(args.prefix) : true))
        .slice(0, args.limit);
      return { paths, total: paths.length };
    }
    case ToolName.READ_FILE_RANGE: {
      const args = ReadFileRangeArgsSchema.parse(rawArgs);
      const path = validatePath(args.path, context.contents);
      if (!path) {
        return { error: "file_not_found", path: args.path };
      }
      const lines = context.contents.get(path)?.split("\n") ?? [];
      const start = Math.max(1, args.startLine);
      const end = Math.min(lines.length, args.endLine);
      return {
        path,
        startLine: start,
        endLine: end,
        content: lines.slice(start - 1, end).join("\n"),
      };
    }
    case ToolName.SEARCH_CODE: {
      const args = SearchCodeArgsSchema.parse(rawArgs);
      const matches: Array<{ path: string; line: number; excerpt: string }> = [];
      for (const [path, content] of context.contents) {
        const lines = content.split("\n");
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
          if (lines[lineIndex]?.includes(args.query)) {
            matches.push({
              path,
              line: lineIndex + 1,
              excerpt: lines[lineIndex]?.slice(0, 240) ?? "",
            });
            if (matches.length >= args.limit) {
              return { matches };
            }
          }
        }
      }
      return { matches };
    }
    case ToolName.FIND_SYMBOL: {
      const args = FindSymbolArgsSchema.parse(rawArgs);
      const pattern = new RegExp(
        `(class|function|const|let|var|interface|type)\\s+${args.symbol}\\b`,
        "g",
      );
      const matches: Array<{ path: string; line: number }> = [];
      for (const [path, content] of context.contents) {
        const lines = content.split("\n");
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
          if (pattern.test(lines[lineIndex] ?? "")) {
            matches.push({ path, line: lineIndex + 1 });
            pattern.lastIndex = 0;
            if (matches.length >= args.limit) {
              return { matches };
            }
          }
          pattern.lastIndex = 0;
        }
      }
      return { matches };
    }
    case ToolName.FIND_REFERENCES: {
      const args = FindReferencesArgsSchema.parse(rawArgs);
      const pattern = new RegExp(`\\b${args.symbol}\\b`, "g");
      const matches: Array<{ path: string; line: number }> = [];
      for (const [path, content] of context.contents) {
        const lines = content.split("\n");
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
          if (pattern.test(lines[lineIndex] ?? "")) {
            matches.push({ path, line: lineIndex + 1 });
            if (matches.length >= args.limit) {
              return { matches };
            }
          }
        }
      }
      return { matches };
    }
    case ToolName.INSPECT_ROUTE: {
      const args = InspectRouteArgsSchema.parse(rawArgs);
      const routes: Array<{ path: string; line: number; excerpt: string }> = [];
      const routeRegex =
        /@(Get|Post|Put|Patch|Delete)\(['"`]([^'"`]+)['"`]|app\.(get|post)\(\s*['"`]([^'"`]+)['"`]/g;
      for (const [path, content] of context.contents) {
        const lines = content.split("\n");
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
          const line = lines[lineIndex] ?? "";
          routeRegex.lastIndex = 0;
          const match = routeRegex.exec(line);
          if (!match) {
            continue;
          }
          const method = (match[1] ?? match[3] ?? "").toLowerCase();
          const routePath = match[2] ?? match[4] ?? "";
          if (args.method && method !== args.method.toLowerCase()) {
            continue;
          }
          if (args.pathContains && !routePath.includes(args.pathContains)) {
            continue;
          }
          routes.push({ path, line: lineIndex + 1, excerpt: line.trim() });
        }
      }
      return { routes };
    }
    case ToolName.INSPECT_CONFIGURATION: {
      const args = InspectConfigurationArgsSchema.parse(rawArgs);
      const matches = [...context.contents.keys()].filter((path) =>
        path.endsWith(`/${args.filename}`) || path === args.filename,
      );
      return {
        matches: matches.map((path) => ({
          path,
          preview: context.contents.get(path)?.slice(0, 2000),
        })),
      };
    }
    case ToolName.GET_GRAPH_NEIGHBORHOOD: {
      const args = GetGraphNeighborhoodArgsSchema.parse(rawArgs);
      return getGraphNeighborhood(context.graph, args.nodeId, args.depth);
    }
    default:
      return { error: "unknown_tool" };
  }
}
