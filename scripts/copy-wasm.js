// Vendors the MediaPipe Tasks Vision WASM runtime into public/ so it's
// self-hosted and same-origin (no CDN dependency, no CORS surface) when
// deployed as a static site. Runs automatically after `npm install`.
import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = path.join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const dest = path.join(root, "public", "mediapipe-wasm");

if (!existsSync(src)) {
  console.warn("[copy-wasm] node_modules/@mediapipe/tasks-vision/wasm not found — run `npm install` first.");
  process.exit(0);
}

await mkdir(dest, { recursive: true });
await cp(src, dest, { recursive: true });
console.log(`[copy-wasm] copied ${src} -> ${dest}`);
