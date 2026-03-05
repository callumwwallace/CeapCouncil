'use client';

import { useMemo, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, TrendingUp } from 'lucide-react';
import { BacktestTrade } from '@/types';

export interface TradeLogProps {
  trades: BacktestTrade[];
}

type SortKey = 'entry_date' | 'type' | 'entry_price' | 'exit_price' | 'size' | 'pnl' | 'commission';

export default function TradeLog({ trades }: TradeLogProps) {
  const [sortKey, setSortKey] = useState<SortKey>('entry_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sortedTrades = useMemo(() => {
    const arr = [...trades];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'entry_date') cmp = new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime();
      else if (sortKey === 'type') cmp = (a.type || '').localeCompare(b.type || '');
      else if (sortKey === 'entry_price') cmp = a.entry_price - b.entry_price;
      else if (sortKey === 'exit_price') cmp = a.exit_price - b.exit_price;
      else if (sortKey === 'size') cmp = a.size - b.size;
      else if (sortKey === 'pnl') cmp = a.pnl - b.pnl;
      else if (sortKey === 'commission') cmp = a.commission - b.commission;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [trades, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col ? <span className="text-gray-400">{sortDir === 'asc' ? '↑' : '↓'}</span> : null;

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
      <div className="h-full min-h-[120px] flex flex-col items-center justify-center p-8 text-center bg-gray-50 rounded-lg border border-gray-200" data-testid="trade-log-empty">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
          <TrendingUp className="h-6 w-6 text-gray-500" />
        </div>
        <h3 className="font-semibold text-gray-900 mb-1">No trades yet</h3>
        <p className="text-sm text-gray-500">Run a backtest to see trade history</p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-white rounded-lg border border-gray-200" data-testid="trade-log">
      {/* Summary Stats - compact */}
      <div className="grid grid-cols-4 gap-1.5 p-2 border-b border-gray-200 bg-gray-50 shrink-0">
        <div className="text-center">
          <div className="text-[10px] text-gray-500">Trades</div>
          <div className="text-sm font-semibold text-gray-900">{stats.totalTrades}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-gray-500">Win Rate</div>
          <div className={`text-sm font-semibold ${stats.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {stats.winRate.toFixed(0)}%
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-gray-500">Total P&L</div>
          <div className={`text-sm font-semibold ${stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-gray-500">Avg Trade</div>
          <div className={`text-sm font-semibold ${stats.avgTrade >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {stats.avgTrade >= 0 ? '+' : ''}${stats.avgTrade.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      {/* Trades Table - sortable */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
            <tr className="text-left text-[10px] text-gray-500 uppercase tracking-wider">
              <th className="px-2 py-1.5 font-medium cursor-pointer hover:text-gray-300 inline-flex items-center gap-0.5" onClick={() => handleSort('entry_date')}>Date <SortIcon col="entry_date" /></th>
              <th className="px-2 py-1.5 font-medium cursor-pointer hover:text-gray-300" onClick={() => handleSort('type')}>Type</th>
              <th className="px-2 py-1.5 font-medium text-right cursor-pointer hover:text-gray-300" onClick={() => handleSort('entry_price')}>Entry</th>
              <th className="px-2 py-1.5 font-medium text-right cursor-pointer hover:text-gray-300" onClick={() => handleSort('exit_price')}>Exit</th>
              <th className="px-2 py-1.5 font-medium text-right cursor-pointer hover:text-gray-300" onClick={() => handleSort('size')}>Size</th>
              <th className="px-2 py-1.5 font-medium text-right cursor-pointer hover:text-gray-300" onClick={() => handleSort('pnl')}><span className="inline-flex items-center gap-0.5 justify-end">P&L <SortIcon col="pnl" /></span></th>
              <th className="px-2 py-1.5 font-medium text-right cursor-pointer hover:text-gray-300" onClick={() => handleSort('commission')}>Comm.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedTrades.map((trade, index) => (
              <tr key={index} className="hover:bg-gray-50" data-testid={`trade-row-${index}`}>
                <td className="px-2 py-1.5 text-gray-600">
                  {new Date(trade.entry_date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: '2-digit',
                  })}
                </td>
                <td className="px-2 py-1.5">
                  <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    trade.type === 'LONG'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {trade.type === 'LONG' ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    {trade.type}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right font-medium text-gray-900">
                  ${trade.entry_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-2 py-1.5 text-right font-medium text-gray-900">
                  ${trade.exit_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-2 py-1.5 text-right text-gray-600">
                  {trade.size}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <div className={`font-medium ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="text-xs ml-1">
                      ({trade.pnl_pct >= 0 ? '+' : ''}{trade.pnl_pct.toFixed(1)}%)
                    </span>
                  </div>
                </td>
                <td className="px-2 py-1.5 text-right text-gray-500">
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
