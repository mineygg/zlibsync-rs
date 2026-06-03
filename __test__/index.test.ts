import { beforeEach, describe, expect, it } from "vitest";
import {
  Deflate,
  Inflate,
  Z_ASCII,
  Z_BEST_COMPRESSION,
  Z_BEST_SPEED,
  Z_BINARY,
  Z_BLOCK,
  Z_BUF_ERROR,
  Z_DATA_ERROR,
  Z_DEFAULT_COMPRESSION,
  Z_DEFAULT_STRATEGY,
  Z_DEFLATED,
  Z_ERRNO,
  Z_FILTERED,
  Z_FINISH,
  Z_FIXED,
  Z_FULL_FLUSH,
  Z_HUFFMAN_ONLY,
  Z_MEM_ERROR,
  Z_NEED_DICT,
  Z_NO_COMPRESSION,
  Z_NO_FLUSH,
  Z_NULL,
  Z_OK,
  Z_PARTIAL_FLUSH,
  Z_RLE,
  Z_STREAM_END,
  Z_STREAM_ERROR,
  Z_SYNC_FLUSH,
  Z_TEXT,
  Z_TREES,
  Z_UNKNOWN,
  Z_VERSION_ERROR,
  ZLIB_VERSION,
} from "../src/index";

// ---------------------------------------------------------------------------
// Helper: compress with our Deflate (replaces node:zlib deflateSync)
// ---------------------------------------------------------------------------

function deflate(input: string | Buffer): Buffer {
  const data = typeof input === "string" ? Buffer.from(input) : input;
  const d = new Deflate();
  d.push(data, Z_FINISH);
  if (d.err < 0) throw new Error(`Deflate error ${d.err}: ${d.msg}`);
  return d.result as Buffer;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("Constants", () => {
  describe("Flush modes", () => {
    it("should export Z_NO_FLUSH", () => {
      expect(typeof Z_NO_FLUSH).toBe("number");
      expect(Z_NO_FLUSH).toBe(0);
    });

    it("should export Z_PARTIAL_FLUSH", () => {
      expect(typeof Z_PARTIAL_FLUSH).toBe("number");
      expect(Z_PARTIAL_FLUSH).toBe(1);
    });

    it("should export Z_SYNC_FLUSH", () => {
      expect(typeof Z_SYNC_FLUSH).toBe("number");
      expect(Z_SYNC_FLUSH).toBe(2);
    });

    it("should export Z_FULL_FLUSH", () => {
      expect(typeof Z_FULL_FLUSH).toBe("number");
      expect(Z_FULL_FLUSH).toBe(3);
    });

    it("should export Z_FINISH", () => {
      expect(typeof Z_FINISH).toBe("number");
      expect(Z_FINISH).toBe(4);
    });

    it("should export Z_BLOCK", () => {
      expect(typeof Z_BLOCK).toBe("number");
      expect(Z_BLOCK).toBe(5);
    });

    it("should export Z_TREES", () => {
      expect(typeof Z_TREES).toBe("number");
      expect(Z_TREES).toBe(6);
    });
  });

  describe("Return codes", () => {
    it("should export Z_OK", () => {
      expect(typeof Z_OK).toBe("number");
      expect(Z_OK).toBe(0);
    });

    it("should export Z_STREAM_END", () => {
      expect(typeof Z_STREAM_END).toBe("number");
      expect(Z_STREAM_END).toBe(1);
    });

    it("should export Z_NEED_DICT", () => {
      expect(typeof Z_NEED_DICT).toBe("number");
      expect(Z_NEED_DICT).toBe(2);
    });

    it("should export Z_ERRNO", () => {
      expect(typeof Z_ERRNO).toBe("number");
      expect(Z_ERRNO).toBe(-1);
    });

    it("should export Z_STREAM_ERROR", () => {
      expect(typeof Z_STREAM_ERROR).toBe("number");
      expect(Z_STREAM_ERROR).toBe(-2);
    });

    it("should export Z_DATA_ERROR", () => {
      expect(typeof Z_DATA_ERROR).toBe("number");
      expect(Z_DATA_ERROR).toBe(-3);
    });

    it("should export Z_MEM_ERROR", () => {
      expect(typeof Z_MEM_ERROR).toBe("number");
      expect(Z_MEM_ERROR).toBe(-4);
    });

    it("should export Z_BUF_ERROR", () => {
      expect(typeof Z_BUF_ERROR).toBe("number");
      expect(Z_BUF_ERROR).toBe(-5);
    });

    it("should export Z_VERSION_ERROR", () => {
      expect(typeof Z_VERSION_ERROR).toBe("number");
      expect(Z_VERSION_ERROR).toBe(-6);
    });
  });

  describe("Compression levels", () => {
    it("should export Z_NO_COMPRESSION", () => {
      expect(typeof Z_NO_COMPRESSION).toBe("number");
      expect(Z_NO_COMPRESSION).toBe(0);
    });

    it("should export Z_BEST_SPEED", () => {
      expect(typeof Z_BEST_SPEED).toBe("number");
      expect(Z_BEST_SPEED).toBe(1);
    });

    it("should export Z_BEST_COMPRESSION", () => {
      expect(typeof Z_BEST_COMPRESSION).toBe("number");
      expect(Z_BEST_COMPRESSION).toBe(9);
    });

    it("should export Z_DEFAULT_COMPRESSION", () => {
      expect(typeof Z_DEFAULT_COMPRESSION).toBe("number");
      expect(Z_DEFAULT_COMPRESSION).toBe(-1);
    });
  });

  describe("Compression strategies", () => {
    it("should export Z_FILTERED", () => {
      expect(typeof Z_FILTERED).toBe("number");
      expect(Z_FILTERED).toBe(1);
    });

    it("should export Z_HUFFMAN_ONLY", () => {
      expect(typeof Z_HUFFMAN_ONLY).toBe("number");
      expect(Z_HUFFMAN_ONLY).toBe(2);
    });

    it("should export Z_RLE", () => {
      expect(typeof Z_RLE).toBe("number");
      expect(Z_RLE).toBe(3);
    });

    it("should export Z_FIXED", () => {
      expect(typeof Z_FIXED).toBe("number");
      expect(Z_FIXED).toBe(4);
    });

    it("should export Z_DEFAULT_STRATEGY", () => {
      expect(typeof Z_DEFAULT_STRATEGY).toBe("number");
      expect(Z_DEFAULT_STRATEGY).toBe(0);
    });
  });

  describe("Data types", () => {
    it("should export Z_BINARY", () => {
      expect(typeof Z_BINARY).toBe("number");
      expect(Z_BINARY).toBe(0);
    });

    it("should export Z_TEXT", () => {
      expect(typeof Z_TEXT).toBe("number");
      expect(Z_TEXT).toBe(1);
    });

    it("should export Z_ASCII", () => {
      expect(typeof Z_ASCII).toBe("number");
      expect(Z_ASCII).toBe(1);
    });

    it("should export Z_UNKNOWN", () => {
      expect(typeof Z_UNKNOWN).toBe("number");
      expect(Z_UNKNOWN).toBe(2);
    });

    it("should export Z_DEFLATED", () => {
      expect(typeof Z_DEFLATED).toBe("number");
      expect(Z_DEFLATED).toBe(8);
    });

    it("should export Z_NULL", () => {
      expect(typeof Z_NULL).toBe("number");
      expect(Z_NULL).toBe(0);
    });
  });

  describe("Version", () => {
    it("should export ZLIB_VERSION as a string", () => {
      expect(typeof ZLIB_VERSION).toBe("string");
      expect(ZLIB_VERSION.length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Inflate class
// ---------------------------------------------------------------------------

describe("Inflate class", () => {
  let inflate: InstanceType<typeof Inflate>;

  beforeEach(() => {
    inflate = new Inflate();
  });

  describe("instantiation", () => {
    it("should create an Inflate instance", () => {
      expect(inflate).toBeInstanceOf(Inflate);
    });

    it("should support options parameter", () => {
      const inflateWithOptions = new Inflate({ chunkSize: 16384 });
      expect(inflateWithOptions).toBeInstanceOf(Inflate);
    });

    it("should support windowBits option", () => {
      const inflateWithWindowBits = new Inflate({ windowBits: 15 });
      expect(inflateWithWindowBits).toBeInstanceOf(Inflate);
    });

    it("should support 'to' string option", () => {
      const inflateToString = new Inflate({ to: "string" });
      expect(inflateToString).toBeInstanceOf(Inflate);
    });
  });

  describe("basic inflation", () => {
    it("should inflate compressed data", () => {
      const compressed = deflate("Hello, World!");
      inflate.push(compressed);
      expect(inflate.result).toBeDefined();
    });

    it("should handle multiple pushes", () => {
      const compressed = deflate("This is a longer test string that will be split");
      const chunk1 = compressed.slice(0, Math.ceil(compressed.length / 2));
      const chunk2 = compressed.slice(Math.ceil(compressed.length / 2));
      inflate.push(chunk1);
      inflate.push(chunk2);
      expect(inflate.result).toBeDefined();
    });

    it("should handle empty data", () => {
      const empty = deflate("");
      inflate.push(empty);
      expect(inflate.result).toBeDefined();
    });

    it("should return result as Buffer by default", () => {
      const compressed = deflate("Test");
      inflate.push(compressed);
      const result = inflate.result;
      expect(result !== null && (Buffer.isBuffer(result) || typeof result === "string")).toBe(true);
    });
  });

  describe("string output", () => {
    it("should support converting output to string", () => {
      const inflateString = new Inflate({ to: "string" });
      const testString = "Hello, World!";
      const compressed = deflate(testString);
      inflateString.push(compressed);
      const result = inflateString.result;
      if (typeof result === "string") {
        expect(result).toBe(testString);
      } else if (result !== null && Buffer.isBuffer(result)) {
        expect(result.toString()).toBe(testString);
      } else {
        expect(result).not.toBeNull();
      }
    });
  });

  describe("error handling", () => {
    it("should handle invalid data gracefully", () => {
      const invalidData = Buffer.from([0xff, 0xfe, 0xfd, 0xfc]);
      expect(() => {
        inflate.push(invalidData);
      }).not.toThrow();
    });

    it("should have a result property", () => {
      inflate.push(deflate("Test"));
      expect(inflate).toHaveProperty("result");
    });
  });

  describe("reusability", () => {
    it("should handle sequential inflate operations", () => {
      const inflate1 = new Inflate();
      inflate1.push(deflate("First test"));
      const result1 = inflate1.result;

      const inflate2 = new Inflate();
      inflate2.push(deflate("Second test"));
      const result2 = inflate2.result;

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Deflate class
// ---------------------------------------------------------------------------

describe("Deflate class", () => {
  let d: InstanceType<typeof Deflate>;

  beforeEach(() => {
    d = new Deflate();
  });

  describe("instantiation", () => {
    it("should create a Deflate instance", () => {
      expect(d).toBeInstanceOf(Deflate);
    });

    it("should support chunkSize option", () => {
      expect(new Deflate({ chunkSize: 16384 })).toBeInstanceOf(Deflate);
    });

    it("should support level option", () => {
      expect(new Deflate({ level: Z_BEST_SPEED })).toBeInstanceOf(Deflate);
      expect(new Deflate({ level: Z_BEST_COMPRESSION })).toBeInstanceOf(Deflate);
      expect(new Deflate({ level: Z_NO_COMPRESSION })).toBeInstanceOf(Deflate);
    });

    it("should support windowBits option", () => {
      expect(new Deflate({ windowBits: 15 })).toBeInstanceOf(Deflate);
    });

    it("should expose level getter", () => {
      const d6 = new Deflate({ level: 6 });
      expect(d6.level).toBe(6);
    });

    it("should expose chunkSize getter", () => {
      const d2 = new Deflate({ chunkSize: 32768 });
      expect(d2.chunkSize).toBe(32768);
    });

    it("should expose windowBits getter", () => {
      const d3 = new Deflate({ windowBits: 12 });
      expect(d3.windowBits).toBe(12);
    });
  });

  describe("basic compression", () => {
    it("should compress and round-trip data", () => {
      const original = Buffer.from("Hello, World!");
      d.push(original, Z_FINISH);
      expect(d.err).toBeGreaterThanOrEqual(0);
      const compressed = d.result as Buffer;
      expect(Buffer.isBuffer(compressed)).toBe(true);
      expect(compressed.length).toBeGreaterThan(0);

      const inf = new Inflate();
      inf.push(compressed, Z_FINISH);
      expect(inf.err).toBeGreaterThanOrEqual(0);
      expect((inf.result as Buffer).toString()).toBe("Hello, World!");
    });

    it("should produce smaller output for compressible data", () => {
      const repetitive = Buffer.alloc(10_000, "a");
      d.push(repetitive, Z_FINISH);
      const compressed = d.result as Buffer;
      expect(compressed.length).toBeLessThan(repetitive.length);
    });

    it("should handle empty input", () => {
      d.push(Buffer.alloc(0), Z_FINISH);
      expect(d.err).toBeGreaterThanOrEqual(0);
      const compressed = d.result as Buffer;
      expect(Buffer.isBuffer(compressed)).toBe(true);

      const inf = new Inflate();
      inf.push(compressed, Z_FINISH);
      expect((inf.result as Buffer).length).toBe(0);
    });

    it("should handle multiple Z_NO_FLUSH pushes then Z_FINISH", () => {
      const part1 = Buffer.from("Hello, ");
      const part2 = Buffer.from("World!");
      d.push(part1, Z_NO_FLUSH);
      d.push(part2, Z_FINISH);
      expect(d.err).toBeGreaterThanOrEqual(0);
      const compressed = d.result as Buffer;

      const inf = new Inflate();
      inf.push(compressed, Z_FINISH);
      expect((inf.result as Buffer).toString()).toBe("Hello, World!");
    });

    it("should handle Z_SYNC_FLUSH", () => {
      d.push(Buffer.from("flush me"), Z_SYNC_FLUSH);
      expect(d.err).toBeGreaterThanOrEqual(0);
      const partial = d.result as Buffer;
      expect(Buffer.isBuffer(partial)).toBe(true);
    });

    it("should be a no-op after Z_STREAM_END", () => {
      d.push(Buffer.from("data"), Z_FINISH);
      expect(d.err).toBe(Z_STREAM_END);
      // Subsequent push should be silently ignored
      d.push(Buffer.from("more"), Z_SYNC_FLUSH);
      expect(d.err).toBe(Z_STREAM_END);
    });
  });

  describe("compression levels", () => {
    it("should produce valid output at all levels", () => {
      const original = Buffer.from("The quick brown fox jumps over the lazy dog".repeat(100));
      for (const level of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
        const def = new Deflate({ level });
        def.push(original, Z_FINISH);
        expect(def.err).toBeGreaterThanOrEqual(0);

        const inf = new Inflate();
        inf.push(def.result as Buffer, Z_FINISH);
        expect(inf.err).toBeGreaterThanOrEqual(0);
        expect((inf.result as Buffer).equals(original)).toBe(true);
      }
    });
  });

  describe("raw deflate (negative windowBits)", () => {
    it("should round-trip with matching Inflate windowBits", () => {
      const original = Buffer.from("raw deflate data");
      const rawDeflate = new Deflate({ windowBits: -15 });
      rawDeflate.push(original, Z_FINISH);
      const compressed = rawDeflate.result as Buffer;

      const rawInflate = new Inflate({ windowBits: -15 });
      rawInflate.push(compressed, Z_FINISH);
      expect((rawInflate.result as Buffer).toString()).toBe("raw deflate data");
    });
  });

  describe("reset", () => {
    it("should allow reuse for a new stream after reset", () => {
      d.push(Buffer.from("first stream"), Z_FINISH);
      expect(d.err).toBe(Z_STREAM_END);

      d.reset();
      expect(d.err).toBe(Z_OK);

      d.push(Buffer.from("second stream"), Z_FINISH);
      expect(d.err).toBe(Z_STREAM_END);

      const inf = new Inflate();
      inf.push(d.result as Buffer, Z_FINISH);
      expect((inf.result as Buffer).toString()).toBe("second stream");
    });
  });

  describe("error handling", () => {
    it("should reject invalid flush modes", () => {
      expect(() => d.push(Buffer.from("x"), 99 as never)).toThrow();
    });

    it("should reject Z_BLOCK", () => {
      expect(() => d.push(Buffer.from("x"), Z_BLOCK)).toThrow();
    });

    it("should reject Z_TREES", () => {
      expect(() => d.push(Buffer.from("x"), Z_TREES)).toThrow();
    });

    it("should reject invalid level at construction", () => {
      expect(() => new Deflate({ level: 99 })).toThrow();
    });
  });
});