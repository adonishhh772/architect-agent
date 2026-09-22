import { buildRepositoryStore } from "@sentinel/ingestion";
import demoFiles from "../../fixtures/demo-files.json";

export function loadDemoFixtureStore(): ReturnType<typeof buildRepositoryStore> {
  const files = demoFiles as Array<{ path: string; content: string }>;
  return buildRepositoryStore(files, {
    commitSha: "demo000000000000000000000000000000000000",
  });
}

export const DEMO_FIXTURE_LABEL = "DEMO FIXTURE — synthetic vulnerable sample (not a real audit)";
