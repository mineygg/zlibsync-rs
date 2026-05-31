#![deny(clippy::all)]

use flate2::{Decompress, FlushDecompress, Status};
use napi::bindgen_prelude::*;
use napi_derive::napi;

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

const DEFAULT_CHUNK_SIZE: u32 = 16 * 1024;
const MIN_CHUNK_SIZE: u32 = 256;
const DEFAULT_WINDOW_BITS: i32 = 15;

/// How many consecutive no-progress iterations before we give up.
const MAX_STALLS: u32 = 16;

/// Buffer shrink: only shrink if the buffer is at least this many chunks
/// above the baseline chunk size.
const SHRINK_HYSTERESIS_CHUNKS: usize = 2;

/// Hard ceiling on `out_buf` allocation.  A well-formed stream should never
/// need anywhere near this; hitting the cap means the input is either
/// corrupt or deliberately adversarial.
const MAX_BUF_SIZE: usize = 256 * 1024 * 1024; // 256 MiB

// ---------------------------------------------------------------------------
// Inflate
// ---------------------------------------------------------------------------

/// Synchronous zlib Inflate.
#[napi]
pub struct Inflate {
    decompress: Decompress,
    chunk_size: u32,
    to_string: bool,
    window_bits: i32,
    out_buf: Vec<u8>,
    result_size: usize,
    total_out: usize,
    /// Counts consecutive sync/finish points where the buffer did NOT need to
    /// grow.  Used to decide when it is safe to shrink `out_buf`.
    no_grow_streak: u32,
    err: i32,
    msg: Option<String>,
}

// ---------------------------------------------------------------------------
// napi-exposed methods
// ---------------------------------------------------------------------------

#[napi]
impl Inflate {
    #[napi(constructor)]
    pub fn new(_env: Env, opts: Option<Object>) -> napi::Result<Self> {
        let mut chunk_size = DEFAULT_CHUNK_SIZE;
        let mut to_string = false;
        let mut window_bits = DEFAULT_WINDOW_BITS;

        if let Some(obj) = opts {
            if let Ok(Some(v)) = obj.get::<_, f64>("chunkSize") {
                // Fix #4: removed the redundant .max(MIN_CHUNK_SIZE) that was
                // applied again unconditionally after this block.
                chunk_size = (v as u32).max(MIN_CHUNK_SIZE);
            }
            if let Ok(Some(v)) = obj.get::<_, String>("to") {
                to_string = v == "string";
            }
            if let Ok(Some(v)) = obj.get::<_, f64>("windowBits") {
                window_bits = v as i32;
            }
        }

        // zlib convention:
        //   1..=15   → zlib-wrapped deflate (expect zlib header)
        //   -1..=-15 → raw deflate (no header)
        //   16..=31  → gzip header (16 + windowBits).  flate2::Decompress does
        //              not support gzip-header mode; callers must use
        //              flate2::read::GzDecoder instead.
        //   0        → use the default window size (treated as zlib here)
        //
        // The old code used `window_bits >= 0`, which made window_bits = 16
        // (gzip) set zlib_header = true — causing it to try to parse a zlib
        // header on gzip data and silently produce wrong output.
        let zlib_header =
            zlib_header_from_window_bits(window_bits).map_err(napi::Error::from_reason)?;

        let decompress = Decompress::new(zlib_header);
        let out_buf = vec![0u8; chunk_size as usize];

        Ok(Self {
            decompress,
            chunk_size,
            to_string,
            window_bits,
            out_buf,
            result_size: 0,
            total_out: 0,
            no_grow_streak: 0,
            err: Z_OK,
            msg: None,
        })
    }

    /// Feed compressed data into the inflater.
    ///
    /// `flush_mode` follows the same convention as pako / Node zlib:
    ///   - omitted / `false`   → `Z_NO_FLUSH`   (accumulate)
    ///   - `true`              → `Z_FINISH`      (last chunk, finalise stream)
    ///   - integer             → raw zlib flush constant
    ///
    /// Note: passing `false` is NOT equivalent to `Z_SYNC_FLUSH`.  If you
    /// need a sync-flush without ending the stream, pass `Z_SYNC_FLUSH` (2)
    /// explicitly as an integer.
    ///
    /// `Z_BLOCK` and `Z_TREES` are not supported by flate2::Decompress and
    /// will return an error if passed.
    ///
    /// Calling `push` after a terminal error or `Z_STREAM_END` is a no-op;
    /// call `reset()` first if you want to start a new stream.
    #[napi]
    pub fn push(
        &mut self,
        data: Buffer,
        flush_mode: Option<Either<bool, i32>>,
    ) -> napi::Result<()> {
        // Guard against pushing into a poisoned or finished stream.
        // Decompress state is undefined after an error, and zlib forbids input
        // after Z_STREAM_END without an explicit reset.
        if self.err < Z_OK || self.err == Z_STREAM_END {
            return Ok(());
        }

        let flush_int: i32 = match flush_mode {
            None => Z_NO_FLUSH,
            Some(Either::A(true)) => Z_FINISH,
            Some(Either::A(false)) => Z_NO_FLUSH,
            Some(Either::B(n)) => n,
        };

        // Reject flush constants outside the valid zlib range (0..=6).
        if !(Z_NO_FLUSH..=Z_TREES).contains(&flush_int) {
            return Err(napi::Error::from_reason(format!(
                "invalid flush mode {}: expected 0 (Z_NO_FLUSH) through 4 (Z_FINISH)",
                flush_int
            )));
        }

        // Fix #3: Z_BLOCK and Z_TREES have no equivalent in flate2::Decompress.
        // Silently mapping them to FlushDecompress::None would produce wrong
        // behaviour that is very hard to diagnose.  Return an explicit error
        // instead so callers learn immediately that these modes are unsupported.
        if flush_int == Z_BLOCK || flush_int == Z_TREES {
            return Err(napi::Error::from_reason(format!(
                "flush mode {} ({}) is not supported by this inflate implementation; \
                 Z_BLOCK and Z_TREES require lower-level zlib access than flate2 exposes",
                flush_int,
                if flush_int == Z_BLOCK {
                    "Z_BLOCK"
                } else {
                    "Z_TREES"
                }
            )));
        }

        let flush = int_to_flush(flush_int);

        let grew = match inflate_all(self, &data, flush) {
            Ok(grew) => grew,
            Err(e) => {
                self.err = Z_DATA_ERROR;
                self.msg = Some(e);
                false
            }
        };

        self.result_size = self.total_out;

        let sync_point = flush_int == Z_SYNC_FLUSH
            || flush_int == Z_PARTIAL_FLUSH
            || flush_int == Z_FULL_FLUSH
            || flush_int == Z_FINISH
            || self.err == Z_STREAM_END;

        if sync_point {
            self.total_out = 0;

            // Buffer shrink is only safe here, after result_size has been
            // captured and total_out reset to 0.  Shrinking mid-stream would
            // invalidate data that `result` still needs to return.
            //
            // Only count this as a "no-grow" iteration when the buffer
            // genuinely did not need to expand this push.
            if !grew {
                self.no_grow_streak += 1;
                let hysteresis = SHRINK_HYSTERESIS_CHUNKS * self.chunk_size as usize;
                if self.no_grow_streak >= 2
                    && self.out_buf.len() >= hysteresis + self.chunk_size as usize
                {
                    let new_len = self.out_buf.len() - self.chunk_size as usize;

                    // Fix #5 (Gemini): guard against truncating live data.
                    //
                    // `total_out` is reset to 0 at each sync point, so it only
                    // measures the *current* push's output — not the buffer's
                    // lifetime high-water mark.  It is entirely possible for
                    // `result_size` (e.g. 50 KB) to exceed `new_len` (e.g.
                    // 48 KB) even though `grew` is false, because the output
                    // fit in the pre-existing buffer from a previous push.
                    // Without this guard, `result` would slice 50 KB out of a
                    // 48 KB Vec and panic, crashing the Node.js process.
                    //
                    // When the guard blocks the shrink we intentionally leave
                    // `no_grow_streak` as-is.  It keeps accumulating, but the
                    // guard will continue blocking until a future push produces
                    // less output and `result_size` drops below `new_len`.
                    if new_len >= self.result_size {
                        self.out_buf.resize(new_len, 0);
                        self.no_grow_streak = 0;
                    }
                }
            } else {
                self.no_grow_streak = 0;
            }
        } else {
            self.no_grow_streak = 0;
        }

        Ok(())
    }

    /// Reset the inflater so it can be reused for a new stream without
    /// reallocating the output buffer.
    #[napi]
    pub fn reset(&mut self) -> napi::Result<()> {
        // Fix #1: use the shared helper so window_bits = 0 maps to
        // zlib_header = true here, consistent with `new()`.  The old inline
        // expression `self.window_bits > 0 && self.window_bits <= 15` returned
        // false for 0, silently changing the decoder mode after a reset.
        //
        // window_bits was already validated in `new()`, so the only values
        // that can reach here are 0, 1..=15, and i32::MIN..=-1; the error
        // branch of `zlib_header_from_window_bits` is unreachable.
        let zlib_header = zlib_header_from_window_bits(self.window_bits).unwrap_or(true);
        self.decompress = Decompress::new(zlib_header);
        self.result_size = 0;
        self.total_out = 0;
        self.no_grow_streak = 0;
        self.err = Z_OK;
        self.msg = None;
        Ok(())
    }

    /// Returns the decompressed output from the most recent flush point.
    ///
    /// Only meaningful immediately after a `push()` with a sync/finish flush
    /// mode.  Calling `result` after a `Z_NO_FLUSH` push returns whatever
    /// partial output has accumulated, which may be incomplete.
    ///
    /// Each access copies the decompressed bytes into a new JS Buffer (or
    /// String if `to: "string"` was set).
    #[napi(getter)]
    pub fn result(&self, env: Env) -> napi::Result<napi::JsUnknown> {
        if self.err < Z_OK {
            return env.get_null().map(|v| v.into_unknown());
        }
        let slice = &self.out_buf[..self.result_size];
        if self.to_string {
            // from_utf8_lossy would silently replace invalid UTF-8 with the
            // replacement character (U+FFFD), which can corrupt data and makes
            // errors invisible.  Return an explicit error instead so callers
            // learn the stream is not valid UTF-8.
            let s = std::str::from_utf8(slice).map_err(|e| {
                napi::Error::from_reason(format!(
                    "output is not valid UTF-8 (byte offset {}); \
                     set to: 'buffer' if the data is binary",
                    e.valid_up_to()
                ))
            })?;
            env.create_string(s).map(|v| v.into_unknown())
        } else {
            let buf = env.create_buffer_copy(slice)?;
            Ok(buf.into_raw().into_unknown())
        }
    }

    #[napi(getter)]
    pub fn err(&self) -> i32 {
        self.err
    }

    #[napi(getter)]
    pub fn msg(&self) -> Option<String> {
        if self.err == Z_OK || self.err == Z_STREAM_END {
            return None;
        }
        Some(
            self.msg
                .clone()
                .unwrap_or_else(|| zlib_err_str(self.err).to_string()),
        )
    }

    #[napi(getter)]
    pub fn chunk_size(&self) -> u32 {
        self.chunk_size
    }

    #[napi(getter)]
    pub fn window_bits(&self) -> i32 {
        self.window_bits
    }
}

// ---------------------------------------------------------------------------
// Internal helpers — free functions so Rust infers Result without the
// #[napi] proc-macro touching the return type.
// ---------------------------------------------------------------------------

/// Derive the `zlib_header` flag from a `window_bits` value, using the same
/// mapping as `new()`.
///
/// Returns `Ok(true)`  for zlib-wrapped deflate (1..=15 and the 0 default),
///         `Ok(false)` for raw deflate (negative values),
///         `Err`       for unsupported gzip / auto-detect ranges (16..=47).
///
/// Fix #1: having this as a single canonical source of truth means `reset()`
/// and `new()` can never drift apart again.
// `use napi::bindgen_prelude::*` shadows the std `Result` type alias, so we
// qualify explicitly here to avoid the compiler treating `Result<bool, String>`
// as `napi::Result<bool>` with `String` as a spurious second argument.
fn zlib_header_from_window_bits(window_bits: i32) -> std::result::Result<bool, String> {
    match window_bits {
        1..=15 => Ok(true),
        i32::MIN..=-1 => Ok(false), // raw deflate
        16..=47 => Err(format!(
            "windowBits {} is not supported by this inflate implementation; \
             use a GzDecoder for gzip streams (windowBits 16-31) or \
             MultiGzDecoder for auto-detect (32-47)",
            window_bits
        )),
        _ => Ok(true), // 0 → default, treat as zlib
    }
}

/// Grow `inflate.out_buf` by one `chunk_size`, returning an error if the
/// result would exceed `MAX_BUF_SIZE`.
///
/// The cap guards against a corrupt or adversarial stream that produces tiny
/// amounts of output per iteration (sidestepping the `MAX_STALLS` check) but
/// keeps growing the buffer indefinitely until the process runs out of memory.
#[allow(clippy::uninit_vec)]
fn grow_buffer(inflate: &mut Inflate) -> std::result::Result<(), String> {
    let new_len = inflate.out_buf.len() + inflate.chunk_size as usize;
    if new_len > MAX_BUF_SIZE {
        return Err(format!(
            "inflate output buffer would exceed the {} MiB safety cap; \
             the stream may be corrupt or adversarially crafted",
            MAX_BUF_SIZE / (1024 * 1024)
        ));
    }
    inflate.out_buf.reserve(new_len - inflate.out_buf.len());
    // SAFETY: `new_len <= capacity` guaranteed by `reserve` above.
    // Bytes in `old_len..new_len` are uninitialised but never read:
    // `result` slices only up to `total_out`, and flate2 treats the
    // output slice as write-only.
    unsafe {
        inflate.out_buf.set_len(new_len);
    }
    Ok(())
}

/// Decompress `input` into `inflate.out_buf`, growing the buffer as needed.
///
/// Returns `Ok(true)` if the buffer was grown at least once during this call
/// (used by `push` to decide whether to increment the shrink streak), or
/// `Ok(false)` if the existing buffer was sufficient.  Returns `Err` on a
/// corrupt / stalled stream.
fn inflate_all(
    inflate: &mut Inflate,
    input: &[u8],
    flush: FlushDecompress,
) -> std::result::Result<bool, String> {
    let total_in_start = inflate.decompress.total_in();
    let mut stall_count: u32 = 0;
    let mut grew = false;

    loop {
        if inflate.total_out >= inflate.out_buf.len() {
            grow_buffer(inflate)?;
            grew = true;
        }

        let in_consumed_so_far = (inflate.decompress.total_in() - total_in_start) as usize;
        let remaining_input = &input[in_consumed_so_far..];

        let out_slice = &mut inflate.out_buf[inflate.total_out..];
        let before_out = inflate.decompress.total_out();

        let status = inflate
            .decompress
            .decompress(remaining_input, out_slice, flush)
            .map_err(|e| e.to_string())?;

        let produced = (inflate.decompress.total_out() - before_out) as usize;
        inflate.total_out += produced;

        match status {
            Status::StreamEnd => {
                inflate.err = Z_STREAM_END;
                return Ok(grew);
            }
            Status::Ok => {
                let in_consumed = (inflate.decompress.total_in() - total_in_start) as usize;
                if in_consumed >= input.len() {
                    return Ok(grew);
                }

                if produced == 0 {
                    // No output and still unconsumed input — the output buffer
                    // is the bottleneck.  Grow and retry, but cap retries to
                    // avoid spinning forever on a malformed stream.
                    stall_count += 1;
                    if stall_count >= MAX_STALLS {
                        let consumed = (inflate.decompress.total_in() - total_in_start) as usize;
                        return Err(format!(
                            "inflate stalled: no progress after {} attempts \
                             ({} of {} input bytes consumed; possible corrupt stream)",
                            MAX_STALLS,
                            consumed,
                            input.len()
                        ));
                    }
                    grow_buffer(inflate)?;
                    grew = true;
                } else {
                    stall_count = 0;
                }
            }
            Status::BufError => {
                // BufError means the output slice passed to decompress() was
                // empty — no input was consumed and no output was produced.
                // This is distinct from the Status::Ok + produced==0 stall path
                // above: BufError only fires when out_slice.is_empty() going
                // in, which can only happen when total_out == out_buf.len().
                // After grow_buffer the slice will be non-empty, so this branch
                // cannot spin; stall_count is intentionally not incremented.
                grow_buffer(inflate)?;
                grew = true;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Constant accessors
//
// napi-rs cannot expose `pub const` items directly to JavaScript, so each
// constant needs a thin #[napi] wrapper function.  The macro below removes
// the repetition — one line per constant instead of four.
// ---------------------------------------------------------------------------

macro_rules! napi_const_i32 {
    ($fn_name:ident, $const_name:ident) => {
        #[napi]
        pub fn $fn_name() -> i32 {
            $const_name
        }
    };
}

// Flush constants
napi_const_i32!(z_no_flush, Z_NO_FLUSH);
napi_const_i32!(z_partial_flush, Z_PARTIAL_FLUSH);
napi_const_i32!(z_sync_flush, Z_SYNC_FLUSH);
napi_const_i32!(z_full_flush, Z_FULL_FLUSH);
napi_const_i32!(z_finish, Z_FINISH);
napi_const_i32!(z_block, Z_BLOCK);
napi_const_i32!(z_trees, Z_TREES);

// Return codes
napi_const_i32!(z_ok, Z_OK);
napi_const_i32!(z_stream_end, Z_STREAM_END);
napi_const_i32!(z_need_dict, Z_NEED_DICT);
napi_const_i32!(z_errno, Z_ERRNO);
napi_const_i32!(z_stream_error, Z_STREAM_ERROR);
napi_const_i32!(z_data_error, Z_DATA_ERROR);
napi_const_i32!(z_mem_error, Z_MEM_ERROR);
napi_const_i32!(z_buf_error, Z_BUF_ERROR);
napi_const_i32!(z_version_error, Z_VERSION_ERROR);

// Compression levels
napi_const_i32!(z_no_compression, Z_NO_COMPRESSION);
napi_const_i32!(z_best_speed, Z_BEST_SPEED);
napi_const_i32!(z_best_compression, Z_BEST_COMPRESSION);
napi_const_i32!(z_default_compression, Z_DEFAULT_COMPRESSION);

// Compression strategies
napi_const_i32!(z_filtered, Z_FILTERED);
napi_const_i32!(z_huffman_only, Z_HUFFMAN_ONLY);
napi_const_i32!(z_rle, Z_RLE);
napi_const_i32!(z_fixed, Z_FIXED);
napi_const_i32!(z_default_strategy, Z_DEFAULT_STRATEGY);

// Data types / misc
napi_const_i32!(z_binary, Z_BINARY);
napi_const_i32!(z_text, Z_TEXT);
napi_const_i32!(z_ascii, Z_ASCII);
napi_const_i32!(z_unknown, Z_UNKNOWN);
napi_const_i32!(z_deflated, Z_DEFLATED);
napi_const_i32!(z_null, Z_NULL);

#[napi]
pub fn zlib_version() -> &'static str {
    ZLIB_VERSION
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Fix #2: use the named constants instead of magic literals so this stays
// correct if the constant values are ever reviewed.
//
// Z_FULL_FLUSH (3) is intentionally absent from the explicit arms: it is a
// compressor concept (reset the dictionary so the stream is splittable at
// this point) and has no meaningful equivalent on the decompressor side.
// Mapping it to FlushDecompress::None is correct — the decompressor simply
// continues as normal.
fn int_to_flush(n: i32) -> FlushDecompress {
    match n {
        Z_SYNC_FLUSH => FlushDecompress::Sync,
        Z_FINISH => FlushDecompress::Finish,
        _ => FlushDecompress::None, // includes Z_NO_FLUSH, Z_FULL_FLUSH, etc.
    }
}

fn zlib_err_str(code: i32) -> &'static str {
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
