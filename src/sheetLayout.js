// Port of build_sheet()'s grid/DPI/margin/gap math from passport_photo_sheet.py.

/**
 * @param {HTMLCanvasElement} photoCanvas - square source photo (any size)
 * @param {object} opts - { dpi, photoIn, sheetWIn, sheetHIn, cols, rows, marginIn, gapIn, guides }
 * @returns {{ canvas: HTMLCanvasElement, cols: number, rows: number, error: string|null }}
 */
export function buildSheet(photoCanvas, opts) {
  const { dpi, photoIn, sheetWIn, sheetHIn, marginIn, gapIn, guides } = opts;

  const photoPx = Math.round(photoIn * dpi);
  const sheetWPx = Math.round(sheetWIn * dpi);
  const sheetHPx = Math.round(sheetHIn * dpi);
  const marginPx = Math.round(marginIn * dpi);
  const gapPx = Math.round(gapIn * dpi);

  const usableW = sheetWPx - 2 * marginPx;
  const usableH = sheetHPx - 2 * marginPx;
  const maxCols = Math.max(1, Math.floor((usableW + gapPx) / (photoPx + gapPx)));
  const maxRows = Math.max(1, Math.floor((usableH + gapPx) / (photoPx + gapPx)));
  const cols = opts.cols || maxCols;
  const rows = opts.rows || maxRows;

  const totalNeededW = cols * photoPx + (cols - 1) * gapPx;
  const totalNeededH = rows * photoPx + (rows - 1) * gapPx;
  if (totalNeededW > sheetWPx || totalNeededH > sheetHPx) {
    return {
      canvas: null,
      cols,
      rows,
      error: `${cols}x${rows} grid of ${photoIn}" photos doesn't fit on a ${sheetWIn}x${sheetHIn}" sheet at ${dpi} DPI.`,
    };
  }

  const offsetX = Math.floor((sheetWPx - totalNeededW) / 2);
  const offsetY = Math.floor((sheetHPx - totalNeededH) / 2);

  const sheet = document.createElement("canvas");
  sheet.width = sheetWPx;
  sheet.height = sheetHPx;
  const ctx = sheet.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, sheetWPx, sheetHPx);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = offsetX + c * (photoPx + gapPx);
      const y = offsetY + r * (photoPx + gapPx);
      ctx.drawImage(photoCanvas, x, y, photoPx, photoPx);
      if (guides) {
        ctx.strokeStyle = "rgb(160,160,160)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, photoPx - 1, photoPx - 1);
      }
    }
  }

  return { canvas: sheet, cols, rows, error: null, sheetWPx, sheetHPx, dpi };
}
