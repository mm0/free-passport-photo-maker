// getUserMedia webcam capture. Front/back camera toggle, capture-to-canvas.
// iOS Safari gotchas handled: user-gesture-triggered start, `ideal` (not
// `exact`) facingMode so it degrades gracefully, and the caller must set
// `playsinline` on the <video> element (done in index.html) to avoid
// forced fullscreen native playback.

let currentStream = null;
let currentFacingMode = "user";

export async function startCamera(videoEl, facingMode = currentFacingMode) {
  stopCamera();
  currentFacingMode = facingMode;
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 1280 } },
    audio: false,
  });
  currentStream = stream;
  videoEl.srcObject = stream;
  await videoEl.play();
  return stream;
}

export function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach((t) => t.stop());
    currentStream = null;
  }
}

export async function toggleFacingMode(videoEl) {
  currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
  return startCamera(videoEl, currentFacingMode);
}

/** Capture the current video frame to a same-size <canvas> and return it. */
export function captureFrame(videoEl) {
  const canvas = document.createElement("canvas");
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(videoEl, 0, 0);
  return canvas;
}

export function isCameraSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}
