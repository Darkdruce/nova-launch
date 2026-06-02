import { Logger } from '@nestjs/common';

/**
 * Sequence number cache entry with lock for serialization
 */
interface SequenceCacheEntry {
  sequenceNumber: string;
  lastUpdated: number;
  locked: boolean;
  lockQueue: Array<() => void>;
}

/**
 * Cache and manage Stellar account sequence numbers to avoid transaction collisions.
 * 
 * Features:
 * - Caches sequence numbers per account to avoid redundant network calls
 * - Automatically increments locally for sequential submissions
 * - Serializes submissions per account to prevent race conditions
 * - Refreshes from network on sequence mismatch errors
 * - Thread-safe with per-account locking
 * 
 * Issue: #1155
 */
export class SequenceNumberCache {
  private readonly cache = new Map<string, SequenceCacheEntry>();
  private readonly logger = new Logger(SequenceNumberCache.name);
  private readonly maxCacheAge: number;

  constructor(maxCacheAgeMs: number = 300000) {
    this.maxCacheAge = maxCacheAgeMs;
  }

  /**
   * Get cached sequence number for an account.
   * Returns null if not cached or expired.
   */
  get(accountId: string): string | null {
    const entry = this.cache.get(accountId);
    if (!entry) return null;

    const age = Date.now() - entry.lastUpdated;
    if (age > this.maxCacheAge) {
      this.cache.delete(accountId);
      return null;
    }

    return entry.sequenceNumber;
  }

  /**
   * Set cached sequence number for an account.
   */
  set(accountId: string, sequenceNumber: string): void {
    const existing = this.cache.get(accountId);
    
    this.cache.set(accountId, {
      sequenceNumber,
      lastUpdated: Date.now(),
      locked: existing?.locked || false,
      lockQueue: existing?.lockQueue || [],
    });

    this.logger.debug(`Cached sequence ${sequenceNumber} for account ${accountId}`);
  }

  /**
   * Increment the cached sequence number.
   * This should be called after successfully submitting a transaction.
   */
  increment(accountId: string): void {
    const entry = this.cache.get(accountId);
    if (!entry) {
      this.logger.warn(`Cannot increment sequence for uncached account ${accountId}`);
      return;
    }

    const newSequence = (BigInt(entry.sequenceNumber) + BigInt(1)).toString();
    entry.sequenceNumber = newSequence;
    entry.lastUpdated = Date.now();

    this.logger.debug(`Incremented sequence to ${newSequence} for account ${accountId}`);
  }

  /**
   * Invalidate cached sequence number, forcing a refresh from network.
   * Called when a sequence mismatch error occurs.
   */
  invalidate(accountId: string): void {
    this.cache.delete(accountId);
    this.logger.debug(`Invalidated sequence cache for account ${accountId}`);
  }

  /**
   * Acquire lock for an account to serialize transaction submissions.
   * Returns a release function that must be called after transaction is submitted.
   */
  async acquireLock(accountId: string): Promise<() => void> {
    const entry = this.cache.get(accountId);

    if (!entry) {
      // Create new entry with lock
      this.cache.set(accountId, {
        sequenceNumber: '0',
        lastUpdated: Date.now(),
        locked: true,
        lockQueue: [],
      });

      return () => this.releaseLock(accountId);
    }

    if (!entry.locked) {
      entry.locked = true;
      return () => this.releaseLock(accountId);
    }

    // Wait for lock to be released
    return new Promise<() => void>((resolve) => {
      entry.lockQueue.push(() => {
        resolve(() => this.releaseLock(accountId));
      });
    });
  }

  /**
   * Release lock for an account and process queue.
   */
  private releaseLock(accountId: string): void {
    const entry = this.cache.get(accountId);
    if (!entry) return;

    const nextInQueue = entry.lockQueue.shift();
    
    if (nextInQueue) {
      // Pass lock to next in queue
      nextInQueue();
    } else {
      // No one waiting, unlock
      entry.locked = false;
    }

    this.logger.debug(`Released lock for account ${accountId}, queue length: ${entry.lockQueue.length}`);
  }

  /**
   * Clear all cached sequences.
   */
  clear(): void {
    this.cache.clear();
    this.logger.debug('Cleared all sequence number cache');
  }

  /**
   * Get cache statistics for monitoring.
   */
  getStats(): {
    size: number;
    accounts: Array<{ accountId: string; sequence: string; age: number; locked: boolean }>;
  } {
    const accounts = Array.from(this.cache.entries()).map(([accountId, entry]) => ({
      accountId,
      sequence: entry.sequenceNumber,
      age: Date.now() - entry.lastUpdated,
      locked: entry.locked,
    }));

    return {
      size: this.cache.size,
      accounts,
    };
  }

  /**
   * Execute a transaction with automatic sequence number management.
   * Handles locking, caching, incrementing, and refresh on mismatch.
   * 
   * @param accountId - The account public key
   * @param fetchAccount - Function to fetch fresh account from network
   * @param buildAndSubmit - Function to build and submit transaction with account
   * @returns Transaction result
   */
  async executeWithSequenceManagement<T>(
    accountId: string,
    fetchAccount: () => Promise<{ sequenceNumber: () => string }>,
    buildAndSubmit: (account: any) => Promise<T>
  ): Promise<T> {
    const releaseLock = await this.acquireLock(accountId);

    try {
      // Try to use cached sequence first
      let cachedSequence = this.get(accountId);
      let account: any;

      if (cachedSequence) {
        // Use cached sequence
        account = {
          accountId: () => accountId,
          sequenceNumber: () => cachedSequence,
          incrementSequenceNumber: () => {},
        };
        this.logger.debug(`Using cached sequence ${cachedSequence} for ${accountId}`);
      } else {
        // Fetch from network
        account = await fetchAccount();
        const networkSequence = account.sequenceNumber();
        this.set(accountId, networkSequence);
        this.logger.debug(`Fetched fresh sequence ${networkSequence} for ${accountId}`);
      }

      // Attempt submission
      try {
        const result = await buildAndSubmit(account);
        
        // Success - increment cached sequence
        this.increment(accountId);
        
        return result;
      } catch (error: any) {
        // Check for sequence mismatch
        if (this.isSequenceMismatchError(error)) {
          this.logger.warn(`Sequence mismatch for ${accountId}, refreshing and retrying`);
          
          // Invalidate cache and fetch fresh sequence
          this.invalidate(accountId);
          const freshAccount = await fetchAccount();
          const freshSequence = freshAccount.sequenceNumber();
          this.set(accountId, freshSequence);
          
          this.logger.debug(`Retrying with fresh sequence ${freshSequence}`);
          
          // Retry with fresh sequence
          const result = await buildAndSubmit(freshAccount);
          this.increment(accountId);
          
          return result;
        }

        // Not a sequence error - propagate
        throw error;
      }
    } finally {
      releaseLock();
    }
  }

  /**
   * Detect if error is a sequence number mismatch.
   */
  private isSequenceMismatchError(error: any): boolean {
    if (!error) return false;

    const message = error.message?.toLowerCase() || '';
    const code = error.code?.toUpperCase() || '';
    
    // Horizon API error codes
    if (code === 'TX_BAD_SEQ') return true;
    
    // Error message patterns
    if (message.includes('bad_seq')) return true;
    if (message.includes('sequence') && message.includes('mismatch')) return true;
    if (message.includes('transaction sequence')) return true;
    
    // Check response data
    if (error.response?.data) {
      const data = JSON.stringify(error.response.data).toLowerCase();
      if (data.includes('tx_bad_seq')) return true;
      if (data.includes('bad_seq')) return true;
    }

    return false;
  }
}
