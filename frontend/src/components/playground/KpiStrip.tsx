'use client';

import type { BacktestResult } from '@/app/playground/types';

interface KpiStripProps {
  results: BacktestResult;
}

interface KpiItemProps {
  label: string;
  value: string;
  color?: 'green' | 'red' | 'amber' | 'neutral';
}

function KpiItem({ label, value, color = 'neutral' }: KpiItemProps) {
  const valueColor =
    color === 'green'
      ? 'text-emerald-500'
      : color === 'red'
      ? 'text-red-400'
      : color === 'amber'
      ? 'text-amber-400'
      : 'text-gray-800';

  return (
    <div className="flex items-baseline gap-1.5 px-3 border-r border-gray-200 last:border-r-0">
      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider whitespace-nowrap">
        {label}
      </span>
      <span className={`text-xs font-bold tabular-nums ${valueColor}`}>{value}</span>
    </div>
  );
}

export default function KpiStrip({ results }: KpiStripProps) {
  const netProfit = results.final_value - results.initial_capital;

  const returnColor = results.total_return >= 0 ? 'green' : 'red';
  const sharpeColor = results.sharpe_ratio >= 1.5 ? 'green' : results.sharpe_ratio >= 1 ? 'amber' : 'red';
  const ddAbs = Math.abs(results.max_drawdown);
  const ddColor: 'green' | 'amber' | 'red' = ddAbs < 10 ? 'green' : ddAbs < 20 ? 'amber' : 'red';
  const pnlColor = netProfit >= 0 ? 'green' : 'red';

  const alphaColor =
    results.alpha !== undefined
      ? results.alpha > 0
        ? 'green'
        : 'red'
      : 'neutral';

  return (
    <div className="flex-shrink-0 flex items-center h-8 bg-white border-b border-gray-200 overflow-x-auto overflow-y-hidden">
      <KpiItem
        label="Return"
        value={`${results.total_return >= 0 ? '+' : ''}${results.total_return.toFixed(2)}%`}
        color={returnColor}
      />
      <KpiItem
        label="P&L"
        value={`${netProfit >= 0 ? '+' : ''}$${Math.abs(netProfit).toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
        color={pnlColor}
      />
      <KpiItem
        label="Sharpe"
        value={results.sharpe_ratio.toFixed(2)}
        color={sharpeColor}
      />
      <KpiItem
        label="Max DD"
        value={`${results.max_drawdown.toFixed(1)}%`}
        color={ddColor}
      />
      <KpiItem
        label="Trades"
        value={String(results.total_trades)}
        color="neutral"
      />
      {results.win_rate !== undefined && (
        <KpiItem
          label="Win Rate"
          value={`${results.win_rate.toFixed(0)}%`}
          color={results.win_rate >= 50 ? 'green' : 'amber'}
        />
      )}
      {results.sortino_ratio !== undefined && (
        <KpiItem
          label="Sortino"
          value={results.sortino_ratio.toFixed(2)}
          color={results.sortino_ratio >= 1 ? 'green' : 'amber'}
        />
      )}
      <KpiItem
        label="Calmar"
        value={results.calmar_ratio != null ? results.calmar_ratio.toFixed(2) : '—'}
        color={results.calmar_ratio != null ? (results.calmar_ratio >= 1 ? 'green' : 'amber') : 'neutral'}
      />
      {results.profit_factor !== undefined && (
        <KpiItem
          label="Prof. Factor"
          value={results.profit_factor.toFixed(2)}
          color={results.profit_factor >= 1.5 ? 'green' : results.profit_factor >= 1 ? 'amber' : 'red'}
        />
      )}
      {results.alpha !== undefined && results.benchmark_return !== undefined && (
        <KpiItem
          label="Alpha"
          value={`${results.alpha >= 0 ? '+' : ''}${results.alpha.toFixed(1)}%`}
          color={alphaColor}
        />
      )}
      {results.volatility_annual !== undefined && (
        <KpiItem
          label="Vol (Ann.)"
          value={`${results.volatility_annual.toFixed(1)}%`}
          color="neutral"
        />
      )}
    </div>
  );
}
