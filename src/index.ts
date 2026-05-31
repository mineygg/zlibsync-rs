/**
 * @packageDocumentation
 *
 * **@mineygg/zlibsync-rs** — Synchronous zlib inflate backed by a Rust/NAPI-RS native addon.
 *
 * @example
 * ```ts
 * import { Inflate, Z_SYNC_FLUSH } from "@mineygg/zlibsync-rs";
 *
 * const inflate = new Inflate({ chunkSize: 65536 });
 * inflate.push(compressedBuffer, Z_SYNC_FLUSH);
 *
 * if (inflate.err < 0) {
 * throw new Error(`zlib error ${inflate.err}: ${inflate.msg}`);
 * }
 * const output = inflate.result; // Buffer | string | null
 * ```
 */

import { createRequire } from "node:module";
import { arch, platform } from "node:process";

// ---------------------------------------------------------------------------
// Platform → prebuild filename resolution
// Mirrors the triple names used in Cargo / napi targets:
//   zlibsync_rs.<platform>-<arch>[-<abi>].node
// ---------------------------------------------------------------------------

/**
 * All platform–architecture–ABI triples for which a prebuilt `.node` binary is
 * distributed. The string directly maps to the filename suffix used in
 * `prebuilds/zlibsync_rs.<triple>.node`.
 *
 * @internal
 */
type SupportedPlatform =
  | "win32-x64-msvc"
  | "win32-arm64-msvc" // Added Windows ARM64 target type here
  | "linux-x64-gnu"
  | "linux-arm64-gnu"
  | "linux-x64-musl"
  | "linux-arm64-musl"
  | "linux-arm-gnueabihf"
  | "linux-arm-musleabihf"
  | "darwin-x64"
  | "darwin-arm64";

/**
 * Resolves the current Node.js process's platform and architecture to the
 * corresponding prebuilt binary triple.
 *
 * On Linux, distinguishes between glibc and musl by checking for the presence
 * of a `libc.musl-*` file under `/lib` — the same heuristic used by napi-rs
 * generated loaders.
 *
 * @throws {Error} When the current platform/architecture combination does not
 * have a prebuilt binary (e.g. FreeBSD, RISC-V).
 *
 * @internal
 */
function getPlatformTriple(): SupportedPlatform {
  const p = platform; // 'win32' | 'linux' | 'darwin' | ...
  const a = arch; // 'x64' | 'arm64' | 'arm' | ...

  if (p === "win32") {
    if (a === "x64") return "win32-x64-msvc";
    if (a === "arm64") return "win32-arm64-msvc"; // Resolved Windows ARM64 architecture here
  }

  if (p === "darwin") {
    if (a === "x64") return "darwin-x64";
    if (a === "arm64") return "darwin-arm64";
  }

  if (p === "linux") {
    // Detect musl vs glibc by checking /lib/libc.musl-* existence.
    // This is the same heuristic napi-rs uses in its own generated loaders.
    const isMusl = (() => {
      try {
        const { readdirSync } = require("node:fs") as typeof import("node:fs");
        return readdirSync("/lib").some((f: string) => f.startsWith("libc.musl-"));
      } catch {
        return false;
      }
    })();

    if (a === "x64") return isMusl ? "linux-x64-musl" : "linux-x64-gnu";
    if (a === "arm64") return isMusl ? "linux-arm64-musl" : "linux-arm64-gnu";
    if (a === "arm") return isMusl ? "linux-arm-musleabihf" : "linux-arm-gnueabihf";
  }

  throw new Error(`@mineygg/zlibsync-rs: unsupported platform/arch: ${p}/${a}`);
}

const triple = getPlatformTriple();
const _require = createRequire(import.meta.url);
const native = _require(`../prebuilds/zlibsync_rs.${triple}.node`) as typeof import("./native");

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

/**
 * Synchronous zlib inflate stream.
 *
 * Maintains internal state across multiple {@link Inflate.push | push()} calls,
 * making it suitable for streaming protocols such as the Discord gateway's
 * `zlib-stream` transport compression.
 *
 * @example Basic decompression
 * ```ts
 * const inflate = new Inflate({ chunkSize: 65536 });
 * inflate.push(chunk, Z_SYNC_FLUSH);
 * const output = inflate.result as Buffer;
 * ```
 *
 * @example Decode to a UTF-8 string
 * ```ts
 * const inflate = new Inflate({ to: "string" });
 * inflate.push(chunk, Z_FINISH);
 * console.log(inflate.result); // string
 * ```
 *
 * @example Raw deflate (no zlib header)
 * ```ts
 * const inflate = new Inflate({ windowBits: -15 });
 * inflate.push(rawDeflateBuffer, true);
 * ```
 */
export const Inflate = native.Inflate;

// ---------------------------------------------------------------------------
// Flush mode constants
// ---------------------------------------------------------------------------

/**
 * Flush mode: no flush.
 *
 * Data is buffered internally. Use for intermediate chunks when more data
 * will follow before a sync point is needed.
 *
 * @see {@link Z_SYNC_FLUSH} for the most common streaming flush.
 */
export const Z_NO_FLUSH = native.zNoFlush();

/**
 * Flush mode: partial flush.
 *
 * Flushes as much output as possible to a byte boundary. Rarely needed in
 * practice; prefer {@link Z_SYNC_FLUSH}.
 */
export const Z_PARTIAL_FLUSH = native.zPartialFlush();

/**
 * Flush mode: sync flush.
 *
 * Flushes all pending output to the consumer and aligns the output to a byte
 * boundary. The most common flush mode for framed streaming protocols such as
 * the Discord gateway.
 *
 * @example
 * ```ts
 * inflate.push(chunk, Z_SYNC_FLUSH);
 * const payload = inflate.result as Buffer;
 * ```
 */
export const Z_SYNC_FLUSH = native.zSyncFlush();

/**
 * Flush mode: full flush.
 *
 * Like {@link Z_SYNC_FLUSH} but also resets the internal compression state,
 * allowing decompression to restart from this point if earlier data is lost.
 */
export const Z_FULL_FLUSH = native.zFullFlush();

/**
 * Flush mode: finish.
 *
 * Signals that all input has been provided and the stream should be finalised.
 * Equivalent to passing `true` as the second argument to {@link Inflate.push}.
 */
export const Z_FINISH = native.zFinish();

/**
 * Flush mode: block.
 *
 * Stops decompression at the next deflate block boundary. Advanced use only.
 */
export const Z_BLOCK = native.zBlock();

/**
 * Flush mode: trees.
 *
 * Like {@link Z_BLOCK} but also returns at the start of each new deflate block
 * header. Advanced use only.
 */
export const Z_TREES = native.zTrees();

// ---------------------------------------------------------------------------
// Return code constants
// ---------------------------------------------------------------------------

/**
 * Return code: success.
 *
 * The operation completed without error. This is the expected value of
 * {@link Inflate.err} after a successful {@link Inflate.push}.
 */
export const Z_OK = native.zOk();

/**
 * Return code: end of stream.
 *
 * All compressed data has been consumed and the zlib stream trailer was
 * verified successfully.
 */
export const Z_STREAM_END = native.zStreamEnd();

/**
 * Return code: preset dictionary needed.
 *
 * The stream requires a preset dictionary that has not been provided.
 */
export const Z_NEED_DICT = native.zNeedDict();

/**
 * Return code: file/OS error.
 *
 * Maps to `errno` from the underlying C library.
 */
export const Z_ERRNO = native.zErrno();

/**
 * Return code: stream state inconsistent.
 *
 * The {@link Inflate} instance was used in an invalid way (e.g. parameters
 * were changed after the stream was initialised).
 */
export const Z_STREAM_ERROR = native.zStreamError();

/**
 * Return code: invalid or incomplete compressed data.
 *
 * The input data does not conform to the zlib/deflate format, or it was
 * truncated.
 */
export const Z_DATA_ERROR = native.zDataError();

/**
 * Return code: insufficient memory.
 *
 * The decompressor could not allocate the memory it required.
 */
export const Z_MEM_ERROR = native.zMemError();

/**
 * Return code: no progress possible.
 *
 * The output buffer was full and no input was consumed. Usually indicates
 * the output buffer needs to grow — this is handled automatically by
 * {@link Inflate}.
 */
export const Z_BUF_ERROR = native.zBufError();

/**
 * Return code: incompatible zlib version.
 *
 * The zlib library version does not match the version expected by the caller.
 */
export const Z_VERSION_ERROR = native.zVersionError();

// ---------------------------------------------------------------------------
// Compression level constants
// ---------------------------------------------------------------------------

/**
 * Compression level: no compression.
 *
 * Data is stored as-is (framing overhead only). Only relevant for deflate
 * *compression*; this library only performs decompression.
 */
export const Z_NO_COMPRESSION = native.zNoCompression();

/**
 * Compression level: fastest compression.
 *
 * Optimises for speed at the cost of compression ratio. Only relevant for
 * deflate *compression*.
 */
export const Z_BEST_SPEED = native.zBestSpeed();

/**
 * Compression level: best compression ratio.
 *
 * Optimises for output size at the cost of CPU time. Only relevant for
 * deflate *compression*.
 */
export const Z_BEST_COMPRESSION = native.zBestCompression();

/**
 * Compression level: default compression.
 *
 * A balance between speed and size, roughly equivalent to level 6. Only
 * relevant for deflate *compression*.
 */
export const Z_DEFAULT_COMPRESSION = native.zDefaultCompression();

// ---------------------------------------------------------------------------
// Compression strategy constants
// ---------------------------------------------------------------------------

/**
 * Compression strategy: filtered data.
 *
 * Tuned for data produced by a filter or predictor. Only relevant for
 * deflate *compression*.
 */
export const Z_FILTERED = native.zFiltered();

/**
 * Compression strategy: Huffman coding only.
 *
 * Disables string matching; only Huffman coding is applied. Only relevant
 * for deflate *compression*.
 */
export const Z_HUFFMAN_ONLY = native.zHuffmanOnly();

/**
 * Compression strategy: run-length encoding.
 *
 * Limits match distances to one (run-length encoding). Only relevant for
 * deflate *compression*.
 */
export const Z_RLE = native.zRle();

/**
 * Compression strategy: fixed Huffman codes.
 *
 * Uses fixed (pre-defined) Huffman codes instead of dynamic ones. Produces
 * slightly larger output but is faster for very short data. Only relevant
 * for deflate *compression*.
 */
export const Z_FIXED = native.zFixed();

/**
 * Compression strategy: default strategy.
 *
 * Suitable for normal data. Only relevant for deflate *compression*.
 */
export const Z_DEFAULT_STRATEGY = native.zDefaultStrategy();

// ---------------------------------------------------------------------------
// Data type constants
// ---------------------------------------------------------------------------

/**
 * Data type hint: binary data.
 *
 * Returned by zlib to indicate the stream contains binary (non-text) data.
 */
export const Z_BINARY = native.zBinary();

/**
 * Data type hint: text data.
 *
 * Returned by zlib to indicate the stream contains text data. Alias:
 * {@link Z_ASCII}.
 */
export const Z_TEXT = native.zText();

/**
 * Data type hint: ASCII text data.
 *
 * Alias for {@link Z_TEXT}. Kept for compatibility with older zlib headers.
 */
export const Z_ASCII = native.zAscii();

/**
 * Data type hint: unknown data type.
 *
 * zlib could not determine whether the stream contains binary or text data.
 */
export const Z_UNKNOWN = native.zUnknown();

/**
 * Compression method identifier for the deflate algorithm.
 *
 * The only compression method defined by the zlib specification (`8`).
 */
export const Z_DEFLATED = native.zDeflated();

/**
 * Null / no-op constant.
 *
 * Used as a placeholder value in several zlib APIs (e.g. no dictionary,
 * no alloc function). Value is `0`.
 */
export const Z_NULL = native.zNull();

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/**
 * The version string of the bundled zlib implementation (e.g. `"1.2.13"`).
 *
 * This reflects the zlib-compatible version that the Rust `flate2` crate
 * was compiled against, not the host system's zlib.
 */
export const ZLIB_VERSION = native.zlibVersion();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Constructor options for {@link Inflate}.
 */
export interface InflateOptions {
  /**
   * Size in bytes of each internal output buffer chunk.
   *
   * The buffer grows in increments of this size as needed during
   * decompression. A larger value reduces reallocations for large payloads
   * at the cost of higher memory usage.
   *
   * Minimum: `256`. Default: `16384` (16 KiB).
   */
  chunkSize?: number;

  /**
   * When set to `"string"`, {@link Inflate.result} returns a UTF-8 decoded
   * `string` instead of a `Buffer`.
   *
   * Useful when the decompressed payload is known to be text (e.g. JSON).
   */
  to?: "string";

  /**
   * The base-2 logarithm of the history buffer size (window size).
   *
   * Valid positive range: `8`–`15` (32 B – 32 KiB history). Pass a negative
   * value (e.g. `-15`) to decompress raw deflate streams that have no zlib
   * header or Adler-32 checksum trailer.
   *
   * Default: `15`.
   */
  windowBits?: number;
}