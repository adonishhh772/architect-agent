import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
const AnalysisWorkspacePage = lazy(() => import("./features/workspace/AnalysisWorkspacePage").then(module => ({default: module.AnalysisWorkspacePage})));
import { HomePage } from "./features/home/HomePage";
const ProviderSettingsPage = lazy(() => import("./features/provider/ProviderSettingsPage").then(module => ({default: module.ProviderSettingsPage})));
const ImportReportPage = lazy(() => import("./features/import/ImportReportPage").then(module => ({default: module.ImportReportPage})));

export function App(): JSX.Element {
  return (
    <AppShell>
      <Suspense fallback={<p className="analyst-panel" role="status">Loading analyst tools…</p>}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/workspace" element={<AnalysisWorkspacePage />} />
        <Route path="/providers" element={<ProviderSettingsPage />} />
        <Route path="/import" element={<ImportReportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </AppShell>
  );
}
