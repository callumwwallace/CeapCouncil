'use client';

import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { TrendingUp, Eye, EyeOff } from 'lucide-react';
import type { EquityCurveEntry } from '@/types';

// 10 distinct colors for up to 10 participants
const COLORS = [
  '#10b981', // emerald
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
  '#6366f1', // indigo
];

interface CompetitionEquityChartProps {
  curves: EquityCurveEntry[];
  initialCapital: number;
}

export default function CompetitionEquityChart({ curves, initialCapital }: CompetitionEquityChartProps) {
  const [hiddenUsers, setHiddenUsers] = useState<Set<string>>(new Set());
  const [normalize, setNormalize] = useState(true);

  // Build merged dataset: one row per date, columns per user
  const { chartData, usernames } = useMemo(() => {
    if (!curves.length) return { chartData: [], usernames: [] };

    const users = curves.map((c) => c.username);

    // Collect all dates across all curves
    const dateMap = new Map<string, Record<string, number | null>>();

    for (const curve of curves) {
      for (const pt of curve.equity_curve) {
        if (!dateMap.has(pt.date)) {
          dateMap.set(pt.date, { date: null as unknown as number });
        }
        const row = dateMap.get(pt.date)!;
        if (normalize) {
          // Normalize to % return from initial capital
          row[curve.username] = ((pt.equity - initialCapital) / initialCapital) * 100;
        } else {
          row[curve.username] = pt.equity;
        }
      }
    }

    // Sort by date
    const sortedDates = Array.from(dateMap.keys()).sort();
    const data = sortedDates.map((d) => ({
      date: d,
      ...dateMap.get(d),
    }));

    return { chartData: data, usernames: users };
  }, [curves, initialCapital, normalize]);

  const toggleUser = (username: string) => {
    setHiddenUsers((prev) => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
  };

  if (!curves.length) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-600" />
          Equity Curves
        </h3>
        <button
          type="button"
          onClick={() => setNormalize(!normalize)}
          className="text-xs px-2.5 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
        >
          {normalize ? '% Return' : 'Absolute $'}
        </button>
      </div>

      <div className="px-4 pt-4 pb-2">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
              tickFormatter={(d: string) => {
                const date = new Date(d);
                return `${date.getMonth() + 1}/${date.getDate()}`;
              }}
              minTickGap={40}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                normalize ? `${v >= 0 ? '+' : ''}${v.toFixed(0)}%` : `$${(v / 1000).toFixed(0)}k`
              }
              width={55}
            />
            <Tooltip
              contentStyle={{
                background: '#1f2937',
                border: 'none',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#f3f4f6',
              }}
              labelFormatter={(d) => new Date(String(d)).toLocaleDateString()}
              formatter={(value, name) => {
                const v = Number(value);
                return [
                  normalize ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
                  String(name),
                ];
              }}
            />
            {usernames.map((username, i) =>
              hiddenUsers.has(username) ? null : (
                <Line
                  key={username}
                  type="monotone"
                  dataKey={username}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ),
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Interactive legend */}
      <div className="px-4 pb-3 flex flex-wrap gap-2">
        {usernames.map((username, i) => {
          const hidden = hiddenUsers.has(username);
          const curve = curves.find((c) => c.username === username);
          return (
            <button
              key={username}
              type="button"
              onClick={() => toggleUser(username)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition ${
                hidden
                  ? 'bg-gray-100 text-gray-400'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{
                  backgroundColor: hidden ? '#d1d5db' : COLORS[i % COLORS.length],
                }}
              />
              {username}
              {curve?.rank === 1 && <span className="text-amber-500">🏆</span>}
              {hidden ? (
                <EyeOff className="h-3 w-3 text-gray-400" />
              ) : (
                <Eye className="h-3 w-3 text-gray-400" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Mini sparkline for leaderboard rows ─────────────────────────────

interface MiniSparklineProps {
  data: { date: string; equity: number }[];
  color: string;
  width?: number;
  height?: number;
}

export function MiniSparkline({ data, color, width = 80, height = 24 }: MiniSparklineProps) {
  if (!data.length) return <span className="text-gray-300 text-xs">—</span>;

  const values = data.map((d) => d.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
