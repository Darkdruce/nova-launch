import { describe, it, expect } from 'vitest';
import { groupBurnsByDay, normaliseSupplyHistory } from '../analyticsTransforms';
import type { BurnRecord } from '../../services/tokenAnalyticsApi';

// Helper: build a minimal BurnRecord
function rec(overrides: Partial<BurnRecord> & { timestamp: number; amount: string }): BurnRecord {
  return {
    id: overrides.timestamp.toString(),
    from: 'GCTEST',
    isAdminBurn: false,
    txHash: 'txhash',
    ...overrides,
  };
}

const DAY = 86400; // seconds

describe('groupBurnsByDay', () => {
  it('returns empty array for empty input', () => {
    expect(groupBurnsByDay([], 7)).toEqual([]);
  });

  it('aggregates two burns on the same day', () => {
    const base = 1_700_000_000; // 2023-11-14 (arbitrary)
    const records = [
      rec({ timestamp: base, amount: '10_0000000'.replace('_', '') }),
      rec({ timestamp: base + 3600, amount: '5_0000000'.replace('_', '') }),
    ];
    const result = groupBurnsByDay(records, 7);
    expect(result).toHaveLength(1);
    expect(result[0].burned).toBeCloseTo(15);
    expect(result[0].count).toBe(2);
  });

  it('separates burns on different days', () => {
    const base = 1_700_000_000;
    const records = [
      rec({ timestamp: base, amount: '10000000' }),
      rec({ timestamp: base + DAY, amount: '20000000' }),
    ];
    const result = groupBurnsByDay(records, 7);
    expect(result).toHaveLength(2);
    // sorted ascending by date
    expect(result[0].burned).toBeCloseTo(1);
    expect(result[1].burned).toBeCloseTo(2);
  });

  it('normalises amounts using decimals', () => {
    const records = [rec({ timestamp: 1_700_000_000, amount: '1000' })];
    expect(groupBurnsByDay(records, 3)[0].burned).toBeCloseTo(1);
    expect(groupBurnsByDay(records, 0)[0].burned).toBe(1000);
  });

  it('returns result sorted by date ascending', () => {
    const base = 1_700_000_000;
    const records = [
      rec({ timestamp: base + DAY * 2, amount: '1' }),
      rec({ timestamp: base, amount: '1' }),
      rec({ timestamp: base + DAY, amount: '1' }),
    ];
    const result = groupBurnsByDay(records, 0);
    expect(result[0].date < result[1].date).toBe(true);
    expect(result[1].date < result[2].date).toBe(true);
  });
});

describe('normaliseSupplyHistory', () => {
  it('returns empty array for empty input', () => {
    expect(normaliseSupplyHistory([], 7)).toEqual([]);
  });

  it('normalises supply using decimals', () => {
    const history = [{ timestamp: 1_700_000_000, supply: '10000000' }];
    const result = normaliseSupplyHistory(history, 7);
    expect(result[0].supply).toBeCloseTo(1);
  });

  it('produces ISO date strings sliced to YYYY-MM-DD', () => {
    const result = normaliseSupplyHistory([{ timestamp: 1_700_000_000, supply: '1' }], 0);
    expect(result[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('sorts by date ascending', () => {
    const history = [
      { timestamp: 1_700_000_000 + DAY, supply: '1' },
      { timestamp: 1_700_000_000, supply: '2' },
    ];
    const result = normaliseSupplyHistory(history, 0);
    expect(result[0].date < result[1].date).toBe(true);
  });
});
