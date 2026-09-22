# Architecture Sentinel — implementation plan (executed)

## Vertical slices delivered

1. **GitHub Pages app + ingestion + schema** — Vite/React hash router, GitHub public fetch, ZIP safety, Zod report schema, IndexedDB persistence.
2. **Providers + bounded orchestrator** — OpenAI, Anthropic, Gemini, DeepSeek, OpenAI-compatible adapters; static + optional AI loop with constrained tools.
3. **Architecture graph** — TS/JS extraction, React Flow + dagre layout, interactive workspace map.
4. **Findings** — STRIDE-tagged security/architecture/AI-security items with evidence references and separate classification.
5. **Deep Runner** — Shared-package CLI and manual GitHub Actions workflow producing importable JSON artifacts.
6. **Hardening** — Prompt-injection sanitization, export secret stripping, session-only credentials, labeled demo fixture, tests and workflows.

## Known gaps (explicit)

- No live OSV/advisory integration for dependency CVE claims.
- Browser AI limited to CORS-compatible providers (Gemini documented as callable; others use Deep Runner).
- SVG/PNG diagram export is planned as a React Flow snapshot enhancement; JSON/Markdown/HTML exports are implemented.
- Multi-language analysis beyond TS/JS inventory heuristics remains adapter-extensible but shallow.
