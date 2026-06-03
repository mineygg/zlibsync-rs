// ---------------------------------------------------------------------------
// zlib constants (matching zlib.h values exactly)
// ---------------------------------------------------------------------------

pub const Z_NO_FLUSH: i32 = 0;
pub const Z_PARTIAL_FLUSH: i32 = 1;
pub const Z_SYNC_FLUSH: i32 = 2;
pub const Z_FULL_FLUSH: i32 = 3;
pub const Z_FINISH: i32 = 4;
pub const Z_BLOCK: i32 = 5;
pub const Z_TREES: i32 = 6;

pub const Z_OK: i32 = 0;
pub const Z_STREAM_END: i32 = 1;
pub const Z_NEED_DICT: i32 = 2;
pub const Z_ERRNO: i32 = -1;
pub const Z_STREAM_ERROR: i32 = -2;
pub const Z_DATA_ERROR: i32 = -3;
pub const Z_MEM_ERROR: i32 = -4;
pub const Z_BUF_ERROR: i32 = -5;
pub const Z_VERSION_ERROR: i32 = -6;

pub const Z_NO_COMPRESSION: i32 = 0;
pub const Z_BEST_SPEED: i32 = 1;
pub const Z_BEST_COMPRESSION: i32 = 9;
pub const Z_DEFAULT_COMPRESSION: i32 = -1;

pub const Z_FILTERED: i32 = 1;
pub const Z_HUFFMAN_ONLY: i32 = 2;
pub const Z_RLE: i32 = 3;
pub const Z_FIXED: i32 = 4;
pub const Z_DEFAULT_STRATEGY: i32 = 0;

pub const Z_BINARY: i32 = 0;
pub const Z_TEXT: i32 = 1;
pub const Z_ASCII: i32 = 1;
pub const Z_UNKNOWN: i32 = 2;
pub const Z_DEFLATED: i32 = 8;
pub const Z_NULL: i32 = 0;

pub const ZLIB_VERSION: &str = "1.2.13";

pub const DEFAULT_CHUNK_SIZE: u32 = 16 * 1024;
pub const MIN_CHUNK_SIZE: u32 = 256;
pub const DEFAULT_WINDOW_BITS: i32 = 15;

/// How many consecutive no-progress iterations before we give up.
pub const MAX_STALLS: u32 = 16;

/// Buffer shrink: only shrink if the buffer is at least this many chunks
/// above the baseline chunk size.
pub const SHRINK_HYSTERESIS_CHUNKS: usize = 2;

/// Hard ceiling on output buffer allocation.  A well-formed stream should never
/// need anywhere near this; hitting the cap means the input is either
/// corrupt or deliberately adversarial.
pub const MAX_BUF_SIZE: usize = 256 * 1024 * 1024; // 256 MiB

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/// Canonical string for a zlib error code.
pub fn zlib_err_str(code: i32) -> &'static str {
    match code {
        Z_STREAM_END => "stream end",
        Z_NEED_DICT => "need dictionary",
        Z_ERRNO => "file error",
        Z_STREAM_ERROR => "stream error",
        Z_DATA_ERROR => "data error",
        Z_MEM_ERROR => "insufficient memory",
        Z_BUF_ERROR => "buffer error",
        Z_VERSION_ERROR => "incompatible version",
        _ => "unknown zlib error",
    }
}