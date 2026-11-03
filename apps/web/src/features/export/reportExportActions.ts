import { reportToMarkdown, reportToPrintableHtml, reportToSarif, sbomToCycloneDx } from "@sentinel/analysis";
import { sanitizeReportForExport, type AnalysisReport } from "@sentinel/schema";

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportReportJson(report: AnalysisReport): void {
  const sanitized = sanitizeReportForExport(report);
  downloadTextFile(
    `architecture-sentinel-${sanitized.id}.json`,
    JSON.stringify(sanitized, null, 2),
    "application/json",
  );
}

export function exportReportMarkdown(report: AnalysisReport): void {
  downloadTextFile(
    `architecture-sentinel-${report.id}.md`,
    reportToMarkdown(report),
    "text/markdown",
  );
}

export function exportReportSarif(report: AnalysisReport): void {
  downloadTextFile(
    `architecture-sentinel-${report.id}.sarif`,
    reportToSarif(report),
    "application/sarif+json",
  );
}

export function exportReportCycloneDx(report: AnalysisReport): void {
  downloadTextFile(
    `architecture-sentinel-${report.id}.cdx.json`,
    sbomToCycloneDx(report.sbom ?? [], `urn:uuid:${report.id}`),
    "application/vnd.cyclonedx+json",
  );
}

export function exportReportHtml(report: AnalysisReport): void {
  downloadTextFile(
    `architecture-sentinel-${report.id}.html`,
    reportToPrintableHtml(report),
    "text/html",
  );
}
