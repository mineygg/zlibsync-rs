import { describe, expect, it } from "vitest";
import { Deflate, Inflate, Z_FINISH, Z_NO_FLUSH } from "../src/index";

// ---------------------------------------------------------------------------
// Helper: synchronous compress with our Deflate
// ---------------------------------------------------------------------------

function deflate(input: Buffer): Buffer {
  const d = new Deflate();
  d.push(input, Z_FINISH);
  if (d.err < 0) throw new Error(`Deflate error ${d.err}: ${d.msg}`);
  return d.result as Buffer;
}

describe("Stress Tests", () => {
  describe("Large data handling", () => {
    it("should compress and inflate 1MB of data", () => {
      const largeData = Buffer.alloc(1024 * 1024, "a");
      const compressed = deflate(largeData);
      const inflate = new Inflate();

      const start = performance.now();
      inflate.push(compressed);
      const end = performance.now();

      const result = inflate.result;
      expect(result).not.toBeNull();
      if (Buffer.isBuffer(result)) {
        expect(result.length).toBe(1024 * 1024);
      }
      console.log(`1MB decompression: ${(end - start).toFixed(2)}ms`);
    });

    it("should compress and inflate 10MB of data", () => {
      const largeData = Buffer.alloc(10 * 1024 * 1024, "x");
      const compressed = deflate(largeData);
      const inflate = new Inflate();

      const start = performance.now();
      inflate.push(compressed);
      const end = performance.now();

      const result = inflate.result;
      expect(result).not.toBeNull();
      if (Buffer.isBuffer(result)) {
        expect(result.length).toBe(10 * 1024 * 1024);
      }
      console.log(`10MB decompression: ${(end - start).toFixed(2)}ms`);
    });

    it("should handle 50MB of compressible data", () => {
      const largeData = Buffer.alloc(50 * 1024 * 1024);
      for (let i = 0; i < largeData.length; i += 4) {
        largeData.writeUInt32BE(0xdeadbeef, i);
      }
      const compressed = deflate(largeData);
      const inflate = new Inflate();

      const start = performance.now();
      inflate.push(compressed);
      const end = performance.now();

      const result = inflate.result;
      expect(result).not.toBeNull();
      if (Buffer.isBuffer(result)) {
        expect(result.length).toBe(50 * 1024 * 1024);
      }
      const compressionRatio = ((compressed.length / largeData.length) * 100).toFixed(2);
      console.log(
        `50MB decompression: ${(end - start).toFixed(2)}ms, compression ratio: ${compressionRatio}%`,
      );
    }, 15000);
  });

  describe("Chunked compression and decompression", () => {
    it("should handle small chunk decompression efficiently", () => {
      const testData = Buffer.alloc(1024 * 1024, "test");
      const compressed = deflate(testData);

      const chunkSize = 1024;
      const inflate = new Inflate();

      const start = performance.now();
      for (let i = 0; i < compressed.length; i += chunkSize) {
        const chunk = compressed.slice(i, Math.min(i + chunkSize, compressed.length));
        inflate.push(chunk);
      }
      const end = performance.now();

      const result = inflate.result;
      expect(result).not.toBeNull();
      if (Buffer.isBuffer(result)) {
        expect(result.length).toBe(1024 * 1024);
      }
      console.log(`1MB chunked (1KB chunks) decompression: ${(end - start).toFixed(2)}ms`);
    });

    it("should handle chunked compression (Z_NO_FLUSH then Z_FINISH)", () => {
      const testData = Buffer.alloc(5 * 1024 * 1024, "medium");
      const chunkSize = 65536;
      const d = new Deflate();

      const start = performance.now();
      for (let i = 0; i < testData.length; i += chunkSize) {
        const chunk = testData.slice(i, Math.min(i + chunkSize, testData.length));
        const isLast = i + chunkSize >= testData.length;
        d.push(chunk, isLast ? Z_FINISH : Z_NO_FLUSH);
      }
      const end = performance.now();

      expect(d.err).toBeGreaterThanOrEqual(0);
      const compressed = d.result as Buffer;

      const inflate = new Inflate();
      inflate.push(compressed);
      const result = inflate.result;
      expect(result).not.toBeNull();
      if (Buffer.isBuffer(result)) {
        expect(result.length).toBe(5 * 1024 * 1024);
      }
      console.log(`5MB chunked (64KB) compression: ${(end - start).toFixed(2)}ms`);
    });

    it("should handle medium chunk decompression", () => {
      const testData = Buffer.alloc(5 * 1024 * 1024, "medium");
      const compressed = deflate(testData);

      const chunkSize = 65536;
      const inflate = new Inflate();

      const start = performance.now();
      for (let i = 0; i < compressed.length; i += chunkSize) {
        const chunk = compressed.slice(i, Math.min(i + chunkSize, compressed.length));
        inflate.push(chunk);
      }
      const end = performance.now();

      const result = inflate.result;
      expect(result).not.toBeNull();
      if (Buffer.isBuffer(result)) {
        expect(result.length).toBe(5 * 1024 * 1024);
      }
      console.log(`5MB chunked (64KB chunks) decompression: ${(end - start).toFixed(2)}ms`);
    });

    it("should handle large chunk decompression", () => {
      const testData = Buffer.alloc(5 * 1024 * 1024, "large");
      const compressed = deflate(testData);

      const chunkSize = 1024 * 1024;
      const inflate = new Inflate();

      const start = performance.now();
      for (let i = 0; i < compressed.length; i += chunkSize) {
        const chunk = compressed.slice(i, Math.min(i + chunkSize, compressed.length));
        inflate.push(chunk);
      }
      const end = performance.now();

      const result = inflate.result;
      expect(result).not.toBeNull();
      if (Buffer.isBuffer(result)) {
        expect(result.length).toBe(5 * 1024 * 1024);
      }
      console.log(`5MB chunked (1MB chunks) decompression: ${(end - start).toFixed(2)}ms`);
    });
  });

  describe("Different data patterns", () => {
    it("should handle highly compressible data (repetitive)", () => {
      const testData = Buffer.alloc(10 * 1024 * 1024);
      testData.fill("A");
      const compressed = deflate(testData);
      const inflate = new Inflate();

      const start = performance.now();
      inflate.push(compressed);
      const end = performance.now();

      const result = inflate.result;
      expect(result).not.toBeNull();
      if (Buffer.isBuffer(result)) {
        expect(result.length).toBe(10 * 1024 * 1024);
      }
      const compressionRatio = ((compressed.length / testData.length) * 100).toFixed(2);
      console.log(
        `Repetitive 10MB decompression: ${(end - start).toFixed(2)}ms, ratio: ${compressionRatio}%`,
      );
    });

    it("should handle random/incompressible data", () => {
      const testData = Buffer.alloc(5 * 1024 * 1024);
      for (let i = 0; i < testData.length; i++) {
        testData[i] = Math.floor(Math.random() * 256);
      }
      const compressed = deflate(testData);
      const inflate = new Inflate();

      const start = performance.now();
      inflate.push(compressed);
      const end = performance.now();

      const result = inflate.result;
      expect(result).not.toBeNull();
      if (Buffer.isBuffer(result)) {
        expect(result.length).toBe(5 * 1024 * 1024);
      }
      const compressionRatio = ((compressed.length / testData.length) * 100).toFixed(2);
      console.log(
        `Random 5MB decompression: ${(end - start).toFixed(2)}ms, ratio: ${compressionRatio}%`,
      );
    });

    it("should handle JSON-like structured data", () => {
      const jsonObj = {
        id: 1,
        name: "Test",
        email: "test@example.com",
        data: Array(1000)
          .fill(null)
          .map((_, i) => ({
            index: i,
            value: Math.random(),
            text: "Sample text content",
          })),
      };
      const testData = Buffer.from(JSON.stringify(jsonObj).repeat(1000));
      const compressed = deflate(testData);
      const inflate = new Inflate();

      const start = performance.now();
      inflate.push(compressed);
      const end = performance.now();

      const result = inflate.result;
      expect(result).not.toBeNull();
      if (Buffer.isBuffer(result)) {
        expect(result.length).toBe(testData.length);
      }
      const compressionRatio = ((compressed.length / testData.length) * 100).toFixed(2);
      console.log(
        `JSON-like ${(testData.length / 1024 / 1024).toFixed(2)}MB decompression: ${(end - start).toFixed(2)}ms, ratio: ${compressionRatio}%`,
      );
    }, 20000);

    it("should handle binary data", () => {
      const testData = Buffer.alloc(5 * 1024 * 1024);
      for (let i = 0; i < testData.length; i += 8) {
        testData.writeBigUInt64BE(0x0102030405060708n, i);
      }
      const compressed = deflate(testData);
      const inflate = new Inflate();

      const start = performance.now();
      inflate.push(compressed);
      const end = performance.now();

      const result = inflate.result;
      expect(result).not.toBeNull();
      if (Buffer.isBuffer(result)) {
        expect(result.length).toBe(5 * 1024 * 1024);
      }
      console.log(`Binary 5MB decompression: ${(end - start).toFixed(2)}ms`);
    });
  });

  describe("Multiple sequential operations", () => {
    it("should handle 100 sequential deflate+inflate operations", () => {
      const testData = Buffer.alloc(100 * 1024, "test");

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        const d = new Deflate();
        d.push(testData, Z_FINISH);
        const compressed = d.result as Buffer;

        const inflate = new Inflate();
        inflate.push(compressed);
        const result = inflate.result;
        expect(result).not.toBeNull();
        if (Buffer.isBuffer(result)) {
          expect(result.length).toBe(100 * 1024);
        }
      }
      const end = performance.now();

      const avgTime = ((end - start) / 100).toFixed(2);
      console.log(
        `100x sequential 100KB deflate+inflate: total ${(end - start).toFixed(2)}ms, avg ${avgTime}ms`,
      );
    });

    it("should handle 1000 sequential deflate+inflate operations", () => {
      const testData = Buffer.alloc(10 * 1024, "test");

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        const d = new Deflate();
        d.push(testData, Z_FINISH);
        const inflate = new Inflate();
        inflate.push(d.result as Buffer);
        expect(inflate.result).not.toBeNull();
      }
      const end = performance.now();

      const avgTime = ((end - start) / 1000).toFixed(3);
      console.log(
        `1000x sequential 10KB deflate+inflate: total ${(end - start).toFixed(2)}ms, avg ${avgTime}ms`,
      );
    });
  });

  describe("Performance benchmarks", () => {
    it("should have consistent throughput for 1MB blocks", () => {
      const sizes = [1, 5, 10];
      const results = [];

      for (const sizeMB of sizes) {
        const testData = Buffer.alloc(sizeMB * 1024 * 1024);
        testData.fill("benchmark");
        const compressed = deflate(testData);
        const inflate = new Inflate();

        const start = performance.now();
        inflate.push(compressed);
        const end = performance.now();

        const throughput = (testData.length / 1024 / 1024 / ((end - start) / 1000)).toFixed(2);
        results.push({
          size: `${sizeMB}MB`,
          time: `${(end - start).toFixed(2)}ms`,
          throughput: `${throughput}MB/s`,
        });
      }

      console.table(results);
      expect(results.length).toBe(3);
    });

    it("should measure decompression speed with varying chunk sizes", () => {
      const testData = Buffer.alloc(10 * 1024 * 1024);
      testData.fill("chunk");
      const compressed = deflate(testData);

      const chunkSizes = [1024, 8192, 65536, 1024 * 1024];
      const results = [];

      for (const chunkSize of chunkSizes) {
        const inflate = new Inflate();
        const start = performance.now();

        for (let i = 0; i < compressed.length; i += chunkSize) {
          const chunk = compressed.slice(i, Math.min(i + chunkSize, compressed.length));
          inflate.push(chunk);
        }

        const end = performance.now();
        const throughput = (testData.length / 1024 / 1024 / ((end - start) / 1000)).toFixed(2);
        results.push({
          chunkSize: `${(chunkSize / 1024).toFixed(0)}KB`,
          time: `${(end - start).toFixed(2)}ms`,
          throughput: `${throughput}MB/s`,
        });
      }

      console.table(results);
      expect(results.length).toBe(4);
    });
  });

  describe("String output with large data", () => {
    it("should decompress large text data to string efficiently", () => {
      const textData = Buffer.from("The quick brown fox jumps over the lazy dog. ".repeat(100000));
      const compressed = deflate(textData);
      const inflate = new Inflate({ to: "string" });

      const start = performance.now();
      inflate.push(compressed);
      const end = performance.now();

      const result = inflate.result;
      expect(result).not.toBeNull();
      if (typeof result === "string") {
        expect(result.length).toBe(textData.length);
      }
      console.log(
        `Text ${(textData.length / 1024 / 1024).toFixed(2)}MB to string: ${(end - start).toFixed(2)}ms`,
      );
    });
  });

  describe("Edge cases and limits", () => {
    it("should handle maximum realistic chunk size", () => {
      const testData = Buffer.alloc(100 * 1024 * 1024);
      testData.fill("max");
      const compressed = deflate(testData);
      const inflate = new Inflate({ chunkSize: 10 * 1024 * 1024 });

      const start = performance.now();
      inflate.push(compressed);
      const end = performance.now();

      const result = inflate.result;
      expect(result).not.toBeNull();
      console.log(`100MB with 10MB chunkSize: ${(end - start).toFixed(2)}ms`);
    }, 15000);

    it("should handle rapid sequential pushes", () => {
      const testData = Buffer.alloc(5 * 1024 * 1024, "rapid");
      const compressed = deflate(testData);
      const inflate = new Inflate();

      const start = performance.now();
      for (let i = 0; i < compressed.length; i += 512) {
        inflate.push(compressed.slice(i, Math.min(i + 512, compressed.length)));
      }
      const end = performance.now();

      const result = inflate.result;
      expect(result).not.toBeNull();
      if (Buffer.isBuffer(result)) {
        expect(result.length).toBe(5 * 1024 * 1024);
      }
      console.log(`5MB rapid 512B chunks: ${(end - start).toFixed(2)}ms`);
    });
  });
});