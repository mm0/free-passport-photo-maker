import { state, setState } from "./state.js";
import { wireUpload } from "./upload.js";
import { startCamera, stopCamera, toggleFacingMode, captureFrame, isCameraSupported } from "./camera.js";
import { detectFace, cropToFace, drawCrop, centerCropBox, isFaceModelReady, loadFaceModel } from "./faceCrop.js";
import { whitenBackground, isSegmenterReady, loadSegmenter } from "./bgRemoval.js";
import { buildSheet } from "./sheetLayout.js";
import { checkCompliance } from "./compliance.js";
import { downloadSheet } from "./exportPrint.js";

const $ = (id) => document.getElementById(id);

const steps = ["source", "capture", "crop", "background", "sheet", "export"];
const stepEls = {
  source: $("step-source"),
  capture: $("step-capture"),
  crop: $("step-crop"),
  background: $("step-background"),
  sheet: $("step-sheet"),
  export: $("step-export"),
};

function goTo(step) {
  setState({ step });
  for (const s of steps) stepEls[s].hidden = s !== step;
  if (step !== "capture") stopCamera();
  window.scrollTo({ top: stepEls[step].offsetTop - 16, behavior: "smooth" });
  if (step === "crop") enterCropStep();
  if (step === "background") enterBackgroundStep();
  if (step === "sheet") enterSheetStep();
  if (step === "export") enterExportStep();
}

// ---- Settings bar --------------------------------------------------------

$("quality-toggle").addEventListener("click", (e) => {
  const btn = e.target.closest(".segmented-btn");
  if (!btn) return;
  document.querySelectorAll("#quality-toggle .segmented-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  setState({ modelQuality: btn.dataset.quality });
  // Switching quality while already on a model-dependent step used to just
  // sit there with stale results (or a stale failure) until the user
  // navigated away and back — re-run detection/removal for the current
  // step immediately instead.
  if (state.step === "crop") enterCropStep();
  if (state.step === "background" && state.bgRemovalEnabled) renderBackgroundPreview();
});

$("show-boxes-toggle").addEventListener("change", (e) => {
  setState({ showDetectionBoxes: e.target.checked });
  if (state.step === "crop") drawCropCanvas();
});

// ---- Step: source ---------------------------------------------------------

$("btn-take-photo").addEventListener("click", async () => {
  if (!isCameraSupported()) {
    showError("source-error", "Camera not supported in this browser — try Upload Photo instead.");
    return;
  }
  goTo("capture");
  try {
    await startCamera($("camera-video"));
    hideError("camera-error");
  } catch (err) {
    showError("camera-error", "Couldn't access the camera. Check permissions, or use Upload Photo instead.");
  }
});

wireUpload(
  $("file-input"),
  $("drop-zone"),
  (img) => {
    hideError("source-error");
    setState({ sourceImage: img });
    goTo("crop");
  },
  (msg) => showError("source-error", msg)
);

function showError(id, msg) {
  const el = $(id);
  el.textContent = msg;
  el.hidden = false;
}
function hideError(id) {
  $(id).hidden = true;
}

// ---- Step: capture ---------------------------------------------------------

$("btn-shutter").addEventListener("click", () => {
  const frame = captureFrame($("camera-video"));
  setState({ sourceImage: frame });
  goTo("crop");
});

$("btn-switch-camera").addEventListener("click", async () => {
  try {
    await toggleFacingMode($("camera-video"));
  } catch {
    showError("camera-error", "Couldn't switch camera.");
  }
});

$("btn-cancel-camera").addEventListener("click", () => goTo("source"));

// ---- Step: crop -------------------------------------------------------

const cropCanvas = $("crop-canvas");
const cropCtx = cropCanvas.getContext("2d");
let cropPreviewScale = 1; // preview px per source px
let dragOffset = null;

async function runFaceDetection(quality, img, loadingText) {
  if (!isFaceModelReady(quality)) {
    loadingText.textContent =
      quality === "accurate"
        ? "Downloading face model (first run only, ~4MB)…"
        : "Downloading face model (first run only, ~0.5MB)…";
    await loadFaceModel(quality);
  }
  loadingText.textContent = "Detecting face…";
  return detectFace(img, quality);
}

async function enterCropStep() {
  const loadingText = $("crop-loading-text");
  $("crop-loading").hidden = false;
  $("crop-warning").hidden = true;

  const img = state.sourceImage;
  const imgW = img.naturalWidth ?? img.width;
  const imgH = img.naturalHeight ?? img.height;

  const maxPreview = 480;
  cropPreviewScale = Math.min(1, maxPreview / Math.max(imgW, imgH));
  cropCanvas.width = Math.round(imgW * cropPreviewScale);
  cropCanvas.height = Math.round(imgH * cropPreviewScale);

  let face = null;
  let usedFallback = false;
  let bothCrashed = false;
  try {
    face = await runFaceDetection(state.modelQuality, img, loadingText);
  } catch (err) {
    console.error(`Face detection (${state.modelQuality}) crashed:`, err);
  }
  // Retry with the other quality whenever the first attempt came back
  // empty — whether it cleanly found no face, or crashed. A crash isn't
  // necessarily model-specific (WebAssembly/WebGL issues have shown up on
  // both), so it's still worth trying the other one rather than assuming.
  if (!face) {
    const otherQuality = state.modelQuality === "accurate" ? "fast" : "accurate";
    loadingText.textContent = `Retrying with ${otherQuality === "accurate" ? "Accurate" : "Fast"}…`;
    try {
      face = await runFaceDetection(otherQuality, img, loadingText);
      usedFallback = !!face;
    } catch (err) {
      console.error(`Face detection (${otherQuality}) crashed:`, err);
      bothCrashed = true;
    }
  }
  loadingText.textContent = "Cropping…";
  $("crop-loading").hidden = true;
  setState({ lastFaceBox: face });

  let box, warning;
  if (face) {
    ({ box, warning } = cropToFace(face, imgW, imgH));
    if (usedFallback) {
      warning = warning
        ? `Switched detection quality to find a face. ${warning}`
        : "Switched detection quality to find a face.";
    }
  } else {
    box = centerCropBox(imgW, imgH);
    warning = bothCrashed
      ? "Face detection isn't working in this browser — using a plain center crop. This can happen with " +
        "strict privacy/fingerprinting protection (e.g. Brave Shields, or similar settings in other " +
        "browsers) interfering with WebAssembly image processing; try turning that off for this site, " +
        "or use a different browser. You can still drag the box below to crop manually."
      : "No face detected — using a plain center crop. Drag the box below to adjust manually.";
  }
  setState({ cropBox: box, cropWarning: warning });
  if (warning) {
    $("crop-warning").textContent = warning;
    $("crop-warning").hidden = false;
  }

  const slider = $("crop-size-slider");
  const minSide = Math.round(Math.min(imgW, imgH) * 0.2);
  const maxSide = Math.min(imgW, imgH);
  slider.min = minSide;
  slider.max = maxSide;
  slider.value = box.side;
  slider.oninput = () => {
    const side = Number(slider.value);
    const b = state.cropBox;
    const cx = b.x + b.side / 2;
    const cy = b.y + b.side / 2;
    setState({
      cropBox: {
        side,
        x: clamp(cx - side / 2, 0, imgW - side),
        y: clamp(cy - side / 2, 0, imgH - side),
      },
    });
    drawCropCanvas();
  };

  drawCropCanvas();
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(v, hi));
}

function drawCropCanvas() {
  const img = state.sourceImage;
  cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
  cropCtx.drawImage(img, 0, 0, cropCanvas.width, cropCanvas.height);

  if (state.showDetectionBoxes && state.lastFaceBox) {
    const f = state.lastFaceBox;
    cropCtx.strokeStyle = "#e0433a";
    cropCtx.lineWidth = 2;
    cropCtx.strokeRect(f.x * cropPreviewScale, f.y * cropPreviewScale, f.w * cropPreviewScale, f.h * cropPreviewScale);
  }

  const b = state.cropBox;
  if (b) {
    cropCtx.strokeStyle = "#2f6fed";
    cropCtx.lineWidth = 2;
    cropCtx.setLineDash([6, 4]);
    cropCtx.strokeRect(
      b.x * cropPreviewScale,
      b.y * cropPreviewScale,
      b.side * cropPreviewScale,
      b.side * cropPreviewScale
    );
    cropCtx.setLineDash([]);
  }
}

function cropPointerPos(e) {
  const rect = cropCanvas.getBoundingClientRect();
  const scaleX = cropCanvas.width / rect.width;
  const scaleY = cropCanvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

cropCanvas.addEventListener("pointerdown", (e) => {
  const b = state.cropBox;
  if (!b) return;
  const p = cropPointerPos(e);
  const bx = b.x * cropPreviewScale;
  const by = b.y * cropPreviewScale;
  const bs = b.side * cropPreviewScale;
  if (p.x >= bx && p.x <= bx + bs && p.y >= by && p.y <= by + bs) {
    dragOffset = { dx: p.x - bx, dy: p.y - by };
    cropCanvas.setPointerCapture(e.pointerId);
  }
});

cropCanvas.addEventListener("pointermove", (e) => {
  if (!dragOffset) return;
  const img = state.sourceImage;
  const imgW = img.naturalWidth ?? img.width;
  const imgH = img.naturalHeight ?? img.height;
  const p = cropPointerPos(e);
  const b = state.cropBox;
  const newX = clamp((p.x - dragOffset.dx) / cropPreviewScale, 0, imgW - b.side);
  const newY = clamp((p.y - dragOffset.dy) / cropPreviewScale, 0, imgH - b.side);
  setState({ cropBox: { ...b, x: newX, y: newY } });
  drawCropCanvas();
});

cropCanvas.addEventListener("pointerup", () => (dragOffset = null));
cropCanvas.addEventListener("pointercancel", () => (dragOffset = null));

$("btn-crop-back").addEventListener("click", () => goTo("source"));
$("btn-crop-next").addEventListener("click", async () => {
  const cropped = drawCrop(state.sourceImage, state.cropBox, 800);
  setState({ croppedCanvas: cropped, finalPhotoCanvas: cropped });
  // Recompute face against the final square crop for the compliance panel,
  // mirroring the Python CLI (which re-runs detect_face on the already-
  // cropped image inside check_compliance / build_sheet).
  try {
    const face = await detectFace(cropped, state.modelQuality);
    setState({ finalFace: face });
  } catch {
    setState({ finalFace: null });
  }
  goTo("background");
});

// ---- Step: background ---------------------------------------------------

// Tracks the in-flight renderBackgroundPreview() call, if any, so "Next"
// can wait for it instead of letting the user race past it — clicking Next
// while segmentation was still running used to silently ship the
// pre-removal (still-cropped, not-whitened) canvas to the sheet, since
// finalPhotoCanvas hadn't been updated yet by the time the sheet was built.
let bgRenderPromise = null;

async function enterBackgroundStep() {
  $("bg-toggle").checked = state.bgRemovalEnabled;
  await renderBackgroundPreview();
}

async function runBackgroundRemoval(quality, src, loadingText) {
  if (!isSegmenterReady(quality)) {
    loadingText.textContent =
      quality === "accurate"
        ? "Downloading background model (first run only, ~16MB)…"
        : "Downloading background model (first run only, ~0.3MB)…";
    await loadSegmenter(quality);
  }
  loadingText.textContent = "Removing background…";
  return whitenBackground(src, quality);
}

function renderBackgroundPreview() {
  bgRenderPromise = doRenderBackgroundPreview();
  return bgRenderPromise;
}

async function doRenderBackgroundPreview() {
  const canvas = $("bg-canvas");
  const src = state.croppedCanvas;
  canvas.width = src.width;
  canvas.height = src.height;

  if (state.bgRemovalEnabled) {
    const loadingText = $("bg-loading-text");
    hideError("bg-error");
    $("bg-loading").hidden = false;
    $("btn-bg-next").disabled = true;
    $("bg-toggle").disabled = true;
    let result;
    try {
      result = await runBackgroundRemoval(state.modelQuality, src, loadingText);
    } catch (err) {
      console.error(`Background removal (${state.modelQuality}) crashed:`, err);
    }
    // Same reasoning as face detection: a crash isn't necessarily specific
    // to whichever model was selected (WASM/WebGL issues have shown up on
    // both fast and accurate), so try the other one before giving up.
    if (!result) {
      const otherQuality = state.modelQuality === "accurate" ? "fast" : "accurate";
      loadingText.textContent = `Retrying with ${otherQuality === "accurate" ? "Accurate" : "Fast"}…`;
      try {
        result = await runBackgroundRemoval(otherQuality, src, loadingText);
        if (result) {
          showError("bg-error", `The ${state.modelQuality} background model isn't working — used ${otherQuality} instead.`);
        }
      } catch (err) {
        console.error(`Background removal (${otherQuality}) crashed too:`, err);
      }
    }

    if (result) {
      setState({ finalPhotoCanvas: result });
      canvas.getContext("2d").drawImage(result, 0, 0);
    } else {
      showError(
        "bg-error",
        "Background removal isn't working in this browser — continuing without it. This can happen with " +
          "strict privacy/fingerprinting protection (e.g. Brave Shields, or similar settings in other " +
          "browsers) interfering with WebAssembly image processing; try turning that off for this site, " +
          "or use a different browser."
      );
      setState({ finalPhotoCanvas: src, bgRemovalEnabled: false });
      $("bg-toggle").checked = false;
      canvas.getContext("2d").drawImage(src, 0, 0);
    }
    $("bg-loading").hidden = true;
    $("btn-bg-next").disabled = false;
    $("bg-toggle").disabled = false;
  } else {
    setState({ finalPhotoCanvas: src });
    canvas.getContext("2d").drawImage(src, 0, 0);
  }
}

$("bg-toggle").addEventListener("change", async (e) => {
  setState({ bgRemovalEnabled: e.target.checked });
  await renderBackgroundPreview();
});

$("btn-bg-back").addEventListener("click", () => goTo("crop"));
$("btn-bg-next").addEventListener("click", () => goTo("sheet"));

// ---- Step: sheet settings ------------------------------------------------

function enterSheetStep() {
  $("opt-dpi").value = state.sheet.dpi;
  $("opt-sheet-w").value = state.sheet.sheetWIn;
  $("opt-sheet-h").value = state.sheet.sheetHIn;
  $("opt-photo-size").value = state.sheet.photoIn;
  $("opt-margin").value = state.sheet.marginIn;
  $("opt-gap").value = state.sheet.gapIn;
  $("opt-guides").checked = state.sheet.guides;
  hideError("sheet-error");
}

$("btn-sheet-back").addEventListener("click", () => goTo("background"));
$("btn-sheet-next").addEventListener("click", () => {
  const dpi = clamp(Number($("opt-dpi").value) || 300, 72, 600);
  setState({
    sheet: {
      ...state.sheet,
      dpi,
      sheetWIn: Number($("opt-sheet-w").value) || 4,
      sheetHIn: Number($("opt-sheet-h").value) || 6,
      photoIn: Number($("opt-photo-size").value) || 2,
      marginIn: Number($("opt-margin").value) || 0,
      gapIn: Number($("opt-gap").value) || 0,
      guides: $("opt-guides").checked,
    },
  });
  goTo("export");
});

// ---- Step: export -----------------------------------------------------

function enterExportStep() {
  const { canvas, cols, rows, error, sheetWPx, sheetHPx } = buildSheet(state.finalPhotoCanvas, state.sheet);
  if (error) {
    showError("sheet-error", error);
    goTo("sheet");
    return;
  }
  setState({ sheetCanvas: canvas });

  const outEl = $("sheet-canvas");
  outEl.width = canvas.width;
  outEl.height = canvas.height;
  outEl.getContext("2d").drawImage(canvas, 0, 0);

  $("sheet-meta").textContent =
    `${cols}x${rows} = ${cols * rows} photos · ${state.sheet.sheetWIn}x${state.sheet.sheetHIn}" ` +
    `at ${state.sheet.dpi} DPI (${sheetWPx}x${sheetHPx}px)`;

  const lines = checkCompliance(state.finalFace, state.finalPhotoCanvas, state.sheet.dpi, state.sheet.photoIn);
  const list = $("compliance-list");
  list.innerHTML = "";
  for (const line of lines) {
    const li = document.createElement("li");
    li.textContent = (line.ok ? "✓ " : "⚠ ") + line.text;
    li.className = line.ok ? "ok" : "warn";
    list.appendChild(li);
  }
}

$("btn-download").addEventListener("click", () => {
  downloadSheet(state.sheetCanvas, state.sheet.sheetWIn, state.sheet.sheetHIn, state.sheet.dpi);
});
$("btn-export-back").addEventListener("click", () => goTo("sheet"));
$("btn-start-over").addEventListener("click", () => {
  setState({
    sourceImage: null,
    lastFaceBox: null,
    cropBox: null,
    cropWarning: null,
    croppedCanvas: null,
    finalFace: null,
    bgRemovalEnabled: false,
    finalPhotoCanvas: null,
    sheetCanvas: null,
  });
  $("file-input").value = "";
  $("bg-toggle").checked = false;
  goTo("source");
});

// ---- init -----------------------------------------------------------------

goTo("source");
