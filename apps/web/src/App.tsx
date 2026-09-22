import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { AnalysisWorkspacePage } from "./features/workspace/AnalysisWorkspacePage";
import { HomePage } from "./features/home/HomePage";
import { ProviderSettingsPage } from "./features/provider/ProviderSettingsPage";
import { ImportReportPage } from "./features/import/ImportReportPage";

export function App(): JSX.Element {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/workspace" element={<AnalysisWorkspacePage />} />
        <Route path="/providers" element={<ProviderSettingsPage />} />
        <Route path="/import" element={<ImportReportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
