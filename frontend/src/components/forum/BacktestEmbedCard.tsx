'use client';

import { useState, useCallback } from 'react';
import {
  BarChart3, TrendingUp, TrendingDown, Activity, Target,
  Loader2, Share2, Check,
} from 'lucide-react';
import api from '@/lib/api';
import type { BacktestEmbed } from '@/types';

interface BacktestEmbedCardProps {
  shareToken: string;
  symbol: string;
  className?: string;
}

export default function BacktestEmbedCard({ shareToken, symbol, className = '' }: BacktestEmbedCardProps) {
  const [data, setData] = useState<BacktestEmbed | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const loadData = useCallback(() => {
    if (loaded) return;
    setLoading(true);
    setError(null);
    api
      .getBacktestEmbed(shareToken)
      .then((bt) => {
        setData(bt);
        setLoaded(true);
      })
      .catch((err) => {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setError(typeof msg === 'string' ? msg : 'Could not load backtest results');
      })
      .finally(() => setLoading(false));
  }, [shareToken, loaded]);

  // Load on mount
  if (!loaded && !loading && !error) {
    loadData();
  }

  const handleCopyLink = () => {
    const embed = `[backtest:${shareToken}|${symbol}]`;
    navigator.clipboard.writeText(embed);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const fmtPct = (v: number | null) => v != null ? `${v.toFixed(1)}%` : '--';
  const fmtNum = (v: number | null, dp = 2) => v != null ? v.toFixed(dp) : '--';
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  const isPositive = data?.total_return != null && data.total_return >= 0;

  return (
    <div
      className={`my-3 rounded-xl border border-gray-200 bg-gradient-to-b from-gray-50 to-white overflow-hidden ${className}`}
      data-backtest-embed
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            isPositive ? 'bg-emerald-100' : 'bg-red-100'
          }`}>
            <BarChart3 className={`h-4 w-4 ${isPositive ? 'text-emerald-600' : 'text-red-600'}`} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 text-sm truncate">{symbol} Backtest</div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleCopyLink}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition"
          title="Copy embed"
        >
          {linkCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Share2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-gray-500 px-4 py-4 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading results...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {/* Metrics */}
      {data && (
        <>
          <div className="px-4 pb-3 grid grid-cols-4 gap-2">
            <MetricCell
              icon={isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              label="Return"
              value={fmtPct(data.total_return)}
              color={isPositive ? 'text-emerald-600' : 'text-red-600'}
            />
            <MetricCell
              icon={<Activity className="h-3 w-3" />}
              label="Sharpe"
              value={fmtNum(data.sharpe_ratio)}
              color={data.sharpe_ratio != null && data.sharpe_ratio > 1 ? 'text-emerald-600' : 'text-amber-600'}
            />
            <MetricCell
              icon={<TrendingDown className="h-3 w-3" />}
              label="Max DD"
              value={fmtPct(data.max_drawdown)}
              color={data.max_drawdown != null && data.max_drawdown > -20 ? 'text-emerald-600' : 'text-red-600'}
            />
            <MetricCell
              icon={<Target className="h-3 w-3" />}
              label="Win Rate"
              value={fmtPct(data.win_rate)}
              color={data.win_rate != null && data.win_rate > 50 ? 'text-emerald-600' : 'text-amber-600'}
            />
          </div>

          {/* Footer */}
          <div className="px-4 pb-3">
            <div className="text-[11px] text-gray-400">
              {data.total_trades ?? 0} trades &middot; {fmtDate(data.start_date)} &ndash; {fmtDate(data.end_date)}
              &middot; ${data.initial_capital.toLocaleString()} initial
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCell({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-100 text-center">
      <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-sm font-bold ${color}`}>{value}</div>
    </div>
  );
}
