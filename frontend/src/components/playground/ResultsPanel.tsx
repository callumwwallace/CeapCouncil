'use client';

import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Target, 
  BarChart3,
  AlertCircle,
  Loader2,
  Lock,
  Zap
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart,
} from 'recharts';
import Link from 'next/link';

interface BacktestResult {
  total_return: number;
  sharpe_ratio: number;
  max_drawdown: number;
  win_rate: number;
  total_trades: number;
  results?: {
    equity_curve?: { date: string; value: number }[];
  };
}

interface ResultsPanelProps {
  results: BacktestResult | null;
  isRunning: boolean;
  error: string | null;
  isAuthenticated: boolean;
}

export default function ResultsPanel({ results, isRunning, error, isAuthenticated }: ResultsPanelProps) {
  // Not authenticated state
  if (!isAuthenticated) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <Lock className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Sign in to run backtests</h3>
        <p className="text-gray-500 text-sm mb-6 max-w-xs">
          Create a free account to test your strategies with real market data.
        </p>
        <Link
          href="/register"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition shadow-sm"
        >
          Get Started Free
        </Link>
      </div>
    );
  }

  // Loading state
  if (isRunning) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-emerald-100 rounded-full"></div>
          <div className="absolute top-0 left-0 w-16 h-16 border-4 border-emerald-600 rounded-full border-t-transparent animate-spin"></div>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-2">Running Backtest</h3>
        <p className="text-gray-500 text-sm text-center">
          Fetching market data and simulating trades...
        </p>
        <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
          <Zap className="h-3 w-3" />
          This usually takes 10-30 seconds
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="h-8 w-8 text-red-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Backtest Failed</h3>
        <p className="text-gray-500 text-sm max-w-xs">{error}</p>
        <button className="mt-4 text-sm text-emerald-600 hover:text-emerald-700 font-medium">
          Try again
        </button>
      </div>
    );
  }

  // Empty state
  if (!results) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <BarChart3 className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Ready to test</h3>
        <p className="text-gray-500 text-sm max-w-xs">
          Write your strategy, configure the settings, and click <span className="font-medium text-emerald-600">"Run Backtest"</span> to see results.
        </p>
      </div>
    );
  }

  // Results state
  const isPositiveReturn = results.total_return >= 0;
  const equityCurve = results.results?.equity_curve || [];

  return (
    <div className="p-5 space-y-5">
      {/* Summary Card */}
      <div className={`rounded-xl p-5 ${
        isPositiveReturn 
          ? 'bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100' 
          : 'bg-gradient-to-br from-red-50 to-orange-50 border border-red-100'
      }`}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-600">Total Return</h3>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isPositiveReturn ? 'bg-emerald-100' : 'bg-red-100'
          }`}>
            {isPositiveReturn ? (
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
          </div>
        </div>
        <div className={`text-4xl font-bold ${isPositiveReturn ? 'text-emerald-600' : 'text-red-600'}`}>
          {isPositiveReturn ? '+' : ''}{results.total_return.toFixed(2)}%
        </div>
        <p className="text-sm text-gray-500 mt-1">
          {results.total_trades} trades executed
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          icon={<Activity className="h-4 w-4" />}
          label="Sharpe Ratio"
          value={results.sharpe_ratio.toFixed(2)}
          isGood={results.sharpe_ratio > 1}
          description={results.sharpe_ratio > 1 ? 'Good' : 'Below avg'}
        />
        <MetricCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Max Drawdown"
          value={`${results.max_drawdown.toFixed(1)}%`}
          isGood={results.max_drawdown > -20}
          description={results.max_drawdown > -20 ? 'Acceptable' : 'High risk'}
        />
        <MetricCard
          icon={<Target className="h-4 w-4" />}
          label="Win Rate"
          value={`${results.win_rate.toFixed(0)}%`}
          isGood={results.win_rate > 50}
          description={`${results.total_trades} trades`}
        />
        <MetricCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="Total Trades"
          value={results.total_trades.toString()}
          description="Completed"
        />
      </div>

      {/* Equity Curve Chart */}
      {equityCurve.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Portfolio Value</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityCurve}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isPositiveReturn ? '#10b981' : '#ef4444'} stopOpacity={0.2}/>
                    <stop offset="95%" stopColor={isPositiveReturn ? '#10b981' : '#ef4444'} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="date" 
                  stroke="#9ca3af" 
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short' })}
                />
                <YAxis 
                  stroke="#9ca3af" 
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '12px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                  labelStyle={{ color: '#6b7280', fontWeight: 500 }}
                  formatter={(value) => value != null ? [`$${Number(value).toLocaleString()}`, 'Portfolio'] : ['', 'Portfolio']}
                />
                <ReferenceLine y={10000} stroke="#e5e7eb" strokeDasharray="3 3" />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={isPositiveReturn ? '#10b981' : '#ef4444'}
                  strokeWidth={2}
                  fill="url(#colorValue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ 
  icon, 
  label, 
  value, 
  isGood,
  description
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: string;
  isGood?: boolean;
  description?: string;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
      <div className="flex items-center gap-2 text-gray-500 mb-2">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className={`text-xl font-bold ${
        isGood === undefined ? 'text-gray-900' : isGood ? 'text-emerald-600' : 'text-amber-600'
      }`}>
        {value}
      </div>
      {description && (
        <div className="text-xs text-gray-400 mt-1">{description}</div>
      )}
    </div>
  );
}
