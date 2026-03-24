'use client';

import { useState } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Download,
  Share2,
  Check,
  LayoutDashboard,
  ArrowLeftRight,
  ListOrdered,
  LineChart as LineChartIcon,
  Sliders,
  GitBranch,
  Filter,
  Layers,
  PieChart,
  Shuffle,
  Shield,
  Calendar,
  BarChart2,
  GitCompare,
  Activity,
  Bell,
} from 'lucide-react';
import type { BacktestResult } from '@/app/playground/types';
import type { ExtractedParam } from '@/app/playground/extractParams';
import type { useAnalytics } from '@/app/playground/useAnalytics';
import ResultsTabContent from '@/components/playground/results/ResultsTabContent';

type AnalyticsState = ReturnType<typeof useAnalytics>;

type ResultsTab =
  | 'summary'
  | 'trades'
  | 'orders'
  | 'charts'
  | 'alerts'
  | 'compare'
  | 'optimize'
  | 'walkforward'
  | 'oos'
  | 'cpcv'
  | 'factors'
  | 'montecarlo'
  | 'risk'
  | 'tca'
  | 'heatmap'
  | 'distribution';

export interface ResultsSidebarProps {
  results: BacktestResult;
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  width: number;
  onResizeStart: (e: React.MouseEvent) => void;
  onExport?: () => void;
  backtestShareToken?: string | null;
  symbol?: string;
  activeTab: ResultsTab;
  onTabChange: (tab: ResultsTab) => void;
  analytics: AnalyticsState;
  paramDefs: ExtractedParam[];
}

// Compact stat row
interface StatRowProps {
  label: string;
  value: string;
  valueColor?: string;
  subLabel?: string;
}

function StatRow({ label, value, valueColor = 'text-gray-900', subLabel }: StatRowProps) {
  return (
    <div className="flex items-center justify-between py-[3px] border-b border-gray-100 last:border-0">
      <span className="text-[10px] text-gray-500 uppercase tracking-wide leading-none">
        {label}
        {subLabel && <span className="text-gray-400 normal-case tracking-normal ml-1">({subLabel})</span>}
      </span>
      <span className={`text-[11px] font-semibold tabular-nums ${valueColor}`}>{value}</span>
    </div>
  );
}

function sectionDivider(label: string) {
  return (
    <div className="flex items-center gap-2 pt-2 pb-1">
      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{label}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────
export default function ResultsSidebar({
  results,
  collapsed,
  onCollapse,
  width,
  onResizeStart,
  onExport,
  backtestShareToken,
  symbol,
  activeTab,
  onTabChange,
  analytics,
  paramDefs,
}: ResultsSidebarProps) {
  const [shareCopied, setShareCopied] = useState(false);
  const [showAnalysisTabs, setShowAnalysisTabs] = useState(false);

  const netProfit = results.final_value - results.initial_capital;
  const alpha =
    results.benchmark_return !== undefined
      ? results.total_return - results.benchmark_return
      : undefined;

  const handleShareToForum = () => {
    if (!backtestShareToken || !symbol) return;
    navigator.clipboard.writeText(`[backtest:${backtestShareToken}|${symbol}]`);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2500);
  };

  // Collapsed: narrow strip with expand button
  if (collapsed) {
    return (
      <div className="flex-shrink-0 flex flex-col items-center border-l border-gray-200 bg-white w-7 relative select-none">
        {/* Resize handle (stays when collapsed) */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-emerald-400/30 transition-colors"
          onMouseDown={onResizeStart}
        />
        <button
          onClick={() => onCollapse(false)}
          className="mt-2 p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-emerald-600 transition-colors"
          title="Expand results"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {/* "Results" label, rotated vertically */}
        <div className="mt-4 flex-1 flex items-center justify-center">
          <span
            className="text-[9px] font-bold text-gray-300 uppercase tracking-widest"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            Results
          </span>
        </div>
      </div>
    );
  }

  // Primary tab nav
  const alertCount = results.alerts?.length ?? 0;
  const primaryTabs: { id: ResultsTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { id: 'summary', label: 'Summary', icon: LayoutDashboard },
    { id: 'trades', label: 'Trades', icon: ArrowLeftRight },
    { id: 'orders', label: 'Orders', icon: ListOrdered },
    { id: 'charts', label: 'Charts', icon: LineChartIcon },
    { id: 'alerts', label: 'Alerts', icon: Bell, badge: alertCount },
  ];

  const analysisTabs: { id: ResultsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'tca', label: 'TCA', icon: Activity },
    { id: 'optimize', label: 'Optimize', icon: Sliders },
    { id: 'walkforward', label: 'Walk-Fwd', icon: GitBranch },
    { id: 'oos', label: 'OOS', icon: Filter },
    { id: 'cpcv', label: 'CPCV', icon: Layers },
    { id: 'factors', label: 'Factors', icon: PieChart },
    { id: 'montecarlo', label: 'Monte Carlo', icon: Shuffle },
    { id: 'risk', label: 'Risk', icon: Shield },
    { id: 'heatmap', label: 'Monthly', icon: Calendar },
    { id: 'distribution', label: 'Dist.', icon: BarChart2 },
    { id: 'compare', label: 'Compare', icon: GitCompare },
  ];

  const isAnalysisTab = analysisTabs.some((t) => t.id === activeTab);

  return (
    <div
      className="flex-shrink-0 flex flex-col border-l border-gray-200 bg-white overflow-hidden relative"
      style={{ width }}
    >
      {/* Resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-emerald-400/40 transition-colors z-10"
        onMouseDown={onResizeStart}
      />

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-gray-200 bg-gray-50/60">
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Results</span>
        <div className="flex items-center gap-0.5">
          {backtestShareToken && symbol && (
            <button
              onClick={handleShareToForum}
              className="p-1.5 rounded text-gray-400 hover:text-emerald-600 hover:bg-gray-100 transition"
              title={shareCopied ? 'Embed copied!' : 'Copy forum embed'}
            >
              {shareCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Share2 className="h-3.5 w-3.5" />}
            </button>
          )}
          {onExport && (
            <button
              onClick={onExport}
              className="p-1.5 rounded text-gray-400 hover:text-emerald-600 hover:bg-gray-100 transition"
              title="Export tearsheet"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => onCollapse(true)}
            className="p-1.5 rounded text-gray-400 hover:text-emerald-600 hover:bg-gray-100 transition"
            title="Collapse sidebar"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Compact stats (when Summary tab is active) */}
      {activeTab === 'summary' && <div className="flex-1 overflow-y-auto min-h-0 px-3 pt-2 pb-1">
        {/* Performance section */}
        {sectionDivider('Performance')}
        <StatRow
          label="Return"
          value={`${results.total_return >= 0 ? '+' : ''}${results.total_return.toFixed(2)}%`}
          valueColor={results.total_return >= 0 ? 'text-emerald-600' : 'text-red-500'}
        />
        {results.cagr != null && (
          <StatRow
            label="CAGR"
            value={`${results.cagr >= 0 ? '+' : ''}${results.cagr.toFixed(2)}%`}
            valueColor={results.cagr >= 0 ? 'text-emerald-600' : 'text-red-500'}
          />
        )}
        <StatRow
          label="Net Profit"
          value={`${netProfit >= 0 ? '+' : ''}$${Math.abs(netProfit).toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
          valueColor={netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}
        />
        {alpha != null && (
          <StatRow
            label="Alpha"
            subLabel="vs B&H"
            value={`${alpha >= 0 ? '+' : ''}${alpha.toFixed(1)}%`}
            valueColor={alpha >= 0 ? 'text-emerald-600' : 'text-red-500'}
          />
        )}
        {results.benchmark_return != null && (
          <StatRow
            label="Benchmark"
            value={`${results.benchmark_return >= 0 ? '+' : ''}${results.benchmark_return.toFixed(2)}%`}
            valueColor="text-gray-500"
          />
        )}
        {results.information_ratio != null && (
          <StatRow
            label="Info. Ratio"
            value={results.information_ratio.toFixed(2)}
            valueColor={results.information_ratio >= 0.5 ? 'text-emerald-600' : 'text-amber-600'}
          />
        )}

        {/* Risk */}
        {sectionDivider('Risk')}
        <StatRow
          label="Max Drawdown"
          value={`${results.max_drawdown.toFixed(1)}%`}
          valueColor={results.max_drawdown > -10 ? 'text-emerald-600' : results.max_drawdown > -20 ? 'text-amber-600' : 'text-red-500'}
        />
        <StatRow
          label="Sharpe"
          value={results.sharpe_ratio.toFixed(2)}
          valueColor={results.sharpe_ratio >= 1.5 ? 'text-emerald-600' : results.sharpe_ratio >= 1 ? 'text-amber-600' : 'text-red-500'}
        />
        {results.sortino_ratio != null && (
          <StatRow
            label="Sortino"
            value={results.sortino_ratio.toFixed(2)}
            valueColor={results.sortino_ratio >= 1 ? 'text-emerald-600' : 'text-amber-600'}
          />
        )}
        {results.calmar_ratio != null && (
          <StatRow
            label="Calmar"
            value={results.calmar_ratio.toFixed(2)}
            valueColor={results.calmar_ratio >= 1 ? 'text-emerald-600' : 'text-amber-600'}
          />
        )}
        {results.treynor_ratio != null && (
          <StatRow
            label="Treynor"
            value={results.treynor_ratio.toFixed(2)}
            valueColor={results.treynor_ratio >= 0 ? 'text-emerald-600' : 'text-red-500'}
          />
        )}
        {results.beta != null && (
          <StatRow
            label="Beta"
            value={results.beta.toFixed(2)}
            valueColor={Math.abs(results.beta) < 1 ? 'text-emerald-600' : 'text-amber-600'}
          />
        )}
        {results.var_95 != null && (
          <StatRow
            label="VaR"
            subLabel="95%"
            value={`${results.var_95.toFixed(2)}%`}
            valueColor="text-red-400"
          />
        )}
        {results.cvar_95 != null && (
          <StatRow
            label="CVaR"
            subLabel="95%"
            value={`${results.cvar_95.toFixed(2)}%`}
            valueColor="text-red-400"
          />
        )}
        {results.volatility_annual != null && (
          <StatRow
            label="Volatility"
            subLabel="ann."
            value={`${results.volatility_annual.toFixed(1)}%`}
            valueColor="text-gray-600"
          />
        )}
        {results.deflated_sharpe_ratio != null && (
          <StatRow
            label="PSR"
            subLabel="deflated"
            value={results.deflated_sharpe_ratio.toFixed(2)}
            valueColor={results.deflated_sharpe_ratio >= 0.95 ? 'text-emerald-600' : results.deflated_sharpe_ratio >= 0.5 ? 'text-amber-600' : 'text-red-500'}
          />
        )}

        {/* Trades section */}
        {sectionDivider('Trades')}
        <StatRow label="Total Trades" value={String(results.total_trades)} />
        {results.num_days != null && results.num_days > 0 && (
          <StatRow
            label="Trades / Day"
            value={(results.total_trades / results.num_days).toFixed(3)}
            valueColor="text-gray-600"
          />
        )}
        {results.win_rate != null && (
          <StatRow
            label="Win Rate"
            value={`${results.win_rate.toFixed(0)}%`}
            valueColor={results.win_rate >= 50 ? 'text-emerald-600' : 'text-amber-600'}
          />
        )}
        {results.loss_rate != null && (
          <StatRow
            label="Loss Rate"
            value={`${results.loss_rate.toFixed(0)}%`}
            valueColor={results.loss_rate <= 50 ? 'text-amber-600' : 'text-red-500'}
          />
        )}
        {results.profit_factor != null && (
          <StatRow
            label="Profit Factor"
            value={results.profit_factor.toFixed(2)}
            valueColor={results.profit_factor >= 1.5 ? 'text-emerald-600' : results.profit_factor >= 1 ? 'text-amber-600' : 'text-red-500'}
          />
        )}
        {results.avg_win != null && (
          <StatRow
            label="Avg Win"
            value={`$${results.avg_win.toFixed(2)}`}
            valueColor="text-emerald-600"
          />
        )}
        {results.avg_loss != null && (
          <StatRow
            label="Avg Loss"
            value={`$${results.avg_loss.toFixed(2)}`}
            valueColor="text-red-500"
          />
        )}
        {results.expectancy != null && (
          <StatRow
            label="Expectancy"
            value={`$${results.expectancy.toFixed(2)}`}
            valueColor={results.expectancy >= 0 ? 'text-emerald-600' : 'text-red-500'}
          />
        )}
        {results.avg_trade_duration != null && (
          <StatRow label="Avg Duration" value={`${results.avg_trade_duration.toFixed(0)}d`} />
        )}
        {results.max_consecutive_losses != null && (
          <StatRow label="Max Consec. Losses" value={String(results.max_consecutive_losses)} valueColor="text-red-400" />
        )}
        {results.exposure_pct != null && (
          <StatRow label="Exposure" value={`${results.exposure_pct.toFixed(1)}%`} valueColor="text-gray-600" />
        )}

        {/* Costs */}
        {(results.total_commission != null || results.total_slippage != null) && (
          <>
            {sectionDivider('Costs')}
            {results.total_commission != null && (
              <StatRow label="Commission" value={`$${results.total_commission.toFixed(2)}`} valueColor="text-gray-600" />
            )}
            {results.total_slippage != null && (
              <StatRow label="Slippage" value={`$${results.total_slippage.toFixed(2)}`} valueColor="text-gray-600" />
            )}
            {results.total_spread_cost != null && results.total_spread_cost > 0 && (
              <StatRow label="Spread Cost" value={`$${results.total_spread_cost.toFixed(2)}`} valueColor="text-gray-600" />
            )}
            {results.cost_as_pct_of_pnl != null && (
              <StatRow label="Cost / P&L" value={`${results.cost_as_pct_of_pnl.toFixed(1)}%`} valueColor="text-gray-600" />
            )}
          </>
        )}
      </div>}

      {/* Tab content (Trades, Orders, Charts, etc.) */}
      {activeTab !== 'summary' && (
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
          <ResultsTabContent
            results={results}
            activeTab={activeTab}
            onTabChange={onTabChange}
            analytics={analytics}
            paramDefs={paramDefs}
            hideTabNav
          />
        </div>
      )}

      {/* Tab nav (sub-tabs expand upward when open) */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-gray-50/40">
        {/* Analysis sub-tabs expand above primary tabs */}
        {(showAnalysisTabs || isAnalysisTab) && (
          <div className="grid grid-cols-4 gap-1 p-1.5 border-b border-gray-200 bg-white">
            {analysisTabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => { onTabChange(id); }}
                className={`flex flex-col items-center gap-0.5 py-1.5 px-1 text-[9px] font-medium rounded transition-all ${
                  activeTab === id
                    ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/30'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100 border border-transparent'
                }`}
              >
                <Icon className="h-3 w-3 opacity-80" />
                <span className="truncate w-full text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Primary tabs */}
        <div className="flex">
          {primaryTabs.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => { onTabChange(id); setShowAnalysisTabs(false); }}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 text-[9px] font-medium transition-all border-t-2 ${
                activeTab === id && !isAnalysisTab
                  ? 'border-emerald-500 text-emerald-600 bg-emerald-50/40'
                  : 'border-transparent text-gray-400 hover:text-gray-700 hover:bg-gray-100/60'
              }`}
            >
              <div className="relative">
                <Icon className="h-3.5 w-3.5" />
                {badge != null && badge > 0 && (
                  <span className="absolute -top-1 -right-1.5 min-w-[10px] h-[10px] px-0.5 rounded-full bg-amber-400 text-[7px] font-bold text-white flex items-center justify-center leading-none">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </div>
              <span className="uppercase tracking-wide">{label}</span>
            </button>
          ))}
          {/* Analysis tab toggle */}
          <button
            onClick={() => setShowAnalysisTabs((v) => !v)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 text-[9px] font-medium transition-all border-t-2 ${
              isAnalysisTab || showAnalysisTabs
                ? 'border-emerald-500 text-emerald-600 bg-emerald-50/40'
                : 'border-transparent text-gray-400 hover:text-gray-700 hover:bg-gray-100/60'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span className="uppercase tracking-wide">Analysis</span>
          </button>
        </div>
      </div>

    </div>
  );
}
