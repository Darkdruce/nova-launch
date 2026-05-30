import { createHash } from "crypto";

export class CIDMismatchError extends Error {
  constructor(
    public readonly cid: string,
    public readonly detail: string
  ) {
    super(
      `IPFS CID integrity check failed for "${cid}": ${detail}`
    );
    this.name = "CIDMismatchError";
  }
}

/**
 * Fetches the content stored under a CID from an IPFS gateway and compares
 * it byte-for-byte against the originally uploaded content.
 *
 * This round-trip approach works regardless of the CID version or the encoding
 * strategy used by the pinning provider (dag-pb, raw, etc.) and guarantees
 * that what was stored under the returned CID matches what was uploaded.
 *
 * @param originalContent  The content that was uploaded (as a Buffer).
 * @param cid              The CID returned by the provider after upload.
 * @param gatewayBaseUrl   IPFS gateway base URL (no trailing slash).
 */
export async function verifyCIDContent(
  originalContent: Buffer,
  cid: string,
  gatewayBaseUrl = "https://gateway.pinata.cloud/ipfs"
): Promise<void> {
  let response: Response;

  try {
    response = await fetch(`${gatewayBaseUrl}/${cid}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CIDMismatchError(
      cid,
      `Failed to fetch content from gateway: ${msg}`
    );
  }

  if (!response.ok) {
    throw new CIDMismatchError(
      cid,
      `Gateway returned HTTP ${response.status} when fetching CID content`
    );
  }

  const fetched = Buffer.from(await response.arrayBuffer());

  const originalHash = createHash("sha256").update(originalContent).digest("hex");
  const fetchedHash = createHash("sha256").update(fetched).digest("hex");

  if (originalHash !== fetchedHash) {
    throw new CIDMismatchError(
      cid,
      `Content hash mismatch — uploaded sha256=${originalHash}, ` +
        `gateway returned sha256=${fetchedHash}`
    );
  }
}

/**
 * Verifies that a JSON metadata object matches the content stored under a CID.
 * The object is serialised with JSON.stringify before comparison.
 */
export async function verifyMetadataCID(
  metadata: unknown,
  cid: string,
  gatewayBaseUrl?: string
): Promise<void> {
  const content = Buffer.from(JSON.stringify(metadata));
  await verifyCIDContent(content, cid, gatewayBaseUrl);
}
