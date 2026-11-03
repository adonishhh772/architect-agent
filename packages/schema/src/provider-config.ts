import { z } from "zod";
import { PROVIDER_ID } from "./constants.js";

export const ProviderSettingsSchema = z.object({
  providerId: z.enum([
    PROVIDER_ID.OPENAI,
    PROVIDER_ID.ANTHROPIC,
    PROVIDER_ID.GEMINI,
    PROVIDER_ID.DEEPSEEK,
    PROVIDER_ID.OPENAI_COMPATIBLE,
  ]),
  modelId: z.string().min(1).max(200),
  reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
  endpoint: z.string().url().optional(),
  customEndpointConfirmed: z.boolean().default(false),
  contextLimit: z.number().int().positive().optional(),
  outputLimit: z.number().int().positive().optional(),
  requestTimeoutMs: z.number().int().positive().default(120_000),
  maxConcurrency: z.number().int().min(1).max(10).default(2),
  maxRetries: z.number().int().min(0).max(5).default(2),
  maxTokensBudget: z.number().int().positive().optional(),
  maxRequestsBudget: z.number().int().positive().optional(),
  costPerInputToken: z.number().nonnegative().optional(),
  costPerOutputToken: z.number().nonnegative().optional(),
});

export type ProviderSettings = z.infer<typeof ProviderSettingsSchema>;

export const ProviderCapabilitiesSchema = z.object({
  browserCallable: z.boolean(),
  structuredOutput: z.boolean(),
  modelDiscovery: z.boolean(),
  toolCalling: z.boolean(),
  notes: z.array(z.string()).default([]),
});

export type ProviderCapabilities = z.infer<typeof ProviderCapabilitiesSchema>;
