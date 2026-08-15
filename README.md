# Passport Photo Sheet (web)

Turn a photo into a 4x6" printable sheet of 2x2" passport photos — entirely
in your browser. No backend: face detection, background removal, and sheet
layout all run client-side via [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector),
and nothing is ever uploaded anywhere.

This is the browser counterpart to the Python CLI in `../passport-photo-sheet/`
— same crop/spec math, ported to JS.

## Develop

```sh
npm install   # also vendors the MediaPipe WASM runtime into public/ (postinstall)
npm run dev
```

## Build

```sh
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds and
publishes `dist/` to GitHub Pages via the official Pages Actions. In the repo
settings, set **Settings → Pages → Source: GitHub Actions**.

The app is served from a project-site subpath (`https://mm0.github.io/free-passport-photo-maker/`);
`vite.config.js`'s `base` must match the repo name if you rename it.

## Models

Model files live in `public/models/` and are self-hosted (not fetched from a
CDN at runtime), so the whole app works offline after first load and has no
third-party runtime dependency:

| File | Used for | Quality |
|---|---|---|
| `blaze_face_short_range.tflite` | face detection | Fast (default) |
| `face_landmarker.task` | face detection | Accurate |
| `selfie_segmenter.tflite` | background removal | Fast (default) |
| `selfie_multiclass_256x256.tflite` | background removal | Accurate |

All from Google's [MediaPipe model zoo](https://ai.google.dev/edge/mediapipe/solutions/vision).
