#![deny(clippy::all)]

mod constants;
mod deflate;
mod inflate;

use constants::*;
use napi_derive::napi;

// Re-export the two stream types so napi-rs registers them.
pub use deflate::Deflate;
pub use inflate::Inflate;

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