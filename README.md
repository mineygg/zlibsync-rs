# @mineygg/zlibsync-rs

> Synchronous zlib inflate backed by a Rust/NAPI-RS native addon.

---

## Features

- **Native performance** — core decompression implemented in Rust via [`flate2`](https://crates.io/crates/flate2) and exposed through [napi-rs](https://napi.rs/).
- **Prebuilt binaries** — no build toolchain required at install time for supported platforms.
- **Full zlib constant surface** — all standard flush modes, return codes, compression levels, strategies, and data types are re-exported.
- **TypeScript-first** — ships with complete `.d.ts` declarations.

---

## Installation

```bash
npm install @mineygg/zlibsync-rs
# or
yarn add @mineygg/zlibsync-rs
# or
pnpm add @mineygg/zlibsync-rs
```

Prebuilt binaries are provided for the following platforms. No native compilation is required.

| Platform | Architecture | ABI     |
|----------|-------------|---------|
| Windows  | x64         | MSVC    |
| Linux    | x64         | glibc   |
| Linux    | x64         | musl    |
| Linux    | arm64       | glibc   |
| Linux    | arm64       | musl    |
| Linux    | arm (v7)    | gnueabihf |
| Linux    | arm (v7)    | musleabihf |
| macOS    | x64         |         |
| macOS    | arm64 (M-series) |    |

---

## Quick Start

```ts
import { Inflate, Z_SYNC_FLUSH } from "@mineygg/zlibsync-rs";

const inflate = new Inflate({ chunkSize: 65536 });

// `chunk` is a Buffer received from a WebSocket or other source
inflate.push(chunk, Z_SYNC_FLUSH);

if (inflate.err < 0) {
  throw new Error(`zlib error ${inflate.err}: ${inflate.msg}`);
}

const decompressed = inflate.result; // Buffer | string | null
```

---

## API Reference

### `new Inflate(opts?)`

Creates a new synchronous inflate stream.

| Option       | Type     | Default  | Description                                      |
|--------------|----------|----------|--------------------------------------------------|
| `chunkSize`  | `number` | `16384`  | Internal buffer growth increment in bytes. Minimum `256`. |
| `to`         | `"string"` | —      | If `"string"`, `.result` returns a decoded UTF-8 string instead of a `Buffer`. |
| `windowBits` | `number` | `15`     | zlib window size. Pass a negative value (e.g. `-15`) for raw deflate (no zlib header). |

---

### `inflate.push(data, flushMode?)`

Feed compressed data into the stream.

| Parameter   | Type                      | Description                                                     |
|-------------|---------------------------|-----------------------------------------------------------------|
| `data`      | `Buffer`                  | Compressed bytes to decompress.                                 |
| `flushMode` | `boolean \| number`       | Flush behaviour. `true` = `Z_FINISH`, `false`/omit = `Z_NO_FLUSH`. Pass a zlib flush constant (e.g. `Z_SYNC_FLUSH`) for precise control. |

---

### `inflate.reset()`

Resets the inflater instance so it can be reused for a new stream. This avoids reallocating the internal output buffer, which significantly improves performance and reduces garbage collection overhead when processing multiple streams consecutively.

---

### `inflate.result` *(getter)*

Returns the decompressed output from the last `push()` call that produced a sync point (`Z_SYNC_FLUSH`, `Z_FINISH`, or stream end).

- Returns `null` if the last push encountered an error (`inflate.err < 0`).
- Returns `string` if constructed with `{ to: "string" }`, otherwise `Buffer`.

---

### `inflate.err` *(getter)*

The zlib return code from the last operation. `0` (`Z_OK`) means success. Negative values indicate errors — see [Return Codes](#return-codes) below.

---

### `inflate.msg` *(getter)*

Human-readable error message when `inflate.err` is negative, otherwise `null`.

---

### `inflate.chunkSize` *(getter)*

The effective chunk size the instance was created with.

---

### `inflate.windowBits` *(getter)*

The window bits value the instance was created with.

---

## Constants

All standard zlib constants are re-exported. They match the values in `zlib.h` exactly.

### Flush Modes

| Export             | Value | Description             |
|--------------------|-------|-------------------------|
| `Z_NO_FLUSH`       | `0`   | No flush                |
| `Z_PARTIAL_FLUSH`  | `1`   | Partial flush           |
| `Z_SYNC_FLUSH`     | `2`   | Sync flush (most common for WebSocket framing) |
| `Z_FULL_FLUSH`     | `3`   | Full flush              |
| `Z_FINISH`         | `4`   | Finish stream           |
| `Z_BLOCK`          | `5`   | Block flush             |
| `Z_TREES`          | `6`   | Trees flush             |

### Return Codes

| Export            | Value | Description               |
|-------------------|-------|---------------------------|
| `Z_OK`            | `0`   | Success                   |
| `Z_STREAM_END`    | `1`   | End of compressed stream  |
| `Z_NEED_DICT`     | `2`   | Preset dictionary needed  |
| `Z_ERRNO`         | `-1`  | File error                |
| `Z_STREAM_ERROR`  | `-2`  | Stream state inconsistent |
| `Z_DATA_ERROR`    | `-3`  | Invalid or incomplete data |
| `Z_MEM_ERROR`     | `-4`  | Insufficient memory       |
| `Z_BUF_ERROR`     | `-5`  | No progress possible      |
| `Z_VERSION_ERROR` | `-6`  | Incompatible zlib version |

### Compression Levels

| Export                 | Value | Description             |
|------------------------|-------|-------------------------|
| `Z_NO_COMPRESSION`     | `0`   | No compression          |
| `Z_BEST_SPEED`         | `1`   | Fastest compression     |
| `Z_BEST_COMPRESSION`   | `9`   | Best compression ratio  |
| `Z_DEFAULT_COMPRESSION`| `-1`  | Default level           |

### Compression Strategies

| Export              | Value | Description          |
|---------------------|-------|----------------------|
| `Z_FILTERED`        | `1`   | Filtered data        |
| `Z_HUFFMAN_ONLY`    | `2`   | Huffman coding only  |
| `Z_RLE`             | `3`   | RLE compression      |
| `Z_FIXED`           | `4`   | Fixed Huffman codes  |
| `Z_DEFAULT_STRATEGY`| `0`   | Default strategy     |

### Data Types

| Export      | Value | Description       |
|-------------|-------|-------------------|
| `Z_BINARY`  | `0`   | Binary data       |
| `Z_TEXT`    | `1`   | Text / ASCII data |
| `Z_ASCII`   | `1`   | Alias for `Z_TEXT`|
| `Z_UNKNOWN` | `2`   | Unknown data type |
| `Z_DEFLATED`| `8`   | Deflate method    |
| `Z_NULL`    | `0`   | Null / none       |

### Version

| Export          | Type     | Description                    |
|-----------------|----------|--------------------------------|
| `ZLIB_VERSION`  | `string` | Bundled zlib version (`"1.2.13"`) |

---

## Usage with Discord.js / WebSockets

A common use-case is decompressing Discord gateway payloads with `zlib-stream` transport compression:

```ts
import { Inflate, Z_SYNC_FLUSH } from "@mineygg/zlibsync-rs";

const inflate = new Inflate();
const ZLIB_SUFFIX = Buffer.from([0x00, 0x00, 0xff, 0xff]);

function handleMessage(data: Buffer): string | null {
  inflate.push(data, Z_SYNC_FLUSH);
  if (inflate.err < 0) return null;
  return (inflate.result as Buffer).toString("utf8");
}
```

---

## Building from Source

Requires [Rust](https://rustup.rs/) and Node.js ≥ 20.

```bash
git clone https://github.com/mineygg/zlibsync-rs
cd zlibsync-rs
npm install
npm run build
```

The compiled `.node` addon is placed in `prebuilds/`.

---

## License

MIT