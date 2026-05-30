/**
 * Tests for the Stellar testnet faucet helper.
 *
 * Verifies that fundTestAccount calls Friendbot correctly, retries on
 * transient failures, and refuses to run against non-testnet networks.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import {
  fundTestAccount,
  generateAndFundKeypair,
  generateTestKeypair,
  FaucetError,
} from "../lib/testnet-faucet";
import { RetryConfig } from "../stellar-service-integration/rate-limiter";

const FRIENDBOT_HOST = "https://friendbot.stellar.org";
const TEST_PUBLIC_KEY = "G" + "A".repeat(55);

// Fast retry config for tests
const FAST_RETRY: RetryConfig = {
  maxAttempts: 2,
  initialDelay: 10,
  maxDelay: 50,
  backoffFactor: 2,
  jitterFactor: 0,
};

beforeEach(() => {
  nock.cleanAll();
});

afterEach(() => {
  nock.cleanAll();
});

describe("fundTestAccount", () => {
  describe("network guard", () => {
    it("throws FaucetError when network is mainnet", async () => {
      await expect(
        fundTestAccount(TEST_PUBLIC_KEY, "mainnet", FRIENDBOT_HOST, FAST_RETRY)
      ).rejects.toThrow(FaucetError);
    });

    it("error message names the current network", async () => {
      await expect(
        fundTestAccount(TEST_PUBLIC_KEY, "mainnet", FRIENDBOT_HOST, FAST_RETRY)
      ).rejects.toThrow('STELLAR_NETWORK="mainnet"');
    });

    it("throws FaucetError when network is undefined", async () => {
      await expect(
        fundTestAccount(
          TEST_PUBLIC_KEY,
          undefined,
          FRIENDBOT_HOST,
          FAST_RETRY
        )
      ).rejects.toThrow(FaucetError);
    });
  });

  describe("successful funding", () => {
    it("returns funded=true and the transaction hash on success", async () => {
      nock(FRIENDBOT_HOST)
        .get("/")
        .query({ addr: TEST_PUBLIC_KEY })
        .reply(200, { hash: "abc123txhash" });

      const result = await fundTestAccount(
        TEST_PUBLIC_KEY,
        "testnet",
        FRIENDBOT_HOST,
        FAST_RETRY
      );

      expect(result.funded).toBe(true);
      expect(result.transactionHash).toBe("abc123txhash");
    });

    it("treats a 400 response as funded (account already exists)", async () => {
      nock(FRIENDBOT_HOST)
        .get("/")
        .query({ addr: TEST_PUBLIC_KEY })
        .reply(400, { detail: "account already exists" });

      const result = await fundTestAccount(
        TEST_PUBLIC_KEY,
        "testnet",
        FRIENDBOT_HOST,
        FAST_RETRY
      );

      expect(result.funded).toBe(true);
    });
  });

  describe("retry on transient failures", () => {
    it("succeeds on second attempt after a transient network error", async () => {
      nock(FRIENDBOT_HOST)
        .get("/")
        .query({ addr: TEST_PUBLIC_KEY })
        .replyWithError({ code: "ETIMEDOUT" });

      nock(FRIENDBOT_HOST)
        .get("/")
        .query({ addr: TEST_PUBLIC_KEY })
        .reply(200, { hash: "retry-tx-hash" });

      const result = await fundTestAccount(
        TEST_PUBLIC_KEY,
        "testnet",
        FRIENDBOT_HOST,
        FAST_RETRY
      );

      expect(result.funded).toBe(true);
      expect(result.transactionHash).toBe("retry-tx-hash");
    });

    it("throws FaucetError after exhausting all retry attempts", async () => {
      nock(FRIENDBOT_HOST)
        .get("/")
        .query({ addr: TEST_PUBLIC_KEY })
        .replyWithError({ code: "ECONNRESET" });
      nock(FRIENDBOT_HOST)
        .get("/")
        .query({ addr: TEST_PUBLIC_KEY })
        .replyWithError({ code: "ECONNRESET" });

      await expect(
        fundTestAccount(TEST_PUBLIC_KEY, "testnet", FRIENDBOT_HOST, FAST_RETRY)
      ).rejects.toThrow(FaucetError);
    });

    it("error includes the public key for debugging", async () => {
      nock(FRIENDBOT_HOST)
        .get("/")
        .query(true)
        .replyWithError({ code: "ECONNRESET" })
        .persist();

      await expect(
        fundTestAccount(TEST_PUBLIC_KEY, "testnet", FRIENDBOT_HOST, FAST_RETRY)
      ).rejects.toThrow(TEST_PUBLIC_KEY);
    });

    it("does not retry a non-retryable 5xx server error", async () => {
      nock(FRIENDBOT_HOST)
        .get("/")
        .query({ addr: TEST_PUBLIC_KEY })
        .reply(503, { error: "Service Unavailable" });

      const secondScope = nock(FRIENDBOT_HOST)
        .get("/")
        .query({ addr: TEST_PUBLIC_KEY })
        .reply(200, { hash: "should-not-reach" });

      await expect(
        fundTestAccount(TEST_PUBLIC_KEY, "testnet", FRIENDBOT_HOST, {
          ...FAST_RETRY,
          maxAttempts: 1,
        })
      ).rejects.toThrow(FaucetError);

      expect(secondScope.isDone()).toBe(false);
      nock.cleanAll();
    });
  });
});

describe("generateTestKeypair", () => {
  it("returns a public key starting with G", () => {
    const { publicKey } = generateTestKeypair();
    expect(publicKey.startsWith("G")).toBe(true);
  });

  it("returns a secret key starting with S", () => {
    const { secretKey } = generateTestKeypair();
    expect(secretKey.startsWith("S")).toBe(true);
  });

  it("returns a 56-character public key", () => {
    const { publicKey } = generateTestKeypair();
    expect(publicKey).toHaveLength(56);
  });

  it("returns a 56-character secret key", () => {
    const { secretKey } = generateTestKeypair();
    expect(secretKey).toHaveLength(56);
  });

  it("generates different keypairs on each call", () => {
    const kp1 = generateTestKeypair();
    const kp2 = generateTestKeypair();
    expect(kp1.publicKey).not.toBe(kp2.publicKey);
    expect(kp1.secretKey).not.toBe(kp2.secretKey);
  });
});

describe("generateAndFundKeypair", () => {
  it("returns a funded keypair with publicKey, secretKey, and transactionHash", async () => {
    // Match any public key query param since the key is randomly generated
    nock(FRIENDBOT_HOST)
      .get("/")
      .query(true)
      .reply(200, { hash: "generated-keypair-tx" });

    const result = await generateAndFundKeypair(
      "testnet",
      FRIENDBOT_HOST,
      FAST_RETRY
    );

    expect(result.publicKey.startsWith("G")).toBe(true);
    expect(result.secretKey.startsWith("S")).toBe(true);
    expect(result.transactionHash).toBe("generated-keypair-tx");
  });

  it("throws FaucetError when called on mainnet", async () => {
    await expect(
      generateAndFundKeypair("mainnet", FRIENDBOT_HOST, FAST_RETRY)
    ).rejects.toThrow(FaucetError);
  });
});
