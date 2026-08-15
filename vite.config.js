import { defineConfig } from "vite";

// Project is served from https://<user>.github.io/passport-photo-web/
// so all built asset paths need that subpath prefix.
export default defineConfig({
  base: "/passport-photo-web/",
  build: {
    outDir: "dist",
    assetsInlineLimit: 0, // keep model/wasm-adjacent assets as real files, not inlined
  },
});
