// Background whitening via in-browser person segmentation.
// Port of whiten_background_ai()/whiten_background_grabcut()'s compositing
// math: out = fg*alpha + white*(1-alpha), with a feathered mask edge.
//
// Two selectable backends (see state.modelQuality):
//   "fast"     -> selfie_segmenter (general, binary person mask)
//   "accurate" -> selfie_multiclass_256x256 (per-class mask; we union every
//                 non-background class — hair/skin/clothes/etc — for a
//                 cleaner edge around hair wisps than the binary model)

import { ImageSegmenter, FilesetResolver } from "@mediapipe/tasks-vision";

const WASM_BASE = `${import.meta.env.BASE_URL}mediapipe-wasm`;

let fileset = null;
let fastSegmenter = null;
let accurateSegmenter = null;

async function getFileset() {
  if (!fileset) fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  return fileset;
}

/** True once the segmentation model for `quality` is loaded and cached. */
export function isSegmenterReady(quality) {
  return quality === "accurate" ? !!accurateSegmenter : !!fastSegmenter;
}

/** Explicitly load (and cache) the model for `quality`, without segmenting yet. */
export async function loadSegmenter(quality) {
  return getSegmenter(quality);
}

async function getSegmenter(quality) {
  if (quality === "accurate") {
    if (accurateSegmenter) return accurateSegmenter;
    const vision = await getFileset();
    accurateSegmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/selfie_multiclass_256x256.tflite` },
      runningMode: "IMAGE",
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    });
    return accurateSegmenter;
  }
  if (fastSegmenter) return fastSegmenter;
  const vision = await getFileset();
  fastSegmenter = await ImageSegmenter.createFromOptions(vision, {
    baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/selfie_segmenter.tflite` },
    runningMode: "IMAGE",
    outputConfidenceMasks: true,
  });
  return fastSegmenter;
}

/**
 * Whiten the background of `canvas` (an HTMLCanvasElement holding the
 * square-cropped photo). Returns a new canvas of the same size.
 */
export async function whitenBackground(canvas, quality = "fast") {
  const segmenter = await getSegmenter(quality);
  const w = canvas.width;
  const h = canvas.height;

  const result = segmenter.segment(canvas);
  const alpha = new Float32Array(w * h);

  if (quality === "accurate") {
    // category_mask: per-pixel class index, 0 = background in this model.
    const mask = result.categoryMask.getAsUint8Array();
    for (let i = 0; i < mask.length; i++) alpha[i] = mask[i] === 0 ? 0 : 1;
  } else {
    // The general selfie_segmenter model outputs a single confidence
    // channel (foreground/person probability). Some segmentation models
    // instead output [background, foreground] as two channels — take the
    // last channel either way so this holds for both shapes.
    const masks = result.confidenceMasks;
    const conf = masks[masks.length - 1].getAsFloat32Array();
    alpha.set(conf);
  }

  const feathered = featherMask(alpha, w, h, 2);
  const composited = compositeOverWhite(canvas, feathered, w, h);

  result.close?.();
  return composited;
}

/** Small box-blur pass on the alpha mask to avoid a hard cutout edge. */
function featherMask(alpha, w, h, radius) {
  const out = new Float32Array(alpha.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          sum += alpha[yy * w + xx];
          count++;
        }
      }
      out[y * w + x] = sum / count;
    }
  }
  return out;
}

function compositeOverWhite(srcCanvas, alpha, w, h) {
  const srcCtx = srcCanvas.getContext("2d");
  const srcData = srcCtx.getImageData(0, 0, w, h);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const outCtx = out.getContext("2d");
  const outData = outCtx.createImageData(w, h);

  for (let i = 0, p = 0; i < alpha.length; i++, p += 4) {
    const a = alpha[i];
    outData.data[p] = srcData.data[p] * a + 255 * (1 - a);
    outData.data[p + 1] = srcData.data[p + 1] * a + 255 * (1 - a);
    outData.data[p + 2] = srcData.data[p + 2] * a + 255 * (1 - a);
    outData.data[p + 3] = 255;
  }
  outCtx.putImageData(outData, 0, 0);
  return out;
}
