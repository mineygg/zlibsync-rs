use crate::constants::*;
use flate2::{Decompress, FlushDecompress, Status};
use napi::bindgen_prelude::*;
use napi_derive::napi;

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
impl Inflate {
    #[napi(constructor)]
    pub fn new(_env: Env, opts: Option<Object>) -> napi::Result<Self> {
        let mut chunk_size = DEFAULT_CHUNK_SIZE;
        let mut to_string = false;
        let mut window_bits = DEFAULT_WINDOW_BITS;

        if let Some(obj) = opts {
            if let Ok(Some(v)) = obj.get::<_, f64>("chunkSize") {
                chunk_size = (v as u32).max(MIN_CHUNK_SIZE);
            }
            if let Ok(Some(v)) = obj.get::<_, String>("to") {
                to_string = v == "string";
            }
            if let Ok(Some(v)) = obj.get::<_, f64>("windowBits") {
                window_bits = v as i32;
            }
        }

        let decompress = Self::make_decompress(window_bits)
            .map_err(napi::Error::from_reason)?;
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
            last_flush_was_sync: false,
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
        if self.err < Z_OK || self.err == Z_STREAM_END {
            return Ok(());
        }

        let flush_int: i32 = match flush_mode {
            None => Z_NO_FLUSH,
            Some(Either::A(true)) => Z_FINISH,
            Some(Either::A(false)) => Z_NO_FLUSH,
            Some(Either::B(n)) => n,
        };

        if !(Z_NO_FLUSH..=Z_TREES).contains(&flush_int) {
            return Err(napi::Error::from_reason(format!(
                "invalid flush mode {}: expected 0 (Z_NO_FLUSH) through 4 (Z_FINISH)",
                flush_int
            )));
        }

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

        let flush = int_to_flush_decompress(flush_int);

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

    /// Reset the inflater so it can be reused for a new stream without
    /// reallocating the output buffer.
    #[napi]
    pub fn reset(&mut self) -> napi::Result<()> {
        self.decompress = Self::make_decompress(self.window_bits)
            .map_err(napi::Error::from_reason)?;
        self.result_size = 0;
        self.total_out = 0;
        self.no_grow_streak = 0;
        self.last_flush_was_sync = false;
        self.err = Z_OK;
        self.msg = None;
        Ok(())
    }

    /// Returns the decompressed output from the most recent flush point, or
    /// `null` if the last `push()` was not at a sync/finish boundary (i.e.
    /// `Z_NO_FLUSH` was used).
    ///
    /// For the Buffer path, the result bytes are moved into the JS heap with
    /// no copy.  For the String path a copy is unavoidable because
    /// `create_string` requires a `&str` borrow.
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
                     set to: 'buffer' if the data is binary",
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

    /// Private helper: construct a `Decompress` instance from `window_bits`.
    /// Centralises the window_bits → zlib_header mapping used by both
    /// `new()` and `reset()`.
    fn make_decompress(window_bits: i32) -> std::result::Result<Decompress, String> {
        let zlib_header = zlib_header_from_window_bits(window_bits)?;
        Ok(Decompress::new(zlib_header))
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Derive the `zlib_header` flag from a `window_bits` value.
///
/// Returns `Ok(true)`  for zlib-wrapped deflate (8..=15 and 0 default),
///         `Ok(false)` for raw deflate (-15..=-8),
///         `Err`       for gzip/auto-detect ranges (16..=47) or out-of-range values.
pub(crate) fn zlib_header_from_window_bits(
    window_bits: i32,
) -> std::result::Result<bool, String> {
    match window_bits {
        8..=15 => Ok(true),    // zlib-wrapped deflate
        -15..=-8 => Ok(false), // raw deflate
        0 => Ok(true),         // default (treated as zlib, window = 15)
        16..=47 => Err(format!(
            "windowBits {} is not supported by this inflate implementation; \
             use a GzDecoder for gzip streams (windowBits 16-31) or \
             MultiGzDecoder for auto-detect (32-47)",
            window_bits
        )),
        _ => Err(format!(
            "windowBits {} is out of the valid range; \
             use 8–15 for zlib, -15–-8 for raw deflate, or 0 for the default",
            window_bits
        )),
    }
}

/// Map a raw zlib flush integer to a `FlushDecompress` variant.
///
/// `Z_FULL_FLUSH` is intentionally absent from the explicit arms: it is a
/// compressor concept and has no meaningful equivalent on the decompressor
/// side.  Mapping it to `FlushDecompress::None` is correct.
pub(crate) fn int_to_flush_decompress(n: i32) -> FlushDecompress {
    match n {
        Z_SYNC_FLUSH => FlushDecompress::Sync,
        Z_FINISH => FlushDecompress::Finish,
        _ => FlushDecompress::None,
    }
}

/// Grow `inflate.out_buf`, returning an error if the result would exceed
/// `MAX_BUF_SIZE`.
fn grow_buffer(inflate: &mut Inflate) -> std::result::Result<(), String> {
    let new_len = inflate
        .out_buf
        .len()
        .saturating_mul(2)
        .max(inflate.out_buf.len() + inflate.chunk_size as usize)
        .min(MAX_BUF_SIZE);

    if new_len <= inflate.out_buf.len() {
        return Err(format!(
            "inflate output buffer would exceed the {} MiB safety cap; \
             the stream may be corrupt or adversarially crafted",
            MAX_BUF_SIZE / (1024 * 1024)
        ));
    }

    // Safe zero-initialised resize — no unsafe needed and equally fast in
    // practice because the OS returns zeroed pages anyway.
    inflate.out_buf.resize(new_len, 0u8);
    Ok(())
}

/// Decompress `input` into `inflate.out_buf`, growing the buffer as needed.
///
/// Returns `Ok(true)` if the buffer was grown at least once, `Ok(false)` if
/// the existing buffer was sufficient.  Returns `Err` on a corrupt or stalled
/// stream.
fn inflate_all(
    inflate: &mut Inflate,
    input: &[u8],
    flush: FlushDecompress,
) -> std::result::Result<bool, String> {
    let total_in_start = inflate.decompress.total_in();
    let mut in_pos: usize = 0;
    let mut stall_count: u32 = 0;
    let mut grew = false;

    loop {
        if inflate.total_out >= inflate.out_buf.len() {
            grow_buffer(inflate)?;
            grew = true;
        }

        let remaining_input = &input[in_pos..];
        let out_slice = &mut inflate.out_buf[inflate.total_out..];
        let before_out = inflate.decompress.total_out();

        let status = inflate
            .decompress
            .decompress(remaining_input, out_slice, flush)
            .map_err(|e| e.to_string())?;

        // Compute bytes consumed this iteration via the cumulative counter
        // delta minus what we had already accounted for in in_pos.
        let new_total_in = inflate.decompress.total_in();
        let consumed_this_iter =
            (new_total_in.saturating_sub(total_in_start) as usize).saturating_sub(in_pos);
        in_pos += consumed_this_iter;

        let produced = (inflate.decompress.total_out() - before_out) as usize;
        inflate.total_out += produced;

        match status {
            Status::StreamEnd => {
                inflate.err = Z_STREAM_END;
                return Ok(grew);
            }
            Status::Ok => {
                if in_pos >= input.len() {
                    return Ok(grew);
                }

                if produced == 0 {
                    stall_count += 1;
                    if stall_count >= MAX_STALLS {
                        return Err(format!(
                            "inflate stalled: no progress after {} attempts \
                             ({} of {} input bytes consumed; possible corrupt stream)",
                            MAX_STALLS,
                            in_pos,
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
                grow_buffer(inflate)?;
                grew = true;
            }
        }
    }
}