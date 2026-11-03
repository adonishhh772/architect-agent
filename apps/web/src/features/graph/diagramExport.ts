const SVG_MIME = "image/svg+xml";
const PNG_MIME = "image/png";

export function downloadDiagramSvg(svg: string, filename: string): void {
  downloadBlob(new Blob([svg], { type: SVG_MIME }), filename);
}

export function downloadDiagramPng(svg: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([svg], { type: SVG_MIME }));
  const image = new Image();
  image.onload = () => {
    paintDiagram(image, filename);
    URL.revokeObjectURL(url);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
  };
  image.src = url;
}

function paintDiagram(image: HTMLImageElement, filename: string): void {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || 1200;
  canvas.height = image.naturalHeight || 800;
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.fillStyle = "#0a0a1a";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  canvas.toBlob((png) => {
    if (png) {
      downloadBlob(png, filename);
    }
  }, PNG_MIME);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
