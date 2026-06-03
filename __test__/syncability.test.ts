import { describe, expect, it } from "vitest";
import { Deflate, Inflate, Z_FINISH, Z_SYNC_FLUSH } from "../src/index";

// ---------------------------------------------------------------------------
// Helper: synchronous compress with our Deflate
// ---------------------------------------------------------------------------

function deflate(input: string | Buffer): Buffer {
  const data = typeof input === "string" ? Buffer.from(input) : input;
  const d = new Deflate();
  d.push(data, Z_FINISH);
  if (d.err < 0) throw new Error(`Deflate error ${d.err}: ${d.msg}`);
  return d.result as Buffer;
}

describe("Syncability & Edge Cases", () => {
  describe("Invalid Input Formats", () => {
    it("should throw TypeError when pushed string instead of Buffer", () => {
      const inflate = new Inflate();
      expect(() => {
        // @ts-expect-error - intentionally passing wrong type
        inflate.push("this is a string, not a buffer", Z_SYNC_FLUSH);
      }).toThrowError(/Failed to/);
    });

    it("should throw TypeError for null or undefined", () => {
      const inflate = new Inflate();
      expect(() => {
        // @ts-expect-error
        inflate.push(null, Z_SYNC_FLUSH);
      }).toThrowError(/Failed to/);

      expect(() => {
        // @ts-expect-error
        inflate.push(undefined, Z_SYNC_FLUSH);
      }).toThrowError(/Failed to/);
    });

    it("should throw TypeError for plain objects", () => {
      const inflate = new Inflate();
      expect(() => {
        // @ts-expect-error
        inflate.push({ data: [1, 2, 3] }, Z_SYNC_FLUSH);
      }).toThrowError(/Failed to/);
    });

    it("should handle ArrayBuffer safely", () => {
      const inflate = new Inflate();
      const arr = new Uint8Array([1, 2, 3, 4]);
      try {
        // @ts-expect-error
        inflate.push(arr, Z_SYNC_FLUSH);
        expect(inflate.err).toBeDefined();
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
      }
    });

    it("should handle Empty Buffer without crashing", () => {
      const inflate = new Inflate();
      expect(() => {
        inflate.push(Buffer.alloc(0), Z_SYNC_FLUSH);
      }).not.toThrow();
      expect(typeof inflate.err).toBe("number");
    });

    // --- Deflate mirrors ---

    it("should throw TypeError when Deflate is pushed a string instead of Buffer", () => {
      const d = new Deflate();
      expect(() => {
        // @ts-expect-error
        d.push("not a buffer", Z_SYNC_FLUSH);
      }).toThrowError(/Failed to/);
    });

    it("should throw TypeError when Deflate is pushed null", () => {
      const d = new Deflate();
      expect(() => {
        // @ts-expect-error
        d.push(null, Z_SYNC_FLUSH);
      }).toThrowError(/Failed to/);
    });

    it("should handle Empty Buffer in Deflate without crashing", () => {
      const d = new Deflate();
      expect(() => {
        d.push(Buffer.alloc(0), Z_SYNC_FLUSH);
      }).not.toThrow();
      expect(typeof d.err).toBe("number");
    });
  });

  describe("Corrupted and Malformed Data", () => {
    it("should gracefully handle randomly generated garbage bytes in Inflate", () => {
      const inflate = new Inflate();
      const garbage = Buffer.alloc(1024);
      for (let i = 0; i < garbage.length; i++) {
        garbage[i] = Math.floor(Math.random() * 256);
      }
      expect(() => {
        inflate.push(garbage, Z_SYNC_FLUSH);
      }).not.toThrow();
      expect(inflate.err).toBeLessThan(0);
    });

    it("should handle truncated valid zlib data", () => {
      const testData = Buffer.from(
        "Hello world, this is a test string to be truncated. ".repeat(10),
      );
      const compressed = deflate(testData);
      const truncated = compressed.slice(0, Math.floor(compressed.length / 2));

      const inflate = new Inflate();
      expect(() => {
        inflate.push(truncated, Z_SYNC_FLUSH);
      }).not.toThrow();
      expect(inflate.err).toBeLessThanOrEqual(0);
    });

    it("should handle multiple pushes of invalid data without panicking", () => {
      const inflate = new Inflate();
      const garbage1 = Buffer.from([0x00, 0xff, 0x55, 0xaa]);
      const garbage2 = Buffer.from([0x11, 0x22, 0x33, 0x44]);
      expect(() => {
        inflate.push(garbage1, Z_SYNC_FLUSH);
        inflate.push(garbage2, Z_SYNC_FLUSH);
      }).not.toThrow();
      expect(inflate.err).toBeLessThan(0);
    });
  });

  describe("State Edge Cases", () => {
    it("should handle pushing data after Inflate stream is finished", () => {
      const compressed = deflate("Final data");

      const inflate = new Inflate();
      inflate.push(compressed, Z_FINISH);
      expect(inflate.err).toBeGreaterThanOrEqual(0);

      const moreData = deflate("More data");
      expect(() => {
        inflate.push(moreData, Z_SYNC_FLUSH);
      }).not.toThrow();
    });

    it("should handle pushing empty buffers with finish flag in Inflate", () => {
      const inflate = new Inflate();
      expect(() => {
        inflate.push(Buffer.alloc(0), Z_FINISH);
      }).not.toThrow();
    });

    it("should handle pushing data after Deflate stream is finished", () => {
      const d = new Deflate();
      d.push(Buffer.from("Final data"), Z_FINISH);
      expect(d.err).toBeGreaterThanOrEqual(0);

      // Subsequent push should be a no-op
      expect(() => {
        d.push(Buffer.from("More data"), Z_SYNC_FLUSH);
      }).not.toThrow();
    });

    it("should handle pushing empty buffers with finish flag in Deflate", () => {
      const d = new Deflate();
      expect(() => {
        d.push(Buffer.alloc(0), Z_FINISH);
      }).not.toThrow();
    });
  });
});