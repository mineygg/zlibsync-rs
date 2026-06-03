import { describe, expect, it, beforeEach } from "vitest";
import { Deflate, Inflate, Z_NO_FLUSH, Z_SYNC_FLUSH } from "../src/index";

// ---------------------------------------------------------------------------
// Background
//
// Discord's gateway uses a single persistent zlib stream for the lifetime of
// a WebSocket connection.  The server never sends Z_FINISH — instead every
// outbound message ends with a Z_SYNC_FLUSH, which produces the 4-byte
// trailer [0x00, 0x00, 0xFF, 0xFF].  The client must:
//
//   1. Feed every incoming chunk into the *same* Inflate instance.
//   2. Detect the sync-flush suffix to know a full message has arrived.
//   3. Call inflate.push(chunk, Z_SYNC_FLUSH) at that boundary to flush the
//      decompressed output.
//   4. Carry the decompression *dictionary* forward — the next message may
//      reference back-references from previous messages, so creating a fresh
//      Inflate per message produces corrupt output.
//
// Node's zlib.inflateSync() fails here because it expects a self-contained
// stream and has no persistent dictionary.
//
// References:
//   https://discord.com/developers/docs/topics/gateway#transport-compression
// ---------------------------------------------------------------------------

const ZLIB_SUFFIX = Buffer.from([0x00, 0x00, 0xff, 0xff]);

// ---------------------------------------------------------------------------
// Simulator helpers
// ---------------------------------------------------------------------------

/**
 * A stateful server-side compressor that mimics Discord's gateway:
 * one Deflate stream, many Z_SYNC_FLUSH-terminated messages.
 *
 * Returns an array of network packets (Buffers) — one per message,
 * each ending with the 4-byte sync-flush suffix.
 */
class MockGateway {
  private deflate = new Deflate();
  /** All packets emitted so far, so tests can simulate partial delivery. */
  readonly packets: Buffer[] = [];

  /** "Send" a message: compress it and record the packet. */
  send(payload: object): Buffer {
    const raw = Buffer.from(JSON.stringify(payload));
    this.deflate.push(raw, Z_SYNC_FLUSH);
    if (this.deflate.err < 0) {
      throw new Error(`MockGateway deflate error ${this.deflate.err}: ${this.deflate.msg}`);
    }
    const packet = this.deflate.result as Buffer;
    this.packets.push(packet);
    return packet;
  }

  /** Send a message as multiple network fragments (simulates TCP segmentation). */
  sendFragmented(payload: object, fragmentSize: number): Buffer[] {
    const packet = this.send(payload);
    const fragments: Buffer[] = [];
    for (let i = 0; i < packet.length; i += fragmentSize) {
      fragments.push(packet.slice(i, Math.min(i + fragmentSize, packet.length)));
    }
    return fragments;
  }
}

/**
 * A stateful client-side decompressor that mimics a Discord client.
 * Buffers incoming bytes, detects the sync-flush suffix, and flushes.
 */
class MockClient {
  private inflate = new Inflate();
  private buffer = Buffer.alloc(0);
  readonly messages: string[] = [];

  receive(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    // Check for the 4-byte sync-flush suffix at the end of the buffer.
    if (
      this.buffer.length >= 4 &&
      this.buffer.slice(-4).equals(ZLIB_SUFFIX)
    ) {
      this.inflate.push(this.buffer, Z_SYNC_FLUSH);
      if (this.inflate.err < 0) {
        throw new Error(`Client inflate error ${this.inflate.err}: ${this.inflate.msg}`);
      }
      this.messages.push((this.inflate.result as Buffer).toString("utf8"));
      this.buffer = Buffer.alloc(0);
    }
  }

  get err(): number {
    return this.inflate.err;
  }

  reset(): void {
    this.inflate.reset();
    this.buffer = Buffer.alloc(0);
    (this.messages as string[]).length = 0;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Discord gateway zlib-stream simulation", () => {
  let gateway: MockGateway;
  let client: MockClient;

  beforeEach(() => {
    gateway = new MockGateway();
    client = new MockClient();
  });

  // -------------------------------------------------------------------------
  // Core streaming correctness
  // -------------------------------------------------------------------------

  describe("stateful streaming", () => {
    it("should decompress a single message correctly", () => {
      const payload = { op: 10, d: { heartbeat_interval: 41250 } };
      client.receive(gateway.send(payload));
      expect(client.messages).toHaveLength(1);
      expect(JSON.parse(client.messages[0])).toEqual(payload);
    });

    it("should carry dictionary state across multiple messages", () => {
      // The critical test: later messages reference earlier ones via back-refs.
      // A fresh Inflate per message would fail to decompress them.
      const payloads = [
        { op: 0, s: 1, t: "READY", d: { v: 10, user: { id: "123", username: "testbot" } } },
        { op: 0, s: 2, t: "GUILD_CREATE", d: { id: "456", name: "Test Guild", member_count: 42 } },
        { op: 0, s: 3, t: "MESSAGE_CREATE", d: { id: "789", content: "hello", author: { id: "123", username: "testbot" } } },
        { op: 0, s: 4, t: "MESSAGE_CREATE", d: { id: "790", content: "world", author: { id: "123", username: "testbot" } } },
      ];

      for (const payload of payloads) {
        client.receive(gateway.send(payload));
      }

      expect(client.messages).toHaveLength(4);
      for (let i = 0; i < payloads.length; i++) {
        expect(JSON.parse(client.messages[i])).toEqual(payloads[i]);
      }
    });

    it("should exploit cross-message back-references (compression ratio test)", () => {
      // If the stream is truly stateful, repeated fields across messages should
      // compress better than independent streams would.
      const payloads = Array.from({ length: 20 }, (_, i) => ({
        op: 0,
        s: i,
        t: "MESSAGE_CREATE",
        d: { id: String(800 + i), content: `message ${i}`, guild_id: "456", channel_id: "101", author: { id: "123", username: "testbot" } },
      }));

      let totalCompressed = 0;
      let totalRaw = 0;

      for (const payload of payloads) {
        const packet = gateway.send(payload);
        totalCompressed += packet.length;
        totalRaw += Buffer.from(JSON.stringify(payload)).length;
        client.receive(packet);
      }

      expect(client.messages).toHaveLength(20);
      // A stateful stream should compress the repeated structure well.
      // Independent streams would be near 1:1 for small payloads.
      expect(totalCompressed).toBeLessThan(totalRaw);

      for (let i = 0; i < payloads.length; i++) {
        expect(JSON.parse(client.messages[i])).toEqual(payloads[i]);
      }
    });

    it("should handle 1000 sequential gateway messages", () => {
      const count = 1000;
      const payloads = Array.from({ length: count }, (_, i) => ({
        op: 0, s: i, t: "MESSAGE_CREATE",
        d: { id: String(i), content: `msg ${i}`, author: { id: "42", username: "bot" } },
      }));

      for (const p of payloads) client.receive(gateway.send(p));

      expect(client.messages).toHaveLength(count);
      for (let i = 0; i < count; i++) {
        expect(JSON.parse(client.messages[i])).toEqual(payloads[i]);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Why node:zlib inflateSync would fail here
  // -------------------------------------------------------------------------

  describe("why a fresh-instance-per-message approach breaks", () => {
    it("should fail to decompress message 2+ with a new Inflate instance each time", () => {
      // Establish dictionary state in the gateway by sending message 1.
      const p1 = { op: 0, s: 1, t: "READY", d: { user: { id: "1", username: "bot" } } };
      const packet1 = gateway.send(p1);

      // Message 2 may contain back-references into message 1's dictionary.
      const p2 = { op: 0, s: 2, t: "READY", d: { user: { id: "1", username: "bot" }, session_id: "abc" } };
      const packet2 = gateway.send(p2);

      // Correct: stateful client sees both fine.
      client.receive(packet1);
      client.receive(packet2);
      expect(client.messages).toHaveLength(2);
      expect(JSON.parse(client.messages[1])).toEqual(p2);

      // Wrong: naive approach — fresh Inflate for packet2 only, no prior context.
      const naiveInflate = new Inflate();
      naiveInflate.push(packet2, Z_SYNC_FLUSH);
      // Either errors or produces garbage (not valid JSON).
      const naiveResult = naiveInflate.err < 0
        ? null
        : (naiveInflate.result as Buffer).toString("utf8");

      const isGarbage = naiveResult === null || (() => {
        try { JSON.parse(naiveResult); return false; }
        catch { return true; }
      })();

      expect(isGarbage).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // TCP fragmentation
  // -------------------------------------------------------------------------

  describe("fragmented delivery (TCP segmentation)", () => {
    it("should reassemble a message split across two chunks", () => {
      const payload = { op: 0, s: 1, t: "READY", d: { v: 10 } };
      const packet = gateway.send(payload);

      // Split at an arbitrary byte boundary (not at the suffix).
      const split = Math.max(1, Math.floor(packet.length / 2));
      client.receive(packet.slice(0, split));
      // First half should not yet produce a message (suffix not yet received).
      expect(client.messages).toHaveLength(0);
      client.receive(packet.slice(split));
      expect(client.messages).toHaveLength(1);
      expect(JSON.parse(client.messages[0])).toEqual(payload);
    });

    it("should reassemble messages split into many small fragments", () => {
      const payload = { op: 0, s: 1, t: "GUILD_CREATE", d: { id: "1", name: "x".repeat(500) } };
      const fragments = gateway.sendFragmented(payload, 16);

      for (const fragment of fragments) {
        client.receive(fragment);
      }

      expect(client.messages).toHaveLength(1);
      expect(JSON.parse(client.messages[0])).toEqual(payload);
    });

    it("should handle multiple messages each fragmented independently", () => {
      const payloads = Array.from({ length: 5 }, (_, i) => ({
        op: 0, s: i, t: "MESSAGE_CREATE", d: { content: `msg ${i}` },
      }));

      for (const payload of payloads) {
        for (const fragment of gateway.sendFragmented(payload, 8)) {
          client.receive(fragment);
        }
      }

      expect(client.messages).toHaveLength(5);
      for (let i = 0; i < payloads.length; i++) {
        expect(JSON.parse(client.messages[i])).toEqual(payloads[i]);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Mixed flush / no-flush compression (multi-chunk payload)
  // -------------------------------------------------------------------------

  describe("large payloads compressed with Z_NO_FLUSH + Z_SYNC_FLUSH", () => {
    it("should correctly decompress a large payload sent in deflate chunks", () => {
      // Simulate the server compressing a large payload in 4KB deflate chunks
      // before the final Z_SYNC_FLUSH, as a real zlib implementation might.
      const largePayload = {
        op: 0, s: 1, t: "GUILD_CREATE",
        d: {
          id: "1",
          members: Array.from({ length: 200 }, (_, i) => ({
            user: { id: String(i), username: `user_${i}` },
            roles: ["role1", "role2"],
            joined_at: "2024-01-01T00:00:00.000Z",
          })),
        },
      };

      const raw = Buffer.from(JSON.stringify(largePayload));
      const chunkSize = 4096;
      const serverDeflate = new Deflate();

      // Push all but the last chunk with Z_NO_FLUSH.
      let combinedPacket = Buffer.alloc(0);
      for (let i = 0; i < raw.length; i += chunkSize) {
        const chunk = raw.slice(i, Math.min(i + chunkSize, raw.length));
        const isLast = i + chunkSize >= raw.length;
        serverDeflate.push(chunk, isLast ? Z_SYNC_FLUSH : Z_NO_FLUSH);
        if (serverDeflate.err < 0) throw new Error("server deflate error");
        const result = serverDeflate.result;

        if (result) {
          combinedPacket = Buffer.concat([combinedPacket, result as Buffer]);
        }
      }

      // The combined packet must end with the sync-flush suffix.
      expect(combinedPacket.slice(-4).equals(ZLIB_SUFFIX)).toBe(true);

      client.receive(combinedPacket);
      expect(client.messages).toHaveLength(1);
      expect(JSON.parse(client.messages[0])).toEqual(largePayload);
    });
  });

  // -------------------------------------------------------------------------
  // Reconnect / reset
  // -------------------------------------------------------------------------

  describe("reconnect handling (reset)", () => {
    it("should correctly decompress after reset following a clean session", () => {
      // Session 1: exchange a few messages to build up dictionary state.
      const session1 = [
        { op: 10, d: { heartbeat_interval: 41250 } },
        { op: 0, s: 1, t: "READY", d: { v: 10, session_id: "old-session" } },
      ];
      for (const p of session1) client.receive(gateway.send(p));
      expect(client.messages).toHaveLength(2);

      // Reconnect: both sides reset their streams.
      client.reset();
      gateway = new MockGateway(); // server opens a new stream too

      // Session 2: fresh stream, no shared dictionary.
      const session2 = [
        { op: 10, d: { heartbeat_interval: 41250 } },
        { op: 0, s: 1, t: "READY", d: { v: 10, session_id: "new-session" } },
        { op: 0, s: 2, t: "MESSAGE_CREATE", d: { content: "post-reconnect" } },
      ];
      for (const p of session2) client.receive(gateway.send(p));
      expect(client.messages).toHaveLength(3);
      for (let i = 0; i < session2.length; i++) {
        expect(JSON.parse(client.messages[i])).toEqual(session2[i]);
      }
    });

    it("should discard in-flight buffered bytes on reset", () => {
      const payload = { op: 0, s: 1, t: "READY", d: { v: 10 } };
      const packet = gateway.send(payload);

      // Deliver only the first half — message is buffered but not flushed.
      client.receive(packet.slice(0, Math.floor(packet.length / 2)));
      expect(client.messages).toHaveLength(0);

      // Reconnect mid-message.
      client.reset();
      gateway = new MockGateway();

      // New session should work cleanly.
      const p2 = { op: 10, d: { heartbeat_interval: 41250 } };
      client.receive(gateway.send(p2));
      expect(client.messages).toHaveLength(1);
      expect(JSON.parse(client.messages[0])).toEqual(p2);
    });
  });

  // -------------------------------------------------------------------------
  // Heartbeat / real Discord op codes
  // -------------------------------------------------------------------------

  describe("realistic Discord op sequence", () => {
    it("should handle a full connection lifecycle", () => {
      const sequence = [
        // Server hello
        { op: 10, d: { heartbeat_interval: 41250 } },
        // Client identifies (would be sent, not received — skip)
        // Dispatch: READY
        { op: 0, s: 1, t: "READY", d: { v: 10, user: { id: "123", username: "bot" }, guilds: [], session_id: "abc123", resume_gateway_url: "wss://gateway.discord.gg" } },
        // Heartbeat ACK
        { op: 11 },
        // Dispatch: GUILD_CREATE x3
        { op: 0, s: 2, t: "GUILD_CREATE", d: { id: "111", name: "Guild One", member_count: 100 } },
        { op: 0, s: 3, t: "GUILD_CREATE", d: { id: "222", name: "Guild Two", member_count: 200 } },
        { op: 0, s: 4, t: "GUILD_CREATE", d: { id: "333", name: "Guild Three", member_count: 300 } },
        // Heartbeat ACK
        { op: 11 },
        // Dispatch: MESSAGE_CREATE
        { op: 0, s: 5, t: "MESSAGE_CREATE", d: { id: "999", content: "!ping", guild_id: "111", channel_id: "444", author: { id: "456", username: "user" } } },
        // Dispatch: TYPING_START
        { op: 0, s: 6, t: "TYPING_START", d: { channel_id: "444", guild_id: "111", user_id: "123" } },
      ];

      for (const event of sequence) {
        client.receive(gateway.send(event));
      }

      expect(client.messages).toHaveLength(sequence.length);
      for (let i = 0; i < sequence.length; i++) {
        expect(JSON.parse(client.messages[i])).toEqual(sequence[i]);
      }
    });
  });
});