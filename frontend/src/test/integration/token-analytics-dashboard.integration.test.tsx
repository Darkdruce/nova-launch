/**
 * Integration test: TokenAnalyticsPage renders with mocked API responses.
 * The chart library (recharts) is NOT mocked — we assert on container presence.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TokenAnalyticsPage from '../../pages/TokenAnalyticsPage';
import type { TokenStats, BurnRecord } from '../../services/tokenAnalyticsApi';

const TEST_ADDRESS = 'CTEST1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234';

const mockStats: TokenStats = {
  address: TEST_ADDRESS,
  name: 'Test Token',
  symbol: 'TST',
  decimals: 7,
  totalSupply: '1000000000000',
  supplyHistory: [
    { timestamp: 1_700_000_000, supply: '1000000000000' },
    { timestamp: 1_700_086_400, supply: '990000000000' },
  ],
  burnCount: 3,
  totalBurned: '10000000000',
  burnerCount: 2,
  dailyBurnVolume: '1000000000',
  weeklyBurnVolume: '7000000000',
  monthlyBurnVolume: '30000000000',
  burnTrend: -5,
};

const mockBurnRecords: BurnRecord[] = [
  {
    id: '1',
    timestamp: 1_700_086_400,
    from: 'GCBURNER1',
    amount: '5000000000',
    isAdminBurn: false,
    txHash: 'txhash1',
  },
];

// Mock at the module level so we control both fetch functions
vi.mock('../../services/tokenAnalyticsApi', () => ({
  fetchTokenStats: vi.fn(),
  fetchBurnRecords: vi.fn(),
}));

import * as api from '../../services/tokenAnalyticsApi';

beforeEach(() => {
  vi.mocked(api.fetchTokenStats).mockResolvedValue(mockStats);
  vi.mocked(api.fetchBurnRecords).mockResolvedValue(mockBurnRecords);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('TokenAnalyticsPage integration', () => {
  it('renders the page heading', async () => {
    render(<TokenAnalyticsPage address={TEST_ADDRESS} />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Test Token Analytics/i })).toBeInTheDocument()
    );
  });

  it('renders KPI cards with data from the API', async () => {
    render(<TokenAnalyticsPage address={TEST_ADDRESS} />);
    await waitFor(() => expect(screen.getByText(/Total Burned/i)).toBeInTheDocument());
    expect(screen.getByText(/Burn Events/i)).toBeInTheDocument();
    expect(screen.getByText(/Unique Burners/i)).toBeInTheDocument();
  });

  it('renders the supply chart container', async () => {
    render(<TokenAnalyticsPage address={TEST_ADDRESS} />);
    await waitFor(() =>
      expect(screen.getByRole('img', { name: /supply over time/i })).toBeInTheDocument()
    );
  });

  it('renders the burn rate chart container', async () => {
    render(<TokenAnalyticsPage address={TEST_ADDRESS} />);
    await waitFor(() =>
      expect(screen.getByRole('img', { name: /daily.*burn volume/i })).toBeInTheDocument()
    );
  });

  it('renders the activity feed with burn records', async () => {
    render(<TokenAnalyticsPage address={TEST_ADDRESS} />);
    await waitFor(() =>
      expect(screen.getByRole('list', { name: /recent burn activity/i })).toBeInTheDocument()
    );
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  it('shows error state when API fails', async () => {
    vi.mocked(api.fetchTokenStats).mockRejectedValue(new Error('Network error'));
    vi.mocked(api.fetchBurnRecords).mockRejectedValue(new Error('Network error'));

    render(<TokenAnalyticsPage address={TEST_ADDRESS} />);
    await waitFor(() => expect(screen.getByText(/Network error/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
