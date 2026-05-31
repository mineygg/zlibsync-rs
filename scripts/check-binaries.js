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
  zlibRs: Buffer.from("zlib-rs", "utf8"),
  minizOxide: Buffer.from("miniz_oxide", "utf8"),
};

for (const file of files) {
  const filePath = path.join(prebuildsDir, file);
  const stats = fs.statSync(filePath);
  const buffer = fs.readFileSync(filePath);

  const hasZlibRs = buffer.indexOf(SIGNATURES.zlibRs) !== -1;
  const hasMinizOxide = buffer.indexOf(SIGNATURES.minizOxide) !== -1;

  let backend = "Unknown";

  if (hasZlibRs) {
    backend = "zlib-rs";
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
