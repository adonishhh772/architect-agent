import { z } from "zod";
import { GRAPH_NODE_KIND } from "./constants.js";
import { ProvenanceSchema } from "./evidence.js";

export const GraphNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    GRAPH_NODE_KIND.ACTOR,
    GRAPH_NODE_KIND.APPLICATION,
    GRAPH_NODE_KIND.SERVICE,
    GRAPH_NODE_KIND.MODULE,
    GRAPH_NODE_KIND.API_ENTRY,
    GRAPH_NODE_KIND.DATA_STORE,
    GRAPH_NODE_KIND.QUEUE,
    GRAPH_NODE_KIND.WORKER,
    GRAPH_NODE_KIND.EXTERNAL_SYSTEM,
    GRAPH_NODE_KIND.AI_MODEL,
    GRAPH_NODE_KIND.AI_AGENT,
    GRAPH_NODE_KIND.AI_TOOL,
    GRAPH_NODE_KIND.RETRIEVAL_STORE,
    GRAPH_NODE_KIND.MEMORY,
    GRAPH_NODE_KIND.TRUST_BOUNDARY,
  ]),
  label: z.string().min(1).max(500),
  description: z.string().max(4000).optional(),
  parentId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  provenance: ProvenanceSchema,
});

export type GraphNode = z.infer<typeof GraphNodeSchema>;

export const GraphEdgeKindSchema = z.enum([
  "data_flow",
  "calls",
  "depends_on",
  "authenticates",
  "authorizes",
  "crosses_trust_boundary",
  "retrieves_from",
  "invokes_tool",
  "stores_in",
]);

export const GraphEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  kind: GraphEdgeKindSchema,
  label: z.string().max(500).optional(),
  bidirectional: z.boolean().default(false),
  provenance: ProvenanceSchema,
});

export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

export const ArchitectureGraphSchema = z.object({
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
});

export type ArchitectureGraph = z.infer<typeof ArchitectureGraphSchema>;
