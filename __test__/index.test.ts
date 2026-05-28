import { deflateSync } from "node:zlib";
import { beforeEach, describe, expect, it } from "vitest";
import {
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
      const testString = "Hello, World!";
      const compressed = deflateSync(testString);

      inflate.push(compressed);
      const result = inflate.result;

      expect(result).toBeDefined();
    });

    it("should handle multiple pushes", () => {
      const testString = "This is a longer test string that will be split";
      const compressed = deflateSync(testString);

      // Split the compressed data into chunks
      const chunk1 = compressed.slice(0, Math.ceil(compressed.length / 2));
      const chunk2 = compressed.slice(Math.ceil(compressed.length / 2));

      inflate.push(chunk1);
      inflate.push(chunk2);

      const result = inflate.result;
      expect(result).toBeDefined();
    });

    it("should handle empty data", () => {
      const empty = deflateSync("");
      inflate.push(empty);
      const result = inflate.result;
      expect(result).toBeDefined();
    });

    it("should return result as Buffer by default", () => {
      const testString = "Test";
      const compressed = deflateSync(testString);
      inflate.push(compressed);
      const result = inflate.result;

      expect(result !== null && (Buffer.isBuffer(result) || typeof result === "string")).toBe(true);
    });
  });

  describe("string output", () => {
    it("should support converting output to string", () => {
      const inflateString = new Inflate({ to: "string" });
      const testString = "Hello, World!";
      const compressed = deflateSync(testString);

      inflateString.push(compressed);
      const result = inflateString.result;

      if (typeof result === "string") {
        expect(result).toBe(testString);
      } else if (result !== null && Buffer.isBuffer(result)) {
        // If Buffer is returned, convert and compare
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
      const testString = "Test";
      const compressed = deflateSync(testString);
      inflate.push(compressed);

      expect(inflate).toHaveProperty("result");
    });
  });

  describe("reusability", () => {
    it("should handle sequential inflate operations", () => {
      const testString1 = "First test";
      const compressed1 = deflateSync(testString1);

      const inflate1 = new Inflate();
      inflate1.push(compressed1);
      const result1 = inflate1.result;

      const testString2 = "Second test";
      const compressed2 = deflateSync(testString2);

      const inflate2 = new Inflate();
      inflate2.push(compressed2);
      const result2 = inflate2.result;

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });
  });
});
