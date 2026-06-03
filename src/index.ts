/**
 * @packageDocumentation
 *
 * **@mineygg/zlibsync-rs** — Synchronous zlib inflate/deflate backed by a Rust/NAPI-RS native addon.
 *
 * @example Inflate
 * ```ts
 * import { Inflate, Z_SYNC_FLUSH } from "@mineygg/zlibsync-rs";
 *
 * const inflate = new Inflate({ chunkSize: 65536 });
 * inflate.push(compressedBuffer, Z_SYNC_FLUSH);
 *
 * if (inflate.err < 0) {
 *   throw new Error(`zlib error ${inflate.err}: ${inflate.msg}`);
 * }
 * const output = inflate.takeResult(); // Buffer | string | null
 * ```
 *
 * @example Deflate
 * ```ts
 * import { Deflate, Z_SYNC_FLUSH } from "@mineygg/zlibsync-rs";
 *
 * const deflate = new Deflate({ level: 6 });
 * deflate.push(rawBuffer, Z_SYNC_FLUSH);
 *
 * if (deflate.err < 0) {
 *   throw new Error(`zlib error ${deflate.err}: ${deflate.msg}`);
 * }
 * const compressed = deflate.takeResult(); // Buffer | null
 * ```
 */

import { createRequire } from "node:module";
import { arch, platform } from "node:process";

// ---------------------------------------------------------------------------
// Platform → prebuild filename resolution
// ---------------------------------------------------------------------------

type SupportedPlatform =
  | "win32-x64-msvc"
  | "win32-arm64-msvc"
  | "linux-x64-gnu"
  | "linux-arm64-gnu"
  | "linux-x64-musl"
  | "linux-arm64-musl"
  | "linux-arm-gnueabihf"
  | "linux-arm-musleabihf"
  | "darwin-x64"
  | "darwin-arm64";

function getPlatformTriple(): SupportedPlatform {
  const p = platform;
  const a = arch;

  if (p === "win32") {
    if (a === "x64") return "win32-x64-msvc";
    if (a === "arm64") return "win32-arm64-msvc";
  }

  if (p === "darwin") {
    if (a === "x64") return "darwin-x64";
    if (a === "arm64") return "darwin-arm64";
  }

  if (p === "linux") {
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
// Stream classes
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
 * console.log(inflate.takeResult()); // string
 * ```
 *
 * @example Raw deflate (no zlib header)
 * ```ts
 * const inflate = new Inflate({ windowBits: -15 });
 * inflate.push(rawDeflateBuffer, true);
 * ```
 */
export const Inflate = native.Inflate;

/**
 * Synchronous zlib deflate stream.
 *
 * Mirrors the {@link Inflate} API: construct once, call `push()` with
 * successive chunks, read `result` after each flush point.
 *
 * @example Basic compression
 * ```ts
 * const deflate = new Deflate({ level: Z_BEST_SPEED });
 * deflate.push(rawBuffer, Z_SYNC_FLUSH);
 * const compressed = deflate.result as Buffer;
 * ```
 *
 * @example Finish a stream
 * ```ts
 * const deflate = new Deflate();
 * deflate.push(chunk1, Z_NO_FLUSH);
 * deflate.push(chunk2, Z_FINISH);
 * const compressed = deflate.result as Buffer;
 * ```
 *
 * @example Raw deflate (no zlib header)
 * ```ts
 * const deflate = new Deflate({ windowBits: -15 });
 * deflate.push(data, true);
 * const raw = deflate.takeResult() as Buffer;
 * ```
 */
export const Deflate = native.Deflate;

// ---------------------------------------------------------------------------
// Flush mode constants
// ---------------------------------------------------------------------------

/**
 * Flush mode: no flush.
 *
 * Data is buffered internally. Use for intermediate chunks when more data
 * will follow before a sync point is needed.
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
 */
export const Z_SYNC_FLUSH = native.zSyncFlush();

/**
 * Flush mode: full flush.
 *
 * Like {@link Z_SYNC_FLUSH} but also resets the internal compression
 * dictionary, allowing decompression (or re-synchronisation) to restart from
 * this point if earlier data is lost. Only meaningful for {@link Deflate}.
 */
export const Z_FULL_FLUSH = native.zFullFlush();

/**
 * Flush mode: finish.
 *
 * Signals that all input has been provided and the stream should be
 * finalised. Equivalent to passing `true` as the second argument to `push()`.
 */
export const Z_FINISH = native.zFinish();

/**
 * Flush mode: block.
 *
 * Stops at the next deflate block boundary. Advanced use only.
 */
export const Z_BLOCK = native.zBlock();

/**
 * Flush mode: trees.
 *
 * Like {@link Z_BLOCK} but also returns at the start of each new deflate
 * block header. Advanced use only.
 */
export const Z_TREES = native.zTrees();

// ---------------------------------------------------------------------------
// Return code constants
// ---------------------------------------------------------------------------

/** Return code: success. */
export const Z_OK = native.zOk();

/** Return code: end of stream. */
export const Z_STREAM_END = native.zStreamEnd();

/** Return code: preset dictionary needed. */
export const Z_NEED_DICT = native.zNeedDict();

/** Return code: file/OS error. */
export const Z_ERRNO = native.zErrno();

/** Return code: stream state inconsistent. */
export const Z_STREAM_ERROR = native.zStreamError();

/** Return code: invalid or incomplete compressed data. */
export const Z_DATA_ERROR = native.zDataError();

/** Return code: insufficient memory. */
export const Z_MEM_ERROR = native.zMemError();

/** Return code: no progress possible. */
export const Z_BUF_ERROR = native.zBufError();

/** Return code: incompatible zlib version. */
export const Z_VERSION_ERROR = native.zVersionError();

// ---------------------------------------------------------------------------
// Compression level constants
// ---------------------------------------------------------------------------

/** Compression level: no compression (store only). */
export const Z_NO_COMPRESSION = native.zNoCompression();

/** Compression level: fastest compression. */
export const Z_BEST_SPEED = native.zBestSpeed();

/** Compression level: best compression ratio. */
export const Z_BEST_COMPRESSION = native.zBestCompression();

/** Compression level: default compression (roughly level 6). */
export const Z_DEFAULT_COMPRESSION = native.zDefaultCompression();

// ---------------------------------------------------------------------------
// Compression strategy constants
// ---------------------------------------------------------------------------

/** Compression strategy: filtered data. */
export const Z_FILTERED = native.zFiltered();

/** Compression strategy: Huffman coding only. */
export const Z_HUFFMAN_ONLY = native.zHuffmanOnly();

/** Compression strategy: run-length encoding. */
export const Z_RLE = native.zRle();

/** Compression strategy: fixed Huffman codes. */
export const Z_FIXED = native.zFixed();

/** Compression strategy: default strategy. */
export const Z_DEFAULT_STRATEGY = native.zDefaultStrategy();

// ---------------------------------------------------------------------------
// Data type constants
// ---------------------------------------------------------------------------

/** Data type hint: binary data. */
export const Z_BINARY = native.zBinary();

/** Data type hint: text data. */
export const Z_TEXT = native.zText();

/** Data type hint: ASCII text data. Alias for {@link Z_TEXT}. */
export const Z_ASCII = native.zAscii();

/** Data type hint: unknown data type. */
export const Z_UNKNOWN = native.zUnknown();

/** Compression method identifier for the deflate algorithm (`8`). */
export const Z_DEFLATED = native.zDeflated();

/** Null / no-op constant. */
export const Z_NULL = native.zNull();

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/**
 * The version string of the bundled zlib implementation (e.g. `"1.2.13"`).
 */
export const ZLIB_VERSION = native.zlibVersion();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Constructor options for {@link Inflate}. */
export interface InflateOptions {
  /**
   * Size in bytes of each internal output buffer chunk.
   * Minimum: `256`. Default: `16384` (16 KiB).
   */
  chunkSize?: number;

  /**
   * When set to `"string"`, `.result` returns a UTF-8 decoded `string`
   * instead of a `Buffer`.
   */
  to?: "string";

  /**
   * The base-2 logarithm of the history buffer size (window size).
   * Pass a negative value (e.g. `-15`) to decompress raw deflate streams.
   * Default: `15`.
   */
  windowBits?: number;
}

/** Constructor options for {@link Deflate}. */
export interface DeflateOptions {
  /**
   * Size in bytes of each internal output buffer chunk.
   * Minimum: `256`. Default: `16384` (16 KiB).
   */
  chunkSize?: number;

  /**
   * When set to `"string"`, `.result` returns a UTF-8 string instead of a
   * `Buffer`. Not recommended for compressed output, which is binary.
   */
  to?: "string";

  /**
   * Compression level. `-1` (default) selects the library default (≈ level
   * 6). `0` stores data uncompressed. `1`–`9` trade speed for ratio.
   */
  level?: number;

  /**
   * The base-2 logarithm of the history buffer size (window size).
   * Pass a negative value (e.g. `-15`) to produce raw deflate output with no
   * zlib header or Adler-32 trailer.
   * Default: `15`.
   */
  windowBits?: number;
}