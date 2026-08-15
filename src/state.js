// Single, plain state object + tiny pub/sub. No framework needed for a page
// this size — every UI section subscribes and re-renders itself on change.

const listeners = new Set();

export const state = {
  step: "source", // source | capture | crop | background | sheet | export
  modelQuality: "fast", // "fast" | "accurate"
  showDetectionBoxes: false,

  sourceImage: null, // HTMLImageElement | HTMLCanvasElement of the raw source
  lastFaceBox: null, // {x,y,w,h} in source-image pixel coords, or null

  cropBox: null, // {x,y,side} in source-image pixel coords (always square)
  cropWarning: null,

  croppedCanvas: null, // canvas holding the square-cropped photo (pre-bg-removal)

  bgRemovalEnabled: false,
  finalPhotoCanvas: null, // croppedCanvas, or with background whitened

  sheet: {
    dpi: 300,
    photoIn: 2.0,
    sheetWIn: 4.0,
    sheetHIn: 6.0,
    cols: null, // null = auto
    rows: null,
    marginIn: 0.0,
    gapIn: 0.0,
    guides: true,
  },

  sheetCanvas: null,
};

export function setState(patch) {
  Object.assign(state, patch);
  for (const fn of listeners) fn(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
