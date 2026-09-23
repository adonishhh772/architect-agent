# Architecture Sentinel — implementation plan (executed)

## Vertical slices delivered

1. **GitHub Pages app + ingestion + schema** — Vite/React hash router, GitHub public fetch, ZIP safety, Zod report schema, IndexedDB persistence.
2. **Providers + multi-agent audit** — OpenAI, Anthropic, Gemini, DeepSeek, OpenAI-compatible adapters; LangGraph specialists for architecture, STRIDE, OWASP, MITRE ATLAS, data, and infrastructure, shared by the browser and the CLI.
3. **Architecture graph** — TS/JS extraction, React Flow + dagre layout, interactive workspace map.
4. **Findings** — STRIDE-tagged security/architecture/AI-security items with evidence references and separate classification.
5. **Deep Runner** — Shared-package CLI and manual GitHub Actions workflow producing importable JSON artifacts.
6. **Hardening** — Prompt-injection sanitization, export secret stripping, session-only credentials, labeled demo fixture, tests and workflows.

## Known gaps (explicit)

- Dependency advisories use the public OSV API for lockfile coordinates. There is no full SBOM or private advisory feed.
- Browser AI limited to CORS-compatible providers (Gemini documented as callable; OpenAI and DeepSeek use the Vite dev proxy, not GitHub Pages).
- Multi-agent audit is evidence-backed and advisory. It does not execute the target repository.
- SVG/PNG diagram export is planned as a React Flow snapshot enhancement; JSON/Markdown/HTML exports are implemented.
- Multi-language analysis beyond TS/JS inventory heuristics remains adapter-extensible but shallow.
