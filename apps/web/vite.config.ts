import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base =
  process.env.VITE_BASE_PATH ??
  (process.env.GITHUB_ACTIONS === "true" && repositoryName
    ? `/${repositoryName}/`
    : "/");

const workspacePackages = [
  "@sentinel/schema",
  "@sentinel/providers",
  "@sentinel/ingestion",
  "@sentinel/graph",
  "@sentinel/analysis",
] as const;

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  resolve: {
    preserveSymlinks: true,
  },
  optimizeDeps: {
    exclude: [...workspacePackages],
  },
  worker: {
    format: "es",
  },
  server: {
    proxy: {
      "/__sentinel/github/api": {
        target: "https://api.github.com",
        changeOrigin: true,
        secure: true,
        rewrite: (requestPath) => requestPath.replace(/^\/__sentinel\/github\/api/, ""),
      },
      "/__sentinel/github/codeload": {
        target: "https://codeload.github.com",
        changeOrigin: true,
        secure: true,
        rewrite: (requestPath) => requestPath.replace(/^\/__sentinel\/github\/codeload/, ""),
      },
      "/__sentinel/ai/deepseek": {
        target: "https://api.deepseek.com",
        changeOrigin: true,
        secure: true,
        rewrite: (requestPath) => requestPath.replace(/^\/__sentinel\/ai\/deepseek/, ""),
      },
      "/__sentinel/ai/openai": {
        target: "https://api.openai.com",
        changeOrigin: true,
        secure: true,
        rewrite: (requestPath) => requestPath.replace(/^\/__sentinel\/ai\/openai/, ""),
      },
    },
  },
  test: {
    environment: "node",
  },
});
