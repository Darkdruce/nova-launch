/**
 * Tests for IPFS CID content-address verification.
 *
 * Verifies that verifyCIDContent detects matching content (no error),
 * catches mismatches, and handles gateway failures gracefully.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "crypto";
import {
  verifyCIDContent,
  verifyMetadataCID,
  CIDMismatchError,
} from "../lib/ipfs/cidVerification";

const GATEWAY = "https://gateway.pinata.cloud/ipfs";
const TEST_CID = "QmTestCid123";

// Helper to build a mock fetch response with a standalone ArrayBuffer (avoids
// Node.js Buffer pool aliasing issues when body.buffer is a shared pool).
function mockFetch(body: Buffer, ok = true, status = 200): typeof fetch {
  const ab = new ArrayBuffer(body.length);
  new Uint8Array(ab).set(body);
  return vi.fn().mockResolvedValueOnce({
    ok,
    status,
    arrayBuffer: () => Promise.resolve(ab),
  } as unknown as Response);
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("verifyCIDContent", () => {
  describe("matching content", () => {
    it("resolves without error when gateway content matches the upload", async () => {
      const content = Buffer.from("hello ipfs");
      global.fetch = mockFetch(content);

      await expect(
        verifyCIDContent(content, TEST_CID, GATEWAY)
      ).resolves.toBeUndefined();
    });

    it("uses the correct gateway URL", async () => {
      const content = Buffer.from("data");
      const spy = mockFetch(content);
      global.fetch = spy;

      await verifyCIDContent(content, TEST_CID, GATEWAY);

      expect(spy).toHaveBeenCalledWith(`${GATEWAY}/${TEST_CID}`);
    });
  });

  describe("mismatching content", () => {
    it("throws CIDMismatchError when gateway returns different content", async () => {
      const uploaded = Buffer.from("original content");
      const different = Buffer.from("tampered content");
      global.fetch = mockFetch(different);

      await expect(
        verifyCIDContent(uploaded, TEST_CID, GATEWAY)
      ).rejects.toThrow(CIDMismatchError);
    });

    it("includes the CID in the error message", async () => {
      const uploaded = Buffer.from("a");
      const different = Buffer.from("b");
      global.fetch = mockFetch(different);

      await expect(
        verifyCIDContent(uploaded, TEST_CID, GATEWAY)
      ).rejects.toThrow(TEST_CID);
    });

    it("includes sha256 hashes in the error for diagnosis", async () => {
      const uploaded = Buffer.from("original");
      const different = Buffer.from("modified");
      global.fetch = mockFetch(different);

      const originalHash = createHash("sha256").update(uploaded).digest("hex");

      await expect(
        verifyCIDContent(uploaded, TEST_CID, GATEWAY)
      ).rejects.toThrow(originalHash);
    });
  });

  describe("gateway failures", () => {
    it("throws CIDMismatchError when the gateway returns a non-2xx status", async () => {
      const content = Buffer.from("data");
      global.fetch = mockFetch(content, false, 404);

      await expect(
        verifyCIDContent(content, TEST_CID, GATEWAY)
      ).rejects.toThrow(CIDMismatchError);
    });

    it("error message includes the HTTP status on gateway failure", async () => {
      const content = Buffer.from("data");
      global.fetch = mockFetch(content, false, 503);

      await expect(
        verifyCIDContent(content, TEST_CID, GATEWAY)
      ).rejects.toThrow("503");
    });

    it("throws CIDMismatchError on a network-level fetch error", async () => {
      const content = Buffer.from("data");
      global.fetch = vi.fn().mockRejectedValueOnce(new Error("network error"));

      await expect(
        verifyCIDContent(content, TEST_CID, GATEWAY)
      ).rejects.toThrow(CIDMismatchError);
    });

    it("wraps the original error message in the CIDMismatchError", async () => {
      const content = Buffer.from("data");
      global.fetch = vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED"));

      await expect(
        verifyCIDContent(content, TEST_CID, GATEWAY)
      ).rejects.toThrow("ECONNREFUSED");
    });
  });
});

describe("verifyMetadataCID", () => {
  it("resolves when serialised JSON matches gateway content", async () => {
    const metadata = { name: "My Token", decimals: 7 };
    const content = Buffer.from(JSON.stringify(metadata));
    global.fetch = mockFetch(content);

    await expect(
      verifyMetadataCID(metadata, TEST_CID, GATEWAY)
    ).resolves.toBeUndefined();
  });

  it("throws CIDMismatchError when gateway returns different JSON", async () => {
    const metadata = { name: "Token A" };
    const tampered = Buffer.from(JSON.stringify({ name: "Token B" }));
    global.fetch = mockFetch(tampered);

    await expect(
      verifyMetadataCID(metadata, TEST_CID, GATEWAY)
    ).rejects.toThrow(CIDMismatchError);
  });

  it("serialises with JSON.stringify before comparing", async () => {
    const metadata = { z: 2, a: 1 };
    // JSON.stringify preserves insertion order: {"z":2,"a":1}
    const content = Buffer.from(JSON.stringify(metadata));
    global.fetch = mockFetch(content);

    await expect(
      verifyMetadataCID(metadata, TEST_CID, GATEWAY)
    ).resolves.toBeUndefined();
  });
});
