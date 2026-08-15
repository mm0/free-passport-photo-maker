// Download (primary, pixel-accurate) + browser-print (secondary,
// best-effort) export paths.

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

/**
 * Best-effort in-browser print: opens the print dialog with only the sheet
 * image, sized via @page CSS. Chrome/Edge honor custom @page sizes well;
 * Firefox/Safari are less reliable — the UI should tell users the download
 * path is the guaranteed-sizing option.
 */
export function printSheet(canvas, sheetWIn, sheetHIn) {
  const dataUrl = canvas.toDataURL("image/png");
  const win = window.open("", "_blank");
  if (!win) {
    alert("Please allow pop-ups to print, or use the Download button and print the file directly.");
    return;
  }
  win.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Print passport photo sheet</title>
        <style>
          @page { size: ${sheetWIn}in ${sheetHIn}in; margin: 0; }
          html, body { margin: 0; padding: 0; }
          img { width: ${sheetWIn}in; height: ${sheetHIn}in; display: block; }
        </style>
      </head>
      <body>
        <img src="${dataUrl}" onload="window.focus(); window.print();" />
      </body>
    </html>
  `);
  win.document.close();
}
