import { describe, expect, it } from "vitest";
import { GRAPH_NODE_KIND } from "@sentinel/schema";
import { buildArchitectureProfile } from "../architecture-profile.js";
import { extractCallFlows } from "../call-flow.js";
import { extractArchitecture } from "../polyglot-architecture.js";

describe("polyglot architecture", () => {
  it("maps JavaScript, Python, and Go entries, stores, and purpose", () => {
    const files = new Map<string, string>([
      ["package.json", JSON.stringify({ description: "Billing API for invoices.", dependencies: {} })],
      ["pyproject.toml", 'description = "Python worker for invoices."\n'],
      ["go.mod", "module github.com/acme/billing\n\nrequire github.com/gin-gonic/gin v1.9.0\n"],
      ["api.py", '@app.get("/invoices")\ndef list_invoices():\n    SessionLocal()\n'],
      ["main.go", 'r.GET("/health", health)\n'],
      ["requirements.txt", "flask==3.0.0\n"],
    ]);
    const graph = extractArchitecture({ files });
    const profile = buildArchitectureProfile(files, graph);
    expect(profile.purpose).toContain("Billing API");
    expect(profile.languages).toEqual(["python", "go"]);
    expect(profile.apiEntryCount).toBeGreaterThanOrEqual(2);
    expect(graph.nodes.some((node) => node.kind === GRAPH_NODE_KIND.API_ENTRY && node.label.includes("/invoices"))).toBe(true);
    expect(graph.nodes.some((node) => node.kind === GRAPH_NODE_KIND.API_ENTRY && node.label.includes("/health"))).toBe(true);
    expect(graph.nodes.some((node) => node.kind === GRAPH_NODE_KIND.DATA_STORE)).toBe(true);
    expect(graph.nodes.some((node) => node.label === "flask")).toBe(true);
    expect(graph.nodes.some((node) => node.label.includes("gin"))).toBe(true);
  });

  it("traces request input to a sink in Python and Go", () => {
    const files = new Map<string, string>([
      [
        "app.py",
        "def load_user():\n    user_id = request.args.get('id')\n    cursor.execute(f\"SELECT name FROM users WHERE id = {user_id}\")\n",
      ],
      [
        "main.go",
        "func handleSearch(w http.ResponseWriter, r *http.Request) {\n    query := r.FormValue(\"q\")\n    exec.Command(\"sh\", query)\n}\n",
      ],
    ]);
    const flows = extractCallFlows(files);
    expect(flows.flows.some((flow) => flow.path === "app.py" && flow.summary.includes("SQL"))).toBe(true);
    expect(flows.flows.some((flow) => flow.path === "main.go" && flow.summary.includes("command"))).toBe(true);
  });
});
