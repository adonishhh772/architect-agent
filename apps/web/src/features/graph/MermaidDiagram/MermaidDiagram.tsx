import mermaid from "mermaid";
import { useEffect, useId, useRef, useState } from "react";
import { MaterialButton } from "../../../components/material/MaterialButton";
import { downloadDiagramPng, downloadDiagramSvg } from "../diagramExport";

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "neutral",
});

interface MermaidDiagramProps {
  chart: string;
  fallbackChart?: string;
  onSelectLabel?: (label: string) => void;
}

const MERMAID_RENDER_ERROR = "The architecture diagram could not be drawn.";
const SVG_FILENAME = "architecture-map.svg";
const PNG_FILENAME = "architecture-map.png";

export function MermaidDiagram({ chart, fallbackChart, onSelectLabel }: MermaidDiagramProps): JSX.Element {
  const reactId = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const renderChart = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const renderId = `architecture-map-${reactId}`;
        const rendered = await renderMermaidChart(renderId, chart, fallbackChart);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (caught) {
        removeMermaidHost(`architecture-map-${reactId}`);
        if (!cancelled) {
          setSvg("");
          setError(caught instanceof Error ? caught.message : MERMAID_RENDER_ERROR);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    void renderChart();
    return () => {
      cancelled = true;
    };
  }, [chart, fallbackChart, reactId]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || !onSelectLabel) {
      return undefined;
    }
    return bindNodeClicks(root, onSelectLabel);
  }, [svg, onSelectLabel]);

  if (isLoading) {
    return (
      <p className="text-sm text-[var(--md-on-surface-variant)]" data-testid="architecture-mermaid-loading">
        Drawing the architecture map…
      </p>
    );
  }

  if (error) {
    return (
      <pre className="overflow-auto rounded-xl bg-[var(--md-surface-container-high)] p-4 text-xs text-[var(--md-on-surface)]" data-testid="architecture-mermaid-source">
        {chart}
      </pre>
    );
  }

  function downloadSvg(): void {
    downloadDiagramSvg(svg, SVG_FILENAME);
  }

  function downloadPng(): void {
    downloadDiagramPng(svg, PNG_FILENAME);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <MaterialButton variant="outlined" onClick={downloadSvg} disabled={!svg}>
          Export SVG
        </MaterialButton>
        <MaterialButton variant="outlined" onClick={downloadPng} disabled={!svg}>
          Export PNG
        </MaterialButton>
      </div>
      <div
        ref={containerRef}
        className="architecture-diagram overflow-auto rounded-xl bg-[var(--md-surface-container-high)] p-4 [&_g.node]:cursor-pointer [&_svg]:h-auto [&_svg]:max-w-none"
        data-testid="architecture-mermaid"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}

async function renderMermaidChart(renderId: string, chart: string, fallbackChart: string | undefined): Promise<string> {
  try {
    const rendered = await mermaid.render(renderId, chart);
    return rendered.svg;
  } catch (caught) {
    removeMermaidHost(renderId);
    if (!fallbackChart || fallbackChart === chart) {
      throw caught;
    }
    const fallback = await mermaid.render(`${renderId}-fallback`, fallbackChart);
    return fallback.svg;
  }
}

function removeMermaidHost(renderId: string): void {
  document.getElementById(renderId)?.remove();
}

function bindNodeClicks(root: HTMLDivElement, onSelectLabel: (label: string) => void): () => void {
  const nodes = [...root.querySelectorAll("g.node")];
  const cleanups = nodes.map((node) => {
    const handleClick = (): void => {
      const label = node.textContent?.replace(/\s+/g, " ").trim();
      if (label) {
        onSelectLabel(label);
      }
    };
    node.addEventListener("click", handleClick);
    return () => node.removeEventListener("click", handleClick);
  });
  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}
