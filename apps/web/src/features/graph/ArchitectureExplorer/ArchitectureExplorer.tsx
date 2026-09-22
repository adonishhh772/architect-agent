import type { AnalysisReport } from "@sentinel/schema";
import { GRAPH_NODE_KIND } from "@sentinel/schema";
import { ChevronLeft, ChevronRight, Layers, ListTree } from "lucide-react";
import { useMemo, useState, type ChangeEvent } from "react";
import { MaterialButton } from "../../../components/material/MaterialButton";
import { ArchitectureMap } from "../ArchitectureMap";
import {
  ARCHITECTURE_VIEW_MODE,
  buildArchitectureDisplayGraph,
  countFindingsByFolderPrefix,
  listArchitectureFolders,
  MODULES_PER_PAGE,
  type ArchitectureViewMode,
} from "../architectureViewModel";

interface ArchitectureExplorerProps {
  graph: AnalysisReport["graph"];
  findings: AnalysisReport["findings"];
  selectedNodeId?: string;
  onSelectNode: (nodeId: string) => void;
  showDataFlows: boolean;
  showTrustBoundaries: boolean;
}

function handleViewModeOverview(setViewMode: (mode: ArchitectureViewMode) => void): void {
  setViewMode(ARCHITECTURE_VIEW_MODE.FOLDER_OVERVIEW);
}

export function ArchitectureExplorer({
  graph,
  findings,
  selectedNodeId,
  onSelectNode,
  showDataFlows,
  showTrustBoundaries,
}: ArchitectureExplorerProps): JSX.Element {
  const [viewMode, setViewMode] = useState<ArchitectureViewMode>(
    ARCHITECTURE_VIEW_MODE.FOLDER_OVERVIEW,
  );
  const [folderPrefix, setFolderPrefix] = useState("");
  const [pageIndex, setPageIndex] = useState(0);

  const folders = useMemo(() => listArchitectureFolders(graph), [graph]);
  const findingCounts = useMemo(() => countFindingsByFolderPrefix(findings), [findings]);

  const display = useMemo(
    () =>
      buildArchitectureDisplayGraph({
        graph,
        viewMode,
        folderPrefix,
        pageIndex,
      }),
    [graph, viewMode, folderPrefix, pageIndex],
  );

  const handleFolderChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    setFolderPrefix(event.target.value);
    setPageIndex(0);
    setViewMode(ARCHITECTURE_VIEW_MODE.FOLDER_DETAIL);
  };

  const handlePreviousPage = (): void => {
    setPageIndex((current) => Math.max(0, current - 1));
  };

  const handleNextPage = (): void => {
    setPageIndex((current) => Math.min(display.pageCount - 1, current + 1));
  };

  const handleDetailMode = (): void => {
    setViewMode(ARCHITECTURE_VIEW_MODE.FOLDER_DETAIL);
    if (!folderPrefix && folders.length > 0) {
      setFolderPrefix(folders[0] ?? "");
    }
  };

  return (
    <div data-testid="architecture-explorer">
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="flex gap-2">
          <MaterialButton
            variant={viewMode === ARCHITECTURE_VIEW_MODE.FOLDER_OVERVIEW ? "filled" : "outlined"}
            icon={<Layers className="h-4 w-4" aria-hidden />}
            onClick={() => handleViewModeOverview(setViewMode)}
            data-testid="architecture-view-overview"
          >
            Folder overview
          </MaterialButton>
          <MaterialButton
            variant={viewMode === ARCHITECTURE_VIEW_MODE.FOLDER_DETAIL ? "filled" : "outlined"}
            icon={<ListTree className="h-4 w-4" aria-hidden />}
            onClick={handleDetailMode}
            data-testid="architecture-view-detail"
          >
            Page by page
          </MaterialButton>
        </div>

        {viewMode === ARCHITECTURE_VIEW_MODE.FOLDER_DETAIL && (
          <label className="flex min-w-[240px] flex-col gap-1 text-sm text-[var(--md-on-surface)]">
            Folder scope
            <select
              className="glass-input rounded-lg border border-[var(--md-outline)]/40 bg-[var(--md-surface-container-high)] px-3 py-2"
              value={folderPrefix}
              onChange={handleFolderChange}
              data-testid="architecture-folder-select"
            >
              <option value="">All modules (paginated)</option>
              {folders.map((folder) => {
                const count = findingCounts.get(folder) ?? 0;
                return (
                  <option key={folder} value={folder}>
                    {folder}
                    {count > 0 ? ` — ${count} finding ref(s)` : ""}
                  </option>
                );
              })}
            </select>
          </label>
        )}

        {viewMode === ARCHITECTURE_VIEW_MODE.FOLDER_DETAIL && (
          <div className="flex items-center gap-2 text-sm text-[var(--md-on-surface-variant)]">
            <MaterialButton
              variant="text"
              icon={<ChevronLeft className="h-4 w-4" aria-hidden />}
              onClick={handlePreviousPage}
              disabled={pageIndex <= 0}
              data-testid="architecture-page-prev"
            >
              Prev
            </MaterialButton>
            <span data-testid="architecture-page-indicator">
              Page {display.pageIndex + 1} / {display.pageCount} · {display.totalModules} modules · up
              to {MODULES_PER_PAGE} per page
            </span>
            <MaterialButton
              variant="text"
              icon={<ChevronRight className="h-4 w-4" aria-hidden />}
              onClick={handleNextPage}
              disabled={pageIndex >= display.pageCount - 1}
              data-testid="architecture-page-next"
            >
              Next
            </MaterialButton>
          </div>
        )}
      </div>

      {viewMode === ARCHITECTURE_VIEW_MODE.FOLDER_OVERVIEW && (
        <p className="mb-3 text-sm text-[var(--md-on-surface-variant)]">
          {display.displayGraph.nodes.filter((node) => node.kind === GRAPH_NODE_KIND.SERVICE).length}{" "}
          folders,{" "}
          {display.displayGraph.edges.filter((edge) => edge.label?.includes("imports")).length}{" "}
          cross-folder import links. Select <strong>Page by page</strong> to inspect modules and
          import edges in small batches.
        </p>
      )}

      <ArchitectureMap
        graph={display.displayGraph}
        selectedNodeId={selectedNodeId}
        onSelectNode={onSelectNode}
        showDataFlows={showDataFlows}
        showTrustBoundaries={showTrustBoundaries}
        layoutKey={`${viewMode}-${folderPrefix}-${pageIndex}-${display.displayGraph.nodes.length}`}
      />
    </div>
  );
}
