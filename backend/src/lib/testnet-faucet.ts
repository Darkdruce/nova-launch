import axios from "axios";
import {
  calculateBackoffDelay,
  isRetryableError,
  sleep,
  RetryConfig,
} from "../stellar-service-integration/rate-limiter";
import { generateKeyPairSync } from "crypto";

const FRIENDBOT_URL = "https://friendbot.stellar.org";

export interface FaucetResult {
  funded: boolean;
  transactionHash?: string;
}

export class FaucetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FaucetError";
  }
}

// Stellar base32 alphabet (RFC 4648 without padding)
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return output;
}

function crc16xmodem(data: Buffer): number {
  let crc = 0x0000;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function encodeStrKey(versionByte: number, payload: Buffer): string {
  const versionBuf = Buffer.from([versionByte]);
  const checksumInput = Buffer.concat([versionBuf, payload]);
  const crc = crc16xmodem(checksumInput);
  // CRC stored little-endian per the Stellar StrKey spec
  const checksum = Buffer.from([crc & 0xff, (crc >> 8) & 0xff]);
  return base32Encode(Buffer.concat([checksumInput, checksum]));
}

/**
 * Generates a random Stellar Ed25519 keypair using Node.js built-in crypto.
 * Returns public key (G...) and secret seed (S...) in Stellar StrKey format.
 */
export function generateTestKeypair(): { publicKey: string; secretKey: string } {
  const { publicKey: pubKey, privateKey: privKey } = generateKeyPairSync(
    "ed25519",
    {
      publicKeyEncoding: { type: "spki", format: "der" },
      privateKeyEncoding: { type: "pkcs8", format: "der" },
    }
  );

  // Ed25519 SPKI DER: 12-byte header followed by the 32-byte public key
  const publicKeyBytes = Buffer.from(pubKey).slice(12);
  // Ed25519 PKCS8 DER: 16-byte header followed by the 32-byte private key
  const privateKeyBytes = Buffer.from(privKey).slice(16);

  return {
    // Account version byte = 6 << 3 = 0x30 → first char 'G'
    publicKey: encodeStrKey(0x30, publicKeyBytes),
    // Seed version byte = 18 << 3 = 0x90 → first char 'S'
    secretKey: encodeStrKey(0x90, privateKeyBytes),
  };
}

const FAUCET_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 500,
  maxDelay: 8000,
  backoffFactor: 2,
  jitterFactor: 0.1,
};

/**
 * Funds a Stellar testnet account via the Friendbot faucet.
 *
 * Only runs against testnet — throws FaucetError on any other network.
 * Retries on transient HTTP/network errors with exponential backoff.
 * A 400 response (account already funded) is treated as success.
 */
export async function fundTestAccount(
  publicKey: string,
  network = process.env.STELLAR_NETWORK,
  friendbotUrl = FRIENDBOT_URL,
  retryConfig: RetryConfig = FAUCET_RETRY_CONFIG
): Promise<FaucetResult> {
  if (network !== "testnet") {
    throw new FaucetError(
      `Testnet faucet is only available on testnet. ` +
        `Current STELLAR_NETWORK="${network ?? "undefined"}".`
    );
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
    try {
      const response = await axios.get(friendbotUrl, {
        params: { addr: publicKey },
        timeout: 15000,
      });

      return {
        funded: true,
        transactionHash: response.data?.hash,
      };
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response
        ?.status;

      // 400 = account already funded on testnet — treat as success
      if (status === 400) {
        return { funded: true };
      }

      lastError = error;

      if (!isRetryableError(error) || attempt === retryConfig.maxAttempts) {
        break;
      }

      const delay = calculateBackoffDelay(attempt, retryConfig);
      await sleep(delay);
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new FaucetError(
    `Failed to fund account "${publicKey}" via testnet faucet ` +
      `after ${retryConfig.maxAttempts} attempt(s): ${msg}`
  );
}

/**
 * Generates a random Stellar keypair and funds it via the testnet faucet.
 * Intended for integration test account setup only.
 */
export async function generateAndFundKeypair(
  network = process.env.STELLAR_NETWORK,
  friendbotUrl = FRIENDBOT_URL,
  retryConfig: RetryConfig = FAUCET_RETRY_CONFIG
): Promise<{ publicKey: string; secretKey: string; transactionHash?: string }> {
  const keypair = generateTestKeypair();
  const result = await fundTestAccount(
    keypair.publicKey,
    network,
    friendbotUrl,
    retryConfig
  );
  return { ...keypair, transactionHash: result.transactionHash };
}
