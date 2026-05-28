import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  minify: true,
  shims: true,
  treeshake: true,
  skipNodeModulesBundle: true,
  target: "node22",
  outDir: "dist",
  // The native .node binary is loaded at runtime — do not bundle it.
  external: [/\.node$/],
});
