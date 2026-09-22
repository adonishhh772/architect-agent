import type { ProviderSettings } from "@sentinel/schema";

export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface NormalizedMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  messages: NormalizedMessage[];
  jsonSchema?: Record<string, unknown>;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface CompletionResult {
  text: string;
  parsedJson?: unknown;
  usage: ProviderUsage;
  model: string;
  finishReason: string;
}

export type ProviderErrorCode =
  | "authentication"
  | "cors"
  | "quota"
  | "timeout"
  | "unsupported_model"
  | "malformed_response"
  | "validation_failed"
  | "network"
  | "unknown";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly statusCode?: number;
  readonly retryable: boolean;
  readonly providerId: string;

  constructor(
    providerId: string,
    code: ProviderErrorCode,
    message: string,
    options?: { statusCode?: number; retryable?: boolean; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "ProviderError";
    this.providerId = providerId;
    this.code = code;
    this.statusCode = options?.statusCode;
    this.retryable = options?.retryable ?? false;
  }
}

export interface ModelInfo {
  id: string;
  displayName?: string;
  contextWindow?: number;
  outputLimit?: number;
}

export interface ConnectionTestResult {
  ok: boolean;
  latencyMs?: number;
  error?: ProviderError;
  models?: ModelInfo[];
}

export interface AiProviderAdapter {
  readonly providerId: string;
  readonly settings: ProviderSettings;
  testConnection(apiKey: string): Promise<ConnectionTestResult>;
  listModels?(apiKey: string): Promise<ModelInfo[]>;
  complete(apiKey: string, request: CompletionRequest): Promise<CompletionResult>;
}

export interface FetchFn {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
