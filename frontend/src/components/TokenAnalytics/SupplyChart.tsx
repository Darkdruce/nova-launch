import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card } from '../UI/Card';
import { Spinner } from '../UI/Spinner';
import type { SupplyPoint } from '../../utils/analyticsTransforms';

interface SupplyChartProps {
  data: SupplyPoint[];
  symbol?: string;
  loading?: boolean;
}

function formatCompact(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

export function SupplyChart({ data, symbol = 'TOKEN', loading = false }: SupplyChartProps) {
  return (
    <Card>
      <h3 className="text-base font-semibold text-gray-900 mb-4">Supply Over Time</h3>

      {loading ? (
        <div className="flex items-center justify-center h-52" role="status" aria-label="Loading supply chart">
          <Spinner size="lg" />
        </div>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-12">No supply data available</p>
      ) : (
        <div
          role="img"
          aria-label={`Line chart showing ${symbol} token supply over time`}
          style={{ width: '100%', height: 240 }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickFormatter={(d: string) => d.slice(5)} // "MM-DD"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickFormatter={formatCompact}
                width={52}
              />
              <Tooltip
                formatter={(val: number) => [
                  val.toLocaleString(undefined, { maximumFractionDigits: 2 }),
                  `Supply (${symbol})`,
                ]}
              />
              <Line
                type="monotone"
                dataKey="supply"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
                name={`Supply (${symbol})`}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
