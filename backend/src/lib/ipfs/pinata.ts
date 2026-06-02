import pinataSDK from "@pinata/sdk";
import NodeCache from "node-cache";
import { CircuitBreaker } from "../circuitBreaker.js";
import { verifyCIDContent, verifyMetadataCID } from "./cidVerification.js";
import { pinataQueue, type PinataQueueMetrics } from "./pinataQueue.js";

const cache = new NodeCache({ stdTTL: 3600 }); // 1 hour cache

const ipfsCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  successThreshold: 2,
  timeoutMs: 30000, // 30 seconds before retry
});

// Set IPFS_VERIFY_CID=true to enable content-address integrity checks after upload.
const CID_VERIFY_ENABLED = process.env.IPFS_VERIFY_CID === "true";
const CID_VERIFY_GATEWAY =
  process.env.IPFS_VERIFY_GATEWAY_URL ?? "https://gateway.pinata.cloud/ipfs";

export async function uploadImageToIPFS(
  buffer: Buffer,
  filename: string
): Promise<string> {
  return ipfsCircuitBreaker.execute(() =>
    pinataQueue.enqueue(async () => {
      const pinata = new pinataSDK(
        process.env.PINATA_API_KEY!,
        process.env.PINATA_API_SECRET!
      );

      const result = await pinata.pinFileToIPFS(buffer, {
        pinataMetadata: { name: filename },
      });

      const cid = result.IpfsHash;

      if (CID_VERIFY_ENABLED) {
        await verifyCIDContent(buffer, cid, CID_VERIFY_GATEWAY);
      }

      return cid;
    })
  );
}

export async function uploadMetadataToIPFS(metadata: any): Promise<string> {
  return ipfsCircuitBreaker.execute(() =>
    pinataQueue.enqueue(async () => {
      const pinata = new pinataSDK(
        process.env.PINATA_API_KEY!,
        process.env.PINATA_API_SECRET!
      );

      const result = await pinata.pinJSONToIPFS(metadata);
      const cid = result.IpfsHash;

      if (CID_VERIFY_ENABLED) {
        await verifyMetadataCID(metadata, cid, CID_VERIFY_GATEWAY);
      }

      // Cache the metadata
      cache.set(cid, metadata);

      return cid;
    })
  );
}

export async function getMetadataFromIPFS(cid: string): Promise<any> {
  // Check cache first
  const cached = cache.get(cid);
  if (cached) return cached;

  // Fetch from IPFS with circuit breaker + queue throttle
  return ipfsCircuitBreaker.execute(() =>
    pinataQueue.enqueue(async () => {
      const response = await fetch(
        `https://gateway.pinata.cloud/ipfs/${cid}`
      );
      if (!response.ok) throw new Error("Metadata not found");

      const metadata = await response.json();
      cache.set(cid, metadata);

      return metadata;
    })
  );
}

/**
 * Get the current state of the IPFS circuit breaker (for monitoring/debugging).
 */
export function getIPFSCircuitBreakerMetrics() {
  return ipfsCircuitBreaker.getMetrics();
}

/**
 * Manually reset the IPFS circuit breaker (admin use only).
 */
export function resetIPFSCircuitBreaker(): void {
  ipfsCircuitBreaker.reset();
}

/**
 * Get a snapshot of the Pinata request queue metrics.
 * Useful for observability dashboards and health checks.
 *
 * Returns: { queueDepth, inFlight, throttledCount, retried429Count, avgLatencyMs }
 */
export function getPinataQueueMetrics(): PinataQueueMetrics {
  return pinataQueue.getMetrics();
}
