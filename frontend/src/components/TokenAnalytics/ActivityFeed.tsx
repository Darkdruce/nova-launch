import { Card } from '../UI/Card';
import type { BurnRecord } from '../../services/tokenAnalyticsApi';
import { truncateAddress } from '../../utils/formatting';

interface ActivityFeedProps {
  records: BurnRecord[];
  symbol?: string;
  decimals?: number;
}

function formatAmount(raw: string, decimals: number): string {
  const n = Number(BigInt(raw)) / 10 ** decimals;
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function ActivityFeed({ records, symbol = 'TOKEN', decimals = 7 }: ActivityFeedProps) {
  const recent = records
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 20);

  return (
    <Card>
      <h3 className="text-base font-semibold text-gray-900 mb-4">Recent Burns</h3>

      {recent.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">No burn activity yet</p>
      ) : (
        <ol
          aria-label="Recent burn activity"
          className="divide-y divide-gray-100 text-sm"
        >
          {recent.map((rec) => (
            <li key={rec.id} className="py-2 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <span className="font-mono text-gray-700 truncate block">
                  {truncateAddress(rec.from)}
                </span>
                <time
                  className="text-xs text-gray-400"
                  dateTime={new Date(rec.timestamp * 1000).toISOString()}
                >
                  {new Date(rec.timestamp * 1000).toLocaleString()}
                </time>
              </div>
              <div className="text-right shrink-0">
                <span className="font-semibold text-orange-600">
                  −{formatAmount(rec.amount, decimals)} {symbol}
                </span>
                {rec.isAdminBurn && (
                  <span className="ml-1 text-xs text-gray-500">(admin)</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
