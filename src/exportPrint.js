// Pixel-accurate PNG export — the one reliable way to guarantee physical
// print size (browsers don't reliably honor embedded PNG DPI metadata, and
// print-dialog scaling varies by browser, so "download, then print at 100%"
// is the supported path).

/** Trigger a PNG download of `canvas`, named with its physical dimensions. */
export function downloadSheet(canvas, sheetWIn, sheetHIn, dpi) {
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `passport-photo-sheet_${sheetWIn}x${sheetHIn}in_${dpi}dpi_${canvas.width}x${canvas.height}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}
