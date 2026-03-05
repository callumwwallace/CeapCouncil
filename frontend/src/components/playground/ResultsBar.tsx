'use client';

import { ChevronDown, ChevronUp, Download } from 'lucide-react';

export interface ResultsBarProps {
  results: {
    total_return: number;
    sharpe_ratio: number;
    max_drawdown: number;
    total_trades: number;
    final_value: number;
    initial_capital: number;
    win_rate?: number;
    benchmark_return?: number;
  };
  expanded: boolean;
  onToggle: () => void;
  onExport?: () => void;
  children?: React.ReactNode; // Full results content when expanded
  renderContent?: () => React.ReactNode; // Alternative: render prop for full content
}

/** TradingView-style results bar: collapsed shows summary, expanded shows full analysis */
export default function ResultsBar({ results, expanded, onToggle, onExport, children, renderContent }: ResultsBarProps) {
  const netProfit = results.final_value - results.initial_capital;

  return (
    <div className="flex flex-col min-h-0 border-t border-gray-200 bg-white flex-shrink-0">
      {/* Collapsed bar - always visible when results exist */}
      <div className="flex items-center justify-between px-4 py-2 hover:bg-gray-50 transition-colors">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 flex items-center justify-between gap-4 text-xs text-left min-w-0"
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse results' : 'Expand results'}
        >
          <div className="flex items-center gap-6 min-w-0">
            <div className="flex items-center gap-2">
            <span className="text-gray-500 uppercase tracking-wide">Return</span>
            <span className={`font-semibold ${results.total_return >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {results.total_return >= 0 ? '+' : ''}{results.total_return.toFixed(2)}%
            </span>
            </div>
            <div className="flex items-center gap-2">
            <span className="text-gray-500 uppercase tracking-wide">Sharpe</span>
            <span className={`font-semibold ${results.sharpe_ratio > 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {results.sharpe_ratio.toFixed(2)}
            </span>
            </div>
            <div className="flex items-center gap-2">
            <span className="text-gray-500 uppercase tracking-wide">Max DD</span>
            <span className={`font-semibold ${results.max_drawdown > -20 ? 'text-emerald-400' : 'text-red-400'}`}>
              {results.max_drawdown.toFixed(1)}%
            </span>
            </div>
            <div className="flex items-center gap-2">
            <span className="text-gray-500 uppercase tracking-wide">Trades</span>
            <span className="font-semibold text-gray-900">{results.total_trades}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 uppercase tracking-wide">P&amp;L</span>
            <span className={`font-semibold ${netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {netProfit >= 0 ? '+' : ''}${netProfit.toFixed(0)}
            </span>
          </div>
          </div>
          {expanded ? <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" /> : <ChevronUp className="h-4 w-4 text-gray-500 shrink-0" />}
        </button>
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            className="p-1.5 rounded text-gray-500 hover:text-emerald-600 hover:bg-gray-100 transition shrink-0"
            title="Export report"
          >
            <Download className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Expanded content - explicit height range for reliable scroll */}
      {expanded && (
        <div className="border-t border-gray-200 overflow-y-auto overflow-x-hidden bg-gray-50/50 pb-4" style={{ height: 'min(400px, 55vh)' }}>
          {renderContent ? renderContent() : children}
        </div>
      )}
    </div>
  );
}
