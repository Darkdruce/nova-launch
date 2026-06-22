/**
 * Data-transformation utilities for the Token Analytics Dashboard.
 *
 * These are pure functions with no side-effects so they are easy to unit-test.
 */

import type { BurnRecord } from '../services/tokenAnalyticsApi';

export interface DailyBurnPoint {
  date: string;       // ISO date "YYYY-MM-DD"
  burned: number;
  count: number;
}

export interface SupplyPoint {
  date: string;
  supply: number;
}

/**
 * Group burn records by calendar day (UTC) and sum amounts.
 *
 * @param records  Raw burn records with Unix-second timestamps and string amounts
 * @param decimals Token decimals used to normalise the raw amount
 */
export function groupBurnsByDay(
  records: BurnRecord[],
  decimals: number
): DailyBurnPoint[] {
  const map = new Map<string, DailyBurnPoint>();

  for (const rec of records) {
    const date = new Date(rec.timestamp * 1000).toISOString().slice(0, 10);
    const amount = Number(BigInt(rec.amount)) / 10 ** decimals;
    const existing = map.get(date);
    if (existing) {
      existing.burned += amount;
      existing.count += 1;
    } else {
      map.set(date, { date, burned: amount, count: 1 });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Convert raw supply-history snapshots into chart-ready points.
 *
 * @param history   Array of { timestamp, supply } from the REST stats endpoint
 * @param decimals  Token decimals
 */
export function normaliseSupplyHistory(
  history: Array<{ timestamp: number; supply: string }>,
  decimals: number
): SupplyPoint[] {
  return history
    .map(({ timestamp, supply }) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      supply: Number(BigInt(supply)) / 10 ** decimals,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
