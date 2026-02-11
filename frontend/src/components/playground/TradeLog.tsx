'use client';

import { useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, TrendingUp } from 'lucide-react';
import { BacktestTrade } from '@/types';

export interface TradeLogProps {
  trades: BacktestTrade[];
}

export default function TradeLog({ trades }: TradeLogProps) {
  const stats = useMemo(() => {
    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => t.pnl > 0);
    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    const avgTrade = totalTrades > 0 ? totalPnl / totalTrades : 0;
    const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;

    return {
      totalTrades,
      winRate,
      totalPnl,
      avgTrade,
    };
  }, [trades]);

  if (trades.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center" data-testid="trade-log-empty">
        <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mb-3">
          <TrendingUp className="h-6 w-6 text-gray-500" />
        </div>
        <h3 className="font-semibold text-gray-200 mb-1">No trades yet</h3>
        <p className="text-sm text-gray-500">Run a backtest to see trade history</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-800" data-testid="trade-log">
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-2 p-3 border-b border-gray-700 bg-gray-800">
        <div className="text-center">
          <div className="text-xs text-gray-500">Trades</div>
          <div className="font-semibold text-gray-100">{stats.totalTrades}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500">Win Rate</div>
          <div className={`font-semibold ${stats.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {stats.winRate.toFixed(0)}%
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500">Total P&L</div>
          <div className={`font-semibold ${stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500">Avg Trade</div>
          <div className={`font-semibold ${stats.avgTrade >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {stats.avgTrade >= 0 ? '+' : ''}${stats.avgTrade.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      {/* Trades Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-800 border-b border-gray-700">
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium text-right">Entry</th>
              <th className="px-3 py-2 font-medium text-right">Exit</th>
              <th className="px-3 py-2 font-medium text-right">Size</th>
              <th className="px-3 py-2 font-medium text-right">P&L</th>
              <th className="px-3 py-2 font-medium text-right">Comm.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {trades.map((trade, index) => (
              <tr key={index} className="hover:bg-gray-750" data-testid={`trade-row-${index}`}>
                <td className="px-3 py-2 text-gray-300">
                  {new Date(trade.entry_date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: '2-digit',
                  })}
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                    trade.type === 'LONG'
                      ? 'bg-emerald-900/50 text-emerald-400'
                      : 'bg-red-900/50 text-red-400'
                  }`}>
                    {trade.type === 'LONG' ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    {trade.type}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-medium text-gray-100">
                  ${trade.entry_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-3 py-2 text-right font-medium text-gray-100">
                  ${trade.exit_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-3 py-2 text-right text-gray-300">
                  {trade.size}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className={`font-medium ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="text-xs ml-1">
                      ({trade.pnl_pct >= 0 ? '+' : ''}{trade.pnl_pct.toFixed(1)}%)
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right text-gray-400">
                  ${trade.commission.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
