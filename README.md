# Architecture Sentinel

Evidence-backed architecture and security analysis for software repositories, including AI agents, tools, RAG, and multi-agent workflows.

**Important:** Analysis output is advisory. It does **not** prove a system is secure.

## Modes

| Capability | Browser analysis | Deep Runner (CLI / GitHub Actions) |
| --- | --- | --- |
| Host | Static GitHub Pages UI | Node 20 runner |
| Repository access | Public GitHub API or ZIP upload | GitHub URL + optional `GITHUB_TOKEN` |
| AI providers | Browser-callable only (Gemini documented as CORS-capable; others typically blocked) | OpenAI, Anthropic, Gemini, DeepSeek, OpenAI-compatible |
| Credentials | In-memory session only | `SENTINEL_API_KEY`, optional `SENTINEL_API_ENDPOINT` |
| Persistence | Optional IndexedDB reports (secrets stripped) | JSON + Markdown artifacts |
| Background jobs | No (stops when tab closes) | Manual `workflow_dispatch` |

GitHub Pages hosts the UI only. Deep Runner executes in GitHub Actions using trusted analyser code; target repositories are treated as untrusted data (no dependency install, no repo script execution).

## Quick start

```bash
npm install
npm run build
npm run dev
```

Open the Vite dev server URL. Routes use **hash routing** (`/#/workspace`) for GitHub Pages compatibility.

## Deep Runner CLI

```bash
export SENTINEL_API_KEY=...
export GITHUB_TOKEN=...   # optional, for private repos or higher rate limits

npm run cli -- \
  --repositoryUrl https://github.com/org/repo \
  --providerId openai \
  --modelId gpt-4o-mini \
  --maxRequests 10 \
  --maxTokens 100000 \
  --outputDir ./analysis-artifacts
```

Import the generated JSON from the workspace **Import** page.

## GitHub Actions secrets (Deep Runner workflow)

- `SENTINEL_API_KEY` — model provider API key
- `SENTINEL_API_ENDPOINT` — optional custom OpenAI-compatible base URL
- `GITHUB_TOKEN` — default Actions token (read-only contents) or PAT for private targets

Trigger: **Actions → Deep Runner Analysis → Run workflow**.

## Project layout

- `apps/web` — React + Vite GitHub Pages application
- `apps/cli` — Deep Runner CLI
- `packages/schema` — Zod report/graph/finding schemas
- `packages/providers` — provider adapters and normalization
- `packages/ingestion` — GitHub/ZIP ingestion and safety limits
- `packages/graph` — architecture extraction and React Flow layout helpers
- `packages/analysis` — investigation tools, orchestrator, exports

## Security & privacy notes

- Browser API keys and GitHub tokens are kept in memory; use **Clear session** before sharing your screen.
- Exports and IndexedDB persistence strip secret fields and truncate excerpts.
- AI transmission requires explicit confirmation listing the configured provider.
- Custom OpenAI-compatible endpoints require explicit endpoint confirmation before requests.

## Tests

```bash
npm test
```

Tests cover ZIP safety, provider JSON repair, prompt-injection sanitization, static findings, export secret stripping, and static orchestration paths. Live provider API calls are not required for CI.

## Capabilities matrix (honest)

- Deep TS/JS route, dependency, AI-symbol, and data-store heuristics
- STRIDE tagging on supported static and AI-security findings
- Bounded investigation loop with constrained tools (browser + CLI)
- No OSV/CVE advisory integration yet (dependency issues require future advisory adapter)
- No runtime execution or IaC simulation
- Browser AI limited by provider CORS policies

## Deployment (GitHub Pages)

Push to `main` runs `.github/workflows/deploy-pages.yml`. Set repository **Pages** source to **GitHub Actions**. The build sets `base` to `/<repo-name>/` automatically in Actions.
