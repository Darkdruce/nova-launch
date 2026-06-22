import { useTokenAnalytics } from '../hooks/useTokenAnalytics';
import { SupplyChart, BurnRateChart, ActivityFeed } from '../components/TokenAnalytics';
import { Spinner } from '../components/UI/Spinner';
import { Button } from '../components/UI/Button';
import { truncateAddress, formatTokenSupply } from '../utils/formatting';

interface Props {
  /** Token contract address from the route parameter */
  address: string;
}

/** Simple KPI card */
function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1 truncate">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function TokenAnalyticsPage({ address }: Props) {
  const { stats, burnRecords, dailyBurns, supplyHistory, loading, error, refresh } =
    useTokenAnalytics(address);

  if (loading && !stats) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        role="status"
        aria-label="Loading analytics"
      >
        <Spinner size="lg" />
        <span className="sr-only">Loading analytics…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto mt-24 text-center p-6">
        <p className="text-red-600 font-medium mb-4">{error}</p>
        <Button variant="primary" onClick={refresh}>
          Retry
        </Button>
      </div>
    );
  }

  const decimals = stats?.decimals ?? 7;
  const symbol = stats?.symbol ?? '—';

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {stats?.name ?? 'Token'} Analytics
          </h1>
          <p className="text-sm text-gray-500 font-mono mt-1">
            {truncateAddress(address, 10, 8)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} aria-label="Refresh analytics data">
          Refresh
        </Button>
      </header>

      {/* KPI cards */}
      <section
        aria-label="Key metrics"
        className="grid grid-cols-2 sm:grid-cols-4 gap-4"
      >
        <KpiCard
          label="Total Supply"
          value={
            stats
              ? formatTokenSupply(stats.totalSupply, decimals, { compact: true })
              : '—'
          }
          sub={symbol}
        />
        <KpiCard
          label="Total Burned"
          value={
            stats
              ? formatTokenSupply(stats.totalBurned, decimals, { compact: true })
              : '—'
          }
          sub={symbol}
        />
        <KpiCard
          label="Burn Events"
          value={stats?.burnCount.toLocaleString() ?? '—'}
        />
        <KpiCard
          label="Unique Burners"
          value={stats?.burnerCount.toLocaleString() ?? '—'}
        />
      </section>

      {/* Charts */}
      <section aria-label="Supply and burn charts" className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SupplyChart data={supplyHistory} symbol={symbol} loading={loading} />
        <BurnRateChart data={dailyBurns} symbol={symbol} loading={loading} />
      </section>

      {/* Activity feed */}
      <section aria-label="Recent burn activity">
        <ActivityFeed records={burnRecords} symbol={symbol} decimals={decimals} />
      </section>
    </main>
  );
}
