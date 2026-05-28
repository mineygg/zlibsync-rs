import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { Inflate, Z_FINISH, Z_SYNC_FLUSH } from "../src/index";

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
        // If it accepts Uint8Array, it shouldn't crash.
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
  });

  describe("Corrupted and Malformed Data", () => {
    it("should gracefully handle randomly generated garbage bytes", () => {
      const inflate = new Inflate();
      const garbage = Buffer.alloc(1024);
      for (let i = 0; i < garbage.length; i++) {
        garbage[i] = Math.floor(Math.random() * 256);
      }

      expect(() => {
        inflate.push(garbage, Z_SYNC_FLUSH);
      }).not.toThrow();

      // Usually Z_DATA_ERROR (-3) or similar
      expect(inflate.err).toBeLessThan(0);
    });

    it("should handle truncated valid zlib data", () => {
      const testData = Buffer.from(
        "Hello world, this is a test string to be truncated. ".repeat(10),
      );
      const compressed = deflateSync(testData);
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
    it("should handle pushing data after stream is finished", () => {
      const testData = Buffer.from("Final data");
      const compressed = deflateSync(testData);

      const inflate = new Inflate();
      inflate.push(compressed, Z_FINISH);
      expect(inflate.err).toBeGreaterThanOrEqual(0);

      // Now push more data to a finished stream
      const moreData = deflateSync(Buffer.from("More data"));
      expect(() => {
        inflate.push(moreData, Z_SYNC_FLUSH);
      }).not.toThrow();
    });

    it("should handle pushing empty buffers with finish flag", () => {
      const inflate = new Inflate();
      expect(() => {
        inflate.push(Buffer.alloc(0), Z_FINISH);
      }).not.toThrow();
    });
  });
});
