import { defineConfig } from "vite";

// Deployed at https://mm0.github.io/free-passport-photo-maker/ (repo name,
// not the local folder name) — every built asset path needs this subpath
// prefix or it 404s under GitHub Pages' project-site routing.
export default defineConfig({
  base: "/free-passport-photo-maker/",
  build: {
    outDir: "dist",
    assetsInlineLimit: 0, // keep model/wasm-adjacent assets as real files, not inlined
  },
});
