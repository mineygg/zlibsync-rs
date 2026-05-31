import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prebuildsDir = path.resolve(__dirname, "../prebuilds");

if (!fs.existsSync(prebuildsDir)) {
  console.error(`Error: prebuilds directory not found at ${prebuildsDir}`);
  process.exit(1);
}

const files = fs.readdirSync(prebuildsDir).filter((file) => file.endsWith(".node"));

if (files.length === 0) {
  console.log("No compiled .node binaries found in prebuilds/ directory.");
  process.exit(0);
}

console.log("Checking compiled binaries in prebuilds/...\n");

const results = [];

const SIGNATURES = {
  zlibNg: [
    Buffer.from("zlib-ng", "utf8"),
    Buffer.from("zng_inflate", "utf8"),
  ],
  minizOxide: [
    Buffer.from("miniz_oxide", "utf8"),
  ],
};

for (const file of files) {
  const filePath = path.join(prebuildsDir, file);
  const stats = fs.statSync(filePath);
  const buffer = fs.readFileSync(filePath);

  // Check if any zlib-ng signatures are present in the binary.
  const hasZlibNg = SIGNATURES.zlibNg.some(sig => buffer.indexOf(sig) !== -1);
  // Check if miniz_oxide is present.
  const hasMinizOxide = SIGNATURES.minizOxide.some(sig => buffer.indexOf(sig) !== -1);

  let backend = "Unknown";
  
  if (hasZlibNg) {
    // If zlib-ng signatures are found, zlib-ng is the compression backend.
    // Note: on Linux/macOS, the standard library includes miniz_oxide strings
    // for backtrace DWARF symbolication, which we ignore if zlib-ng is active.
    backend = "zlib-ng";
  } else if (hasMinizOxide) {
    backend = "miniz_oxide (fallback)";
  } else {
    backend = "None detected";
  }

  results.push({
    File: file,
    Size: `${(buffer.length / 1024).toFixed(1)} KB`,
    Modified: stats.mtime.toISOString().split("T")[0],
    Backend: backend,
  });
}

console.table(results);
