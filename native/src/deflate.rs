use crate::constants::*;
use flate2::{Compress, FlushCompress, Status};
use napi::bindgen_prelude::*;
use napi_derive::napi;

// ---------------------------------------------------------------------------
// Deflate
// ---------------------------------------------------------------------------

/// Synchronous zlib Deflate.
///
/// Mirrors the `Inflate` API: construct once, call `push()` with successive
/// chunks, read `result` after each flush point.
#[napi]
pub struct Deflate {
    compress: Compress,
    chunk_size: u32,
    to_string: bool,
    level: i32,
    window_bits: i32,
    out_buf: Vec<u8>,
    result_size: usize,
    total_out: usize,
    /// Counts consecutive sync/finish points where the buffer did NOT need to
    /// grow.  Used to decide when it is safe to shrink `out_buf`.
    no_grow_streak: u32,
    /// True only after a push that ended at a sync/finish boundary.
    /// Guards `result` from swapping the buffer mid-stream (e.g. after a
    /// Z_NO_FLUSH push), which would corrupt `total_out`'s offset into the
    /// newly-allocated replacement buffer.
    last_flush_was_sync: bool,
    pub(crate) err: i32,
    msg: Option<String>,
}

// ---------------------------------------------------------------------------
// napi-exposed methods
// ---------------------------------------------------------------------------

#[napi]
impl Deflate {
    #[napi(constructor)]
    pub fn new(_env: Env, opts: Option<Object>) -> napi::Result<Self> {
        let mut chunk_size = DEFAULT_CHUNK_SIZE;
        let mut to_string = false;
        let mut level = Z_DEFAULT_COMPRESSION;
        let mut window_bits = DEFAULT_WINDOW_BITS;

        if let Some(obj) = opts {
            if let Ok(Some(v)) = obj.get::<_, f64>("chunkSize") {
                chunk_size = (v as u32).max(MIN_CHUNK_SIZE);
            }
            if let Ok(Some(v)) = obj.get::<_, String>("to") {
                to_string = v == "string";
            }
            if let Ok(Some(v)) = obj.get::<_, f64>("level") {
                level = v as i32;
            }
            if let Ok(Some(v)) = obj.get::<_, f64>("windowBits") {
                window_bits = v as i32;
            }
        }

        // Validate and map the compression level.
        //   -1 (Z_DEFAULT_COMPRESSION) → flate2's default (roughly level 6)
        //    0 (Z_NO_COMPRESSION)       → store only
        //    1 (Z_BEST_SPEED) ..= 9 (Z_BEST_COMPRESSION) → explicit levels
        let flate2_level = compression_level_from_int(level)
            .map_err(napi::Error::from_reason)?;

        // Validate window_bits the same way Inflate does.
        // Negative window_bits → raw deflate (no zlib header/trailer).
        // Positive window_bits → zlib-wrapped deflate.
        // 16..=31  → gzip header; not supported here.
        let zlib_header =
            zlib_header_from_window_bits(window_bits).map_err(napi::Error::from_reason)?;

        let compress = Compress::new_with_window_bits(
            flate2_level,
            zlib_header,
            window_bits.unsigned_abs().min(15) as u8,
        );
        let out_buf = vec![0u8; chunk_size as usize];

        Ok(Self {
            compress,
            chunk_size,
            to_string,
            level,
            window_bits,
            out_buf,
            result_size: 0,
            total_out: 0,
            no_grow_streak: 0,
            last_flush_was_sync: false,
            err: Z_OK,
            msg: None,
        })
    }

    /// Feed uncompressed data into the deflater.
    ///
    /// `flush_mode` follows the same convention as pako / Node zlib:
    ///   - omitted / `false`   → `Z_NO_FLUSH`   (accumulate)
    ///   - `true`              → `Z_FINISH`      (last chunk, finalise stream)
    ///   - integer             → raw zlib flush constant
    ///
    /// Call `push(data, Z_SYNC_FLUSH)` or `push(data, true)` to flush
    /// output so far into `result`.
    ///
    /// Calling `push` after a terminal error or `Z_STREAM_END` is a no-op;
    /// call `reset()` first to start a new stream.
    #[napi]
    pub fn push(
        &mut self,
        data: Buffer,
        flush_mode: Option<Either<bool, i32>>,
    ) -> napi::Result<()> {
        // Guard against pushing into a poisoned or finished stream.
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

        // Z_BLOCK and Z_TREES are not exposed by flate2::Compress.
        if flush_int == Z_BLOCK || flush_int == Z_TREES {
            return Err(napi::Error::from_reason(format!(
                "flush mode {} ({}) is not supported by this deflate implementation; \
                 Z_BLOCK and Z_TREES require lower-level zlib access than flate2 exposes",
                flush_int,
                if flush_int == Z_BLOCK {
                    "Z_BLOCK"
                } else {
                    "Z_TREES"
                }
            )));
        }

        let flush = int_to_flush_compress(flush_int);

        let grew = match deflate_all(self, &data, flush) {
            Ok(grew) => grew,
            Err(e) => {
                self.err = Z_STREAM_ERROR;
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

        self.last_flush_was_sync = sync_point;

        if sync_point {
            self.total_out = 0;

            if !grew {
                self.no_grow_streak += 1;
                let hysteresis = SHRINK_HYSTERESIS_CHUNKS * self.chunk_size as usize;
                if self.no_grow_streak >= 2
                    && self.out_buf.len() >= hysteresis + self.chunk_size as usize
                {
                    let new_len = self.out_buf.len() - self.chunk_size as usize;
                    if new_len >= self.result_size {
                        self.out_buf.truncate(new_len);
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

    /// Reset the deflater so it can be reused for a new stream without
    /// reallocating the output buffer.
    #[napi]
    pub fn reset(&mut self) -> napi::Result<()> {
        let flate2_level = compression_level_from_int(self.level).unwrap_or(flate2::Compression::default());
        let zlib_header = zlib_header_from_window_bits(self.window_bits).unwrap_or(true);
        self.compress = Compress::new_with_window_bits(
            flate2_level,
            zlib_header,
            self.window_bits.unsigned_abs().min(15) as u8,
        );
        self.result_size = 0;
        self.total_out = 0;
        self.no_grow_streak = 0;
        self.last_flush_was_sync = false;
        self.err = Z_OK;
        self.msg = None;
        Ok(())
    }

    /// Returns the compressed output from the most recent flush point, or
    /// `null` if the last `push()` was not at a sync/finish boundary (i.e.
    /// `Z_NO_FLUSH` was used).
    ///
    /// Only meaningful immediately after a `push()` with a sync/finish flush
    /// mode.  The result bytes are moved into the JS heap with no copy
    /// (Buffer path).  For the String path a copy is unavoidable.
    ///
    /// **Important:** `result` must only be called once per sync point.
    /// After the Buffer path runs, the internal output buffer is replaced
    /// with a fresh allocation so that subsequent `push()` calls can write
    /// into it from offset 0.  Calling `result` a second time at the same
    /// sync point returns an empty Buffer (result_size was already zeroed).
    #[napi(getter)]
    pub fn result(&mut self, env: Env) -> napi::Result<napi::JsUnknown> {
        // If the last push was not a sync/finish point the stream is still
        // accumulating data.  Swapping out_buf here would corrupt total_out's
        // offset into the replacement buffer, so return null instead.
        if !self.last_flush_was_sync {
            return env.get_null().map(|v| v.into_unknown());
        }

        if self.err < Z_OK {
            return env.get_null().map(|v| v.into_unknown());
        }

        let result_size = self.result_size;

        if self.to_string {
            let slice = &self.out_buf[..result_size];
            let s = std::str::from_utf8(slice).map_err(|e| {
                napi::Error::from_reason(format!(
                    "output is not valid UTF-8 (byte offset {}); \
                     compressed data is binary — do not use to: 'string' for deflate output",
                    e.valid_up_to()
                ))
            })?;
            // For the string path we leave out_buf intact (we only borrowed a
            // slice) and zero result_size so a repeated read returns "".
            self.result_size = 0;
            env.create_string(s).map(|v| v.into_unknown())
        } else {
            // Move the populated buffer into JS and replace it with a fresh
            // chunk-sized allocation so the next push() starts at offset 0.
            let mut owned =
                std::mem::replace(&mut self.out_buf, vec![0u8; self.chunk_size as usize]);
            owned.truncate(result_size);
            self.result_size = 0;
            let buf = env.create_buffer_with_data(owned)?;
            Ok(buf.into_raw().into_unknown())
        }
    }

    #[napi(js_name = "takeResult")]
    pub fn take_result(&mut self, env: Env) -> napi::Result<napi::JsUnknown> {
        self.result(env)
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

    #[napi(getter)]
    pub fn level(&self) -> i32 {
        self.level
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Validate and convert a raw zlib compression-level integer to a
/// `flate2::Compression` value.
///
/// Valid inputs:
///   -1 (Z_DEFAULT_COMPRESSION) → `flate2::Compression::default()` (≈ level 6)
///    0 (Z_NO_COMPRESSION)       → `flate2::Compression::none()`
///    1–9                        → `flate2::Compression::new(n)`
pub(crate) fn compression_level_from_int(
    level: i32,
) -> std::result::Result<flate2::Compression, String> {
    match level {
        Z_DEFAULT_COMPRESSION => Ok(flate2::Compression::default()),
        Z_NO_COMPRESSION => Ok(flate2::Compression::none()),
        1..=9 => Ok(flate2::Compression::new(level as u32)),
        _ => Err(format!(
            "invalid compression level {}: expected -1 (default), 0–9, or Z_DEFAULT_COMPRESSION",
            level
        )),
    }
}

/// Derive the `zlib_header` flag from a `window_bits` value (shared logic
/// with Inflate — kept here to avoid a circular module dependency).
///
/// Returns `Ok(true)`  for zlib-wrapped deflate (1..=15 and the 0 default),
///         `Ok(false)` for raw deflate (negative values),
///         `Err`       for unsupported gzip / auto-detect ranges (16..=47).
pub(crate) fn zlib_header_from_window_bits(
    window_bits: i32,
) -> std::result::Result<bool, String> {
    match window_bits {
        1..=15 => Ok(true),
        i32::MIN..=-1 => Ok(false),
        16..=47 => Err(format!(
            "windowBits {} is not supported by this deflate implementation; \
             use a GzEncoder for gzip output (windowBits 16-31)",
            window_bits
        )),
        _ => Ok(true), // 0 → default, treat as zlib
    }
}

/// Map a raw zlib flush integer to a `FlushCompress` variant.
fn int_to_flush_compress(n: i32) -> FlushCompress {
    match n {
        Z_SYNC_FLUSH => FlushCompress::Sync,
        Z_FULL_FLUSH => FlushCompress::Full,
        Z_FINISH => FlushCompress::Finish,
        _ => FlushCompress::None, // Z_NO_FLUSH, Z_PARTIAL_FLUSH, etc.
    }
}

/// Grow `deflate.out_buf`, returning an error if the result would exceed
/// `MAX_BUF_SIZE`.
#[allow(clippy::uninit_vec)]
fn grow_buffer(deflate: &mut Deflate) -> std::result::Result<(), String> {
    let new_len = deflate
        .out_buf
        .len()
        .saturating_mul(2)
        .max(deflate.out_buf.len() + deflate.chunk_size as usize)
        .min(MAX_BUF_SIZE);

    if new_len <= deflate.out_buf.len() {
        return Err(format!(
            "deflate output buffer would exceed the {} MiB safety cap; \
             the stream may be corrupt or adversarially crafted",
            MAX_BUF_SIZE / (1024 * 1024)
        ));
    }

    deflate.out_buf.reserve(new_len - deflate.out_buf.len());
    // SAFETY: `new_len <= capacity` guaranteed by `reserve` above.
    // Bytes in `old_len..new_len` are uninitialised but never read:
    // `result` slices only up to `total_out`.
    unsafe {
        deflate.out_buf.set_len(new_len);
    }
    Ok(())
}

/// Compress `input` into `deflate.out_buf`, growing the buffer as needed.
///
/// Returns `Ok(true)` if the buffer was grown at least once, `Ok(false)` if
/// the existing buffer was sufficient.  Returns `Err` on a stalled or
/// corrupt stream.
fn deflate_all(
    deflate: &mut Deflate,
    input: &[u8],
    flush: FlushCompress,
) -> std::result::Result<bool, String> {
    let total_in_start = deflate.compress.total_in();
    let mut in_pos: usize = 0;
    let mut stall_count: u32 = 0;
    let mut grew = false;
    let needs_drain = flush != FlushCompress::None;

    loop {
        if deflate.total_out >= deflate.out_buf.len() {
            grow_buffer(deflate)?;
            grew = true;
        }

        let remaining_input = &input[in_pos..];
        let out_slice = &mut deflate.out_buf[deflate.total_out..];
        let before_out = deflate.compress.total_out();

        let status = deflate
            .compress
            .compress(remaining_input, out_slice, flush)
            .map_err(|e| e.to_string())?;

        // Compute bytes consumed this iteration via the cumulative counter
        // delta minus what we had already accounted for in in_pos.
        let new_total_in = deflate.compress.total_in();
        let consumed_this_iter =
            (new_total_in.saturating_sub(total_in_start) as usize).saturating_sub(in_pos);
        in_pos += consumed_this_iter;

        let produced = (deflate.compress.total_out() - before_out) as usize;
        deflate.total_out += produced;

        match status {
            Status::StreamEnd => {
                deflate.err = Z_STREAM_END;
                return Ok(grew);
            }
            Status::Ok => {
                if in_pos >= input.len() {
                    match flush {
                        FlushCompress::None => {
                            return Ok(grew);
                        }
                        FlushCompress::Sync
                        | FlushCompress::Full
                        | FlushCompress::Finish => {
                            if produced > 0 {
                                continue;
                            }
                        }
                        _ => {
                            return Ok(grew);
                        }
                    }
                }

                if produced == 0 {
                    stall_count += 1;
                    if stall_count >= MAX_STALLS {
                        return Err(format!(
                            "deflate stalled: no progress after {} attempts \
                             ({} of {} input bytes consumed)",
                            MAX_STALLS,
                            in_pos,
                            input.len()
                        ));
                    }
                    grow_buffer(deflate)?;
                    grew = true;
                } else {
                    stall_count = 0;
                }
            }
            Status::BufError => {
                // zlib returns Z_BUF_ERROR when no progress was possible.
                // Mid-stream (still have input): output was full, grow and retry.
                // Post-drain (all input consumed + flush mode): the flush is
                // complete and zlib has nothing more to write — return.
                if in_pos >= input.len() && needs_drain {
                    return Ok(grew);
                }
                grow_buffer(deflate)?;
                grew = true;
            }
        }
    }
}