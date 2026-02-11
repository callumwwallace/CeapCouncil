'use client';

import { Download, Keyboard, Clock, BarChart3, TrendingUp, TrendingDown, Activity } from 'lucide-react';

interface StatusBarProps {
  isRunning: boolean;
  results: {
    total_return: number;
    sharpe_ratio: number;
    max_drawdown: number;
    total_trades: number;
  } | null;
  lastRunTime?: string;
  onExport?: () => void;
}

export default function StatusBar({ isRunning, results, lastRunTime, onExport }: StatusBarProps) {
  return (
    <div className="h-8 bg-gray-800 border-t border-gray-700 px-4 flex items-center justify-between text-xs">
      {/* Left: Status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-yellow-500 animate-pulse' : results ? 'bg-emerald-500' : 'bg-gray-500'}`} />
          <span className="text-gray-400">
            {isRunning ? 'Running...' : results ? 'Complete' : 'Ready'}
          </span>
        </div>
        
        {lastRunTime && !isRunning && (
          <div className="flex items-center gap-1 text-gray-500">
            <Clock className="h-3 w-3" />
            <span>{lastRunTime}</span>
          </div>
        )}
      </div>

      {/* Center: Quick Metrics */}
      {results && !isRunning && (
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3 text-gray-500" />
            <span className="text-gray-400">Return:</span>
            <span className={results.total_return >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {results.total_return >= 0 ? '+' : ''}{results.total_return.toFixed(2)}%
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Activity className="h-3 w-3 text-gray-500" />
            <span className="text-gray-400">Sharpe:</span>
            <span className={results.sharpe_ratio > 1 ? 'text-emerald-400' : 'text-amber-400'}>
              {results.sharpe_ratio.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingDown className="h-3 w-3 text-gray-500" />
            <span className="text-gray-400">Drawdown:</span>
            <span className={results.max_drawdown > -20 ? 'text-emerald-400' : 'text-red-400'}>
              {results.max_drawdown.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <BarChart3 className="h-3 w-3 text-gray-500" />
            <span className="text-gray-400">Trades:</span>
            <span className="text-gray-200">{results.total_trades}</span>
          </div>
        </div>
      )}

      {/* Right: Actions & Shortcuts */}
      <div className="flex items-center gap-3">
        {results && onExport && (
          <button
            onClick={onExport}
            className="flex items-center gap-1 text-gray-400 hover:text-gray-200 transition"
            title="Export Results"
          >
            <Download className="h-3 w-3" />
            <span>Export</span>
          </button>
        )}
        <div className="flex items-center gap-1 text-gray-500">
          <Keyboard className="h-3 w-3" />
          <span>⌘↵ Run</span>
        </div>
      </div>
    </div>
  );
}
