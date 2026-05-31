import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

// Clean up stale cargo-xwin cache from C: drive if present (Windows dev machines).
const badCachePath = "C:/Users/HP/AppData/Local/cargo-xwin";
if (existsSync(badCachePath)) {
  console.log("Cleaning up partial/corrupted cargo-xwin cache from C: drive...");
  try {
    rmSync(badCachePath, { recursive: true, force: true });
    console.log("Freed up space on C: drive.");
  } catch (err) {
    console.warn(`Could not delete C: cache path: ${err.message}`);
  }
}

const targets = [
  { triple: "x86_64-unknown-linux-gnu", cross: true },
  { triple: "aarch64-unknown-linux-gnu", cross: true },
  { triple: "x86_64-unknown-linux-musl", cross: true },
  { triple: "aarch64-unknown-linux-musl", cross: true },
  { triple: "armv7-unknown-linux-gnueabihf", cross: true },
  { triple: "armv7-unknown-linux-musleabihf", cross: true },
  { triple: "x86_64-apple-darwin", cross: true },
  { triple: "aarch64-apple-darwin", cross: true },
  { triple: "x86_64-pc-windows-msvc", cross: false, forceXwin: true },
  // Added Windows ARM64 target here
  { triple: "aarch64-pc-windows-msvc", cross: false, forceXwin: true }, 
];

console.log(`Starting cross-compilation pipeline for all ${targets.length} platforms...\n`);

for (const target of targets) {
  console.log("==================================================");
  console.log(`Building target: ${target.triple}`);
  console.log("==================================================\n");

  // Build the napi CLI argument list.
  const args = [
    "napi",
    "build",
    "--manifest-path",
    "./native/Cargo.toml",
    "--release",
    "--platform",
    "-o",
    "./prebuilds",
    "--target",
    target.triple,
  ];

  if (target.cross) args.splice(2, 0, "-x");

  const env = { ...process.env };

  if (target.forceXwin) {
    env.CARGO = "cargo-xwin";
  }

  if (!env.XWIN_CACHE_DIR) {
    env.XWIN_CACHE_DIR =
      process.platform === "win32" ? "D:/rust/.xwin-cache" : resolve(rootDir, ".xwin-cache");
  }

  const result = spawnSync("npx", args, {
    cwd: rootDir,
    stdio: "inherit",
    env,
    shell: true,
  });

  if (result.status !== 0) {
    console.error(`\n[ERROR] Failed to compile target: ${target.triple}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\n==================================================");
console.log(`All ${targets.length} targets compiled successfully!`);
console.log("==================================================\n");