import { ChevronDown, ChevronRight, FileCode2, FolderClosed, FolderOpen } from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";
import {
  buildRepositoryFileTree,
  countIndexedFilesInTree,
  type RepositoryFileTreeNode,
} from "../buildRepositoryFileTree";
import type { RepositoryStore } from "@sentinel/ingestion";

interface RepositoryFileTreeProps {
  store: RepositoryStore;
  selectedPath?: string;
  onSelectPath?: (path: string) => void;
}

export function RepositoryFileTree({
  store,
  selectedPath,
  onSelectPath,
}: RepositoryFileTreeProps): JSX.Element {
  const treeRoot = useMemo(
    () => buildRepositoryFileTree(store.index.files.values()),
    [store],
  );
  const counts = useMemo(() => countIndexedFilesInTree(treeRoot), [treeRoot]);

  return (
    <div
      className="rounded-2xl border border-[var(--md-outline)]/40 bg-[var(--md-surface-container-high)]/40"
      data-testid="repository-file-tree"
    >
      <div className="border-b border-[var(--md-outline)]/30 px-4 py-3">
        <p className="text-sm font-semibold text-[var(--md-on-surface)]">Indexed repository tree</p>
        <p className="mt-1 text-xs text-[var(--md-on-surface-variant)]">
          {counts.indexed} indexed · {counts.excluded} excluded · {counts.total} paths
        </p>
      </div>
      <ul className="max-h-[420px] overflow-auto py-2" role="tree" aria-label="Repository files">
        {treeRoot.children.map((node) => (
          <FileTreeBranch
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            onSelectPath={onSelectPath}
          />
        ))}
      </ul>
    </div>
  );
}

interface FileTreeBranchProps {
  node: RepositoryFileTreeNode;
  depth: number;
  selectedPath?: string;
  onSelectPath?: (path: string) => void;
}

function FileTreeBranch({
  node,
  depth,
  selectedPath,
  onSelectPath,
}: FileTreeBranchProps): JSX.Element {
  const [expanded, setExpanded] = useState(depth < 2);

  const handleToggle = (): void => {
    if (node.isDirectory) {
      setExpanded((current) => !current);
    }
  };

  const handleSelectFile = (): void => {
    if (!node.isDirectory && onSelectPath) {
      onSelectPath(node.path);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (node.isDirectory) {
        handleToggle();
      } else {
        handleSelectFile();
      }
    }
  };

  const isSelected = selectedPath === node.path;
  const paddingLeft = 12 + depth * 16;

  return (
    <li role="treeitem" aria-expanded={node.isDirectory ? expanded : undefined}>
      <button
        type="button"
        className={`flex w-full items-center gap-1.5 py-1 pr-3 text-left text-sm transition hover:bg-[var(--md-primary-container)]/40 ${
          isSelected ? "bg-[var(--md-primary-container)]/60 text-[var(--md-on-primary-container)]" : "text-[var(--md-on-surface)]"
        }`}
        style={{ paddingLeft }}
        onClick={node.isDirectory ? handleToggle : handleSelectFile}
        onKeyDown={handleKeyDown}
        data-testid={node.isDirectory ? `tree-dir-${node.path}` : `tree-file-${node.path}`}
      >
        {node.isDirectory ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          )
        ) : (
          <span className="inline-block w-3.5 shrink-0" aria-hidden />
        )}
        {node.isDirectory ? (
          expanded ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-[var(--color-neon-orange)]" aria-hidden />
          ) : (
            <FolderClosed className="h-4 w-4 shrink-0 text-[var(--color-neon-orange)]" aria-hidden />
          )
        ) : (
          <FileCode2
            className={`h-4 w-4 shrink-0 ${node.excluded ? "opacity-40" : "text-[var(--color-neon-teal)]"}`}
            aria-hidden
          />
        )}
        <span className={`truncate ${node.excluded ? "opacity-50 line-through" : ""}`}>{node.name}</span>
        {!node.isDirectory && node.language && (
          <span className="ml-auto text-[10px] uppercase tracking-wide text-[var(--md-on-surface-variant)]">
            {node.language}
          </span>
        )}
      </button>
      {node.isDirectory && expanded && node.children.length > 0 && (
        <ul role="group">
          {node.children.map((child) => (
            <FileTreeBranch
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelectPath={onSelectPath}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
