import { z } from "zod";

export const GitHubRepoRefSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  ref: z.string().optional(),
});

export type GitHubRepoRef = z.infer<typeof GitHubRepoRefSchema>;

export function parseGitHubRepositoryUrl(url: string): GitHubRepoRef | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.hostname !== "github.com") {
      return null;
    }
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length < 2) {
      return null;
    }
    const [owner, nameRaw, ...rest] = segments;
    const name = nameRaw.replace(/\.git$/, "");
    let ref: string | undefined;
    if (rest[0] === "tree" && rest[1]) {
      ref = rest.slice(1).join("/");
    } else if (rest[0] === "blob" && rest[1]) {
      ref = rest.slice(1).join("/");
    }
    return GitHubRepoRefSchema.parse({ owner, name, ref });
  } catch {
    return null;
  }
}
