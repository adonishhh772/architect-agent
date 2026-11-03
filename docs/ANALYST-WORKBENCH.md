# Analyst workbench

The interface uses STRIDE Repository Lab as its visual reference. The application remains a GitHub Pages frontend with optional AI calls explicitly enabled by the user, on-device encrypted report storage, and local/CI scanning.

## Start a review

1. Open Workspace, choose **Inspect another workspace**, and index a public repository or upload a ZIP. The **Demo fixture** is intentionally vulnerable sample code.
2. Choose **Run static review** for on-device rules and architecture candidates without a model key. Advisory disclosure is optional and separately controlled.
3. For AI review, unlock the vault, configure and test a provider, and confirm source transmission to that provider.
4. Review the snapshot and coverage. Missing files, failed stages and disabled checks limit what can be concluded.
5. Use **Data flows**, **Threat queue**, **Evidence**, **Controls**, and **Reports & coverage**.

A static report can be reviewed in memory without a vault. Export its JSON before navigating away. For encrypted automatic retention, create/unlock the vault before starting, or import the exported report after unlocking. Reports and analyst annotations use the existing encrypted IndexedDB store. Exports are ordinary files: store them in an appropriate private location.

## Data-flow diagrams

Data-flow and call/import views are distinct. Inferred flows are dashed. Routes do not establish public exposure. File references show source constructs; they do not prove runtime reachability, data classification or deployed controls.

- Switch function traces on for more detail.
- Select an edge or component, inspect its evidence, then record data classification, transport, authentication, authorisation and boundary assumptions.
- Assign trust zones explicitly. These are analyst declarations rather than independently discovered infrastructure.
- Add missing actors, services, stores and connections. Original extracted evidence is retained.
- Drag components to arrange the model. Export SVG, PNG, Mermaid or model JSON. The rendered canvas is limited to 150 nodes; model and Mermaid exports retain all nodes in the selected view.
- Model JSON can be imported back into the same report/snapshot. Full report JSON preserves reviews, controls, model declarations and scanner metadata across report export/import.

JavaScript/TypeScript traces use a bounded syntax-tree pass for direct values and same-file function arguments. They are not a complete interprocedural taint engine. Aliases, library return values, dynamic calls, branch feasibility and sanitiser semantics may be unsupported. Python/Go traces remain heuristic candidates. No output is a claim that a vulnerability is exploitable.

## Analyst decisions

Record an owner, due date, decision rationale and verification evidence. Accepted risk and false-positive decisions require a rationale. A verification result requires the tested snapshot and evidence.

Absence of a finding in a later scan no longer automatically marks it fixed. A passing targeted test is an analyst-recorded result, not a blanket security assurance.

The review log is local report history, not an independently signed or tamper-proof audit trail.

## Control review and AI-system review

The Controls view contains selected prompts informed by ASVS 5.0 and OWASP Agentic Top 10. It is not the full ASVS catalogue, a certification or proof of compliance. Controls begin **not assessed**. Changing an assessment requires a named reviewer and evidence or an applicability rationale.

AI reviewer prompts consider agent instructions, tool permissions, delegated identities, tenant boundaries, retrieval/memory poisoning, data egress, approval bypass and resource limits. Framework identifiers remain constrained by the schema; reviewers must not invent a mapping.

## Scanner result import

Use **Scanner results** inside an open review to import SARIF 2.1.0, maximum 8 MB. Enter the exact report commit. Embedded conflicting scanner revision metadata is rejected.

Relative file paths and source line ranges are validated. Absolute or traversing paths are skipped. Results without loaded evidence are downgraded. Supported short SARIF code-flow traces become explicitly inferred connections after their locations are checked. Scanner failures remain visible; an empty imported result does not prove complete coverage or security.

Tool versions, imported/skipped counts and declared snapshot are stored with the report. Repeated import of the same SARIF run is deduplicated. Scanner claims are never automatically analyst-confirmed. Automatic fixes or commands in imported SARIF are not executed.

## Local scanner runner

Install your chosen scanner from its official distribution, separately from the target repository. Review the tool and ruleset licence for your intended commercial use.

```sh
node scripts/local-security-runner.mjs --repository /private/repository --output /private/scan-results --tool gitleaks

node scripts/local-security-runner.mjs --repository /private/repository --output /private/scan-results --tool semgrep --rules /absolute/trusted/semgrep-review.yml
```

Copy or use this repository's reviewed `scripts/semgrep-review.yml` as a small starter ruleset. It is not a comprehensive SAST rule collection. Gitleaks uses the runner's trusted default configuration and full secret redaction.

The runner resolves installed executables from a trusted PATH outside the target repository. It materialises committed regular files from HEAD using Git objects, skips symlinks/submodules, files over 2 MB and selected scanner configuration, and limits the snapshot to 5,000 files/80 MB. No target code is executed; no package installation or rule download is requested. Scanner processes have a ten-minute timeout. The manifest records omissions, version and outcome. Temporary snapshots are removed on normal process exit.

This helper is not an operating-system sandbox. Use a disposable container/VM with resource and egress controls for untrusted projects. Local-rule scanning does not itself enforce a network firewall. The frontend has no shared team backend, tenant service or server-side secret store.

For CodeQL or another scanner, generate SARIF in your approved environment and import it. CodeQL private-code use has separate licensing requirements.

## Quality checks

```sh
npm ci
npm run build
npm run test:unit
node scripts/evaluate-flows.mjs
```

The evaluation command reports results for five small synthetic flow cases, not real-world accuracy. Regression tests cover constant/overwritten values, evidence mismatch, snapshot mismatch, scanner failure, unsafe paths, old-report compatibility, control decisions and review verification.

Deployment now runs regression tests before uploading Pages assets. CI workflow inputs are passed through environment variables rather than inserted into shell commands.
