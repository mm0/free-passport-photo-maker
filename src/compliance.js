// Port of check_compliance() as an in-UI advisory panel — informational
// only, never a blocker, matching the CLI's --check behavior.

export function checkCompliance(face, photoCanvas, dpi, photoIn = 2.0) {
  const w = photoCanvas.width;
  const h = photoCanvas.height;
  const lines = [];

  const minPx = Math.round(photoIn * dpi);
  if (w < minPx || h < minPx) {
    lines.push({
      ok: false,
      text: `Below recommended ${photoIn}" @ ${dpi} DPI (${minPx}x${minPx}px). Result may print soft.`,
    });
  } else {
    lines.push({ ok: true, text: `Meets ${photoIn}" @ ${dpi} DPI (${minPx}x${minPx}px).` });
  }

  if (!face) {
    lines.push({ ok: false, text: "No face detected — check lighting/framing, or that the subject is front-facing." });
    return lines;
  }

  const headHeightPx = face.chinY - face.hairlineY;
  const headHeightInEst = headHeightPx / (h / photoIn);
  lines.push({
    ok: headHeightInEst >= 1.0 && headHeightInEst <= 1.375,
    text: `Estimated head height: ${headHeightInEst.toFixed(2)}" (spec: 1.0"-1.375").`,
  });

  const faceCxFrac = face.cx / w;
  lines.push({
    ok: Math.abs(faceCxFrac - 0.5) <= 0.08,
    text:
      Math.abs(faceCxFrac - 0.5) > 0.08
        ? `Face is off-center horizontally (${Math.round(faceCxFrac * 100)}% across) — consider recentering.`
        : "Face roughly centered horizontally.",
  });

  return lines;
}
