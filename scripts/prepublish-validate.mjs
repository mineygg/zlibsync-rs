import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

// JS build artifacts that must be present before publishing.
const requiredDist = ["dist/index.js", "dist/index.cjs", "dist/index.d.ts"];

// One compiled native binary per supported platform.
const requiredTargets = [
  "win32-x64-msvc",
  "win32-arm64-msvc", // Added Windows ARM64 target here
  "linux-x64-gnu",
  "linux-arm64-gnu",
  "darwin-x64",
  "darwin-arm64",
  "linux-x64-musl",
  "linux-arm64-musl",
  "linux-arm-gnueabihf",
  "linux-arm-musleabihf",
];

const errors = [];

for (const rel of requiredDist) {
  const full = join(root, rel);
  if (!existsSync(full)) {
    errors.push(`Missing required build artifact: ${rel}`);
  }
}

for (const triple of requiredTargets) {
  const rel = `prebuilds/zlibsync_rs.${triple}.node`;
  const full = join(root, rel);
  if (!existsSync(full)) {
    errors.push(`Missing required native binary: ${rel}`);
    continue;
  }
  const size = statSync(full).size;
  if (size <= 0) {
    errors.push(`Native binary is empty: ${rel}`);
  }
}

if (errors.length > 0) {
  console.error("Prepublish validation failed:\n");
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log("Prepublish validation passed.");