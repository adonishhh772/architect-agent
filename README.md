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
  --maxRequests 24 \
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
- Multi-agent LangGraph audit shared by the browser and the Deep Runner CLI: full-repository reader, cartographer, STRIDE, OWASP Top 10 plus LLM Top 10, MITRE ATLAS, data risk, infrastructure risk, and open pull requests
- Copilot skills (accuracy, full-repository reading, threat modeling, pull requests, memory) are applied on every specialist pass
- A repository memory records files read, files still unread, open questions, and pull requests reviewed. The next run on the same repository loads it. The CLI writes `memory.json`
- Investigation tools (read, search, routes, graph neighborhood) feed each specialist; a verifier checks citations and links findings to module nodes
- Static rules for eval, HTML injection, secret defaults, secret logging, published compose ports, and committed `.env` files
- Deterministic scanners for known credential patterns, missing route authentication, SQL and command interpolation, and request-controlled outbound calls. Matched secret values are omitted from findings
- Lockfile advisory lookup through the public OSV API for npm, Python, and Go coordinates. The repository is not installed
- Function-level source-to-sink chains for TypeScript and JavaScript, with impact, likelihood, risk score, and a ranked remediation list
- Pull request review comment that marks findings new, fixed, or regressed against the previous snapshot. The CLI can post it with `--pullRequest` and `--postReview`
- Follow-up copilot that re-reads files, callers, and data-flow edges after the audit
- No runtime execution or IaC simulation
- Browser AI limited by provider CORS policies. The dev server proxies OpenAI and DeepSeek; GitHub Pages calls providers directly from the browser

## Deployment (GitHub Pages)

Push to `main` runs `.github/workflows/deploy-pages.yml`. Set repository **Pages** source to **GitHub Actions**. The build sets `base` to `/<repo-name>/` automatically in Actions.
