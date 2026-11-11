export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadJsonFile(filename: string, value: unknown): void {
  downloadTextFile(filename, JSON.stringify(value, null, 2), 'application/json');
}

export function downloadCanvasPng(filename: string, canvas: HTMLCanvasElement): void {
  const anchor = document.createElement('a');
  anchor.href = canvas.toDataURL('image/png');
  anchor.download = filename;
  anchor.click();
}
