/// <reference types="node" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves a project site from https://<user>.github.io/<repo>/,
// so assets must be requested under that sub-path. `base` is overridable via
// the DPANC_BASE env var (CI sets it); it defaults to the standalone repo name.
// For local `vite dev`/`preview` we keep "/" so the app works at localhost root.
const base = process.env.DPANC_BASE ?? (process.env.NODE_ENV === "production" ? "/DP-ANC-Demo/" : "/");

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: "dist",
    // Audio assets live in public/ and are copied verbatim; keep them uncompressed.
    assetsInlineLimit: 0,
  },
});
