/**
 * Token Analytics API client.
 *
 * REST:   GET /api/tokens/:address/stats
 * GraphQL: burnRecords field
 */

import { apiClient } from './apiClient';

export interface TokenStats {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  /** Supply over time snapshots — each point represents a ledger close */
  supplyHistory: Array<{ timestamp: number; supply: string }>;
  burnCount: number;
  totalBurned: string;
  burnerCount: number;
  dailyBurnVolume: string;
  weeklyBurnVolume: string;
  monthlyBurnVolume: string;
  burnTrend: number;
}

export interface BurnRecord {
  id: string;
  timestamp: number; // Unix seconds
  from: string;
  amount: string;
  isAdminBurn: boolean;
  txHash: string;
}

const GQL_ENDPOINT =
  (import.meta as any)?.env?.VITE_GRAPHQL_URL ?? '/api/graphql';

const BURN_RECORDS_QUERY = `
  query BurnRecords($address: String!) {
    burnRecords(tokenAddress: $address) {
      id
      timestamp
      from
      amount
      isAdminBurn
      txHash
    }
  }
`;

export async function fetchTokenStats(address: string): Promise<TokenStats> {
  return apiClient.get<TokenStats>(`/api/tokens/${address}/stats`);
}

export async function fetchBurnRecords(address: string): Promise<BurnRecord[]> {
  const res = await apiClient.post<{ data: { burnRecords: BurnRecord[] } }>(
    GQL_ENDPOINT,
    { query: BURN_RECORDS_QUERY, variables: { address } }
  );
  return res.data.burnRecords;
}
