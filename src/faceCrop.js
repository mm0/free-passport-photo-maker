// Face detection + passport-proportion crop math.
// Port of detect_face()/auto_crop_to_face() from passport_photo_sheet.py.
//
// Two selectable backends (see state.modelQuality):
//   "fast"     -> FaceDetector (BlazeFace short-range). Gives a bounding box,
//                 same shape as the Python Haar-cascade box, so we reuse the
//                 exact same multiplier heuristics (-0.35h / +0.20h / +0.42h).
//   "accurate" -> FaceLandmarker (full face mesh). Gives real landmarks, so
//                 hairline/chin/eye-line are derived from actual geometry
//                 instead of guessed multipliers on a box.

import { FaceDetector, FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const WASM_BASE = `${import.meta.env.BASE_URL}mediapipe-wasm`;

let fileset = null;
let faceDetector = null;
let faceLandmarker = null;

async function getFileset() {
  if (!fileset) fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  return fileset;
}

async function getFaceDetector() {
  if (faceDetector) return faceDetector;
  const vision = await getFileset();
  faceDetector = await FaceDetector.createFromOptions(vision, {
    baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/blaze_face_short_range.tflite` },
    runningMode: "IMAGE",
  });
  return faceDetector;
}

async function getFaceLandmarker() {
  if (faceLandmarker) return faceLandmarker;
  const vision = await getFileset();
  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/face_landmarker.task` },
    runningMode: "IMAGE",
    numFaces: 1,
  });
  return faceLandmarker;
}

/**
 * Detect the largest/most confident face.
 * Returns { x, y, w, h, eyeY, hairlineY, chinY } in source-image pixel
 * coords, or null if no face found. eyeY/hairlineY/chinY are only precise
 * (landmark-derived) in "accurate" mode; in "fast" mode they're filled in
 * by the same box-multiplier heuristics the Python version uses, applied
 * later in cropToFace() so both backends share one code path there.
 */
export async function detectFace(imgOrCanvas, quality = "fast") {
  if (quality === "accurate") {
    const landmarker = await getFaceLandmarker();
    const result = landmarker.detect(imgOrCanvas);
    const lm = result.faceLandmarks?.[0];
    if (!lm) return null;

    const w = imgOrCanvas.naturalWidth ?? imgOrCanvas.width;
    const h = imgOrCanvas.naturalHeight ?? imgOrCanvas.height;
    const px = (p) => ({ x: p.x * w, y: p.y * h });

    // Landmark indices: 10 = forehead/hairline-ish top, 152 = chin,
    // 33/263 = outer eye corners, 234/454 = left/right face edge (cheeks).
    const top = px(lm[10]);
    const chin = px(lm[152]);
    const leftEye = px(lm[33]);
    const rightEye = px(lm[263]);
    const leftEdge = px(lm[234]);
    const rightEdge = px(lm[454]);

    const xs = lm.map((p) => p.x * w);
    const ys = lm.map((p) => p.y * h);
    const boxX = Math.min(...xs);
    const boxY = Math.min(...ys);
    const boxW = Math.max(...xs) - boxX;
    const boxH = Math.max(...ys) - boxY;

    return {
      x: boxX,
      y: boxY,
      w: boxW,
      h: boxH,
      // Landmark 10 sits at the hairline-adjacent top of forehead already,
      // but real hair extends a bit further up — small heuristic margin,
      // much smaller than the box-multiplier version needs since this is
      // anchored to real geometry, not extrapolated from eyebrow height.
      hairlineY: top.y - 0.12 * boxH,
      chinY: chin.y,
      eyeY: (leftEye.y + rightEye.y) / 2,
      cx: (leftEdge.x + rightEdge.x) / 2,
    };
  }

  const detector = await getFaceDetector();
  const result = detector.detect(imgOrCanvas);
  const dets = result.detections;
  if (!dets || dets.length === 0) return null;

  // Largest box wins, same tie-break as the Python version.
  dets.sort((a, b) => b.boundingBox.width * b.boundingBox.height - a.boundingBox.width * a.boundingBox.height);
  const box = dets[0].boundingBox;
  const { originX: x, originY: y, width: w, height: h } = box;

  return {
    x,
    y,
    w,
    h,
    hairlineY: y - 0.35 * h,
    chinY: y + h + 0.2 * h,
    eyeY: y + 0.42 * h,
    cx: x + w / 2,
  };
}

/**
 * Crop to a square framed per passport-photo proportions: head (hairline-to-
 * chin) fills `headHeightIn` of the photo, eyes sit `eyeLineIn` up from the
 * bottom edge. Direct port of auto_crop_to_face()'s clamp-and-warn logic.
 *
 * Returns { box: {x,y,side}, warning: string|null, face }.
 */
export function cropToFace(face, imgW, imgH, photoIn = 2.0, headHeightIn = 1.2, eyeLineIn = 1.2) {
  const headHeightPx = face.chinY - face.hairlineY;
  const targetHeadFrac = headHeightIn / photoIn;
  let cropSide = headHeightPx / targetHeadFrac;

  let warning = null;
  const maxSide = Math.min(imgW, imgH);
  if (cropSide > maxSide) {
    cropSide = maxSide;
    const actualHeadFrac = headHeightPx / cropSide;
    const specMaxFrac = 1.375 / photoIn;
    if (actualHeadFrac > specMaxFrac) {
      warning =
        "Not enough surrounding image to frame the head at the target size with headroom/shoulder " +
        `margin — the source photo is already tightly cropped on the face (${imgW}x${imgH}px). ` +
        "Result may look over-zoomed with the head too large in frame. Retake with the camera " +
        "farther back for a better result.";
    }
  }

  const targetEyeFracFromTop = 1 - eyeLineIn / photoIn;
  let cropTop = face.eyeY - targetEyeFracFromTop * cropSide;
  let cropLeft = face.cx - cropSide / 2;

  cropLeft = Math.max(0, Math.min(cropLeft, imgW - cropSide));
  cropTop = Math.max(0, Math.min(cropTop, imgH - cropSide));

  return {
    box: { x: Math.round(cropLeft), y: Math.round(cropTop), side: Math.round(cropSide) },
    warning,
  };
}

/** Draw imgOrCanvas cropped to `box` onto a new canvas sized `outSize`x`outSize`. */
export function drawCrop(imgOrCanvas, box, outSize) {
  const out = document.createElement("canvas");
  out.width = outSize;
  out.height = outSize;
  const ctx = out.getContext("2d");
  ctx.drawImage(imgOrCanvas, box.x, box.y, box.side, box.side, 0, 0, outSize, outSize);
  return out;
}

/** Plain center-crop to square, no face detection — fallback path. */
export function centerCropBox(imgW, imgH) {
  const side = Math.min(imgW, imgH);
  return { x: Math.round((imgW - side) / 2), y: Math.round((imgH - side) / 2), side: Math.round(side) };
}
