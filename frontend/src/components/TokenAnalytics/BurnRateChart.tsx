import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card } from '../UI/Card';
import { Spinner } from '../UI/Spinner';
import type { DailyBurnPoint } from '../../utils/analyticsTransforms';

interface BurnRateChartProps {
  data: DailyBurnPoint[];
  symbol?: string;
  loading?: boolean;
}

function formatCompact(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

export function BurnRateChart({ data, symbol = 'TOKEN', loading = false }: BurnRateChartProps) {
  return (
    <Card>
      <h3 className="text-base font-semibold text-gray-900 mb-4">Daily Burn Volume</h3>

      {loading ? (
        <div className="flex items-center justify-center h-52" role="status" aria-label="Loading burn rate chart">
          <Spinner size="lg" />
        </div>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-12">No burn data available</p>
      ) : (
        <div
          role="img"
          aria-label={`Bar chart showing daily ${symbol} burn volume`}
          style={{ width: '100%', height: 240 }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickFormatter={formatCompact}
                width={52}
              />
              <Tooltip
                formatter={(val: number, name: string) => [
                  val.toLocaleString(undefined, { maximumFractionDigits: 2 }),
                  name,
                ]}
              />
              <Bar
                dataKey="burned"
                fill="#f97316"
                name={`Burned (${symbol})`}
                radius={[3, 3, 0, 0]}
                maxBarSize={48}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
