import { z } from "zod";

export const IndexedFileSchema = z.object({
  path: z.string().min(1),
  size: z.number().int().nonnegative(),
  lineCount: z.number().int().nonnegative(),
  language: z.string().optional(),
  sha256: z.string().optional(),
  excluded: z.boolean().default(false),
  exclusionReason: z.string().optional(),
});

export type IndexedFile = z.infer<typeof IndexedFileSchema>;

export const RepositoryFileIndexSchema = z.object({
  commitSha: z.string().optional(),
  rootPath: z.string().default(""),
  files: z.record(z.string(), IndexedFileSchema),
});

export interface RepositoryFileIndex {
  commitSha?: string;
  rootPath: string;
  files: Map<string, IndexedFile>;
}

export function fileIndexFromRecord(
  record: z.infer<typeof RepositoryFileIndexSchema>,
): RepositoryFileIndex {
  return {
    commitSha: record.commitSha,
    rootPath: record.rootPath,
    files: new Map(Object.entries(record.files)),
  };
}

export function fileIndexToRecord(index: RepositoryFileIndex): z.infer<
  typeof RepositoryFileIndexSchema
> {
  return {
    commitSha: index.commitSha,
    rootPath: index.rootPath,
    files: Object.fromEntries(index.files),
  };
}
