'use client';

import {
  Play,
  Loader2,
  LayoutDashboard,
  ArrowLeftRight,
  ListOrdered,
  LineChart as LineChartIcon,
  Activity,
  Sliders,
  GitBranch,
  Filter,
  Layers,
  PieChart as PieChartIcon,
  Shuffle,
  Shield,
  Calendar,
  BarChart2,
  BarChart3,
  GitCompare,
  AlertCircle,
  TrendingDown,
  Target,
  Bell,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  ReferenceLine,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  PieChart,
  Pie,
} from 'recharts';
import TradeLog from '@/components/playground/TradeLog';
import ErrorBoundary from '@/components/ErrorBoundary';
import type { BacktestResult } from '@/app/playground/types';
import type { ExtractedParam } from '@/app/playground/extractParams';
import type { useAnalytics } from '@/app/playground/useAnalytics';

type AnalyticsState = ReturnType<typeof useAnalytics>;

type ResultsTab = 'summary' | 'trades' | 'orders' | 'charts' | 'alerts' | 'compare' | 'optimize' | 'walkforward' | 'oos' | 'cpcv' | 'factors' | 'montecarlo' | 'risk' | 'tca' | 'heatmap' | 'distribution';

interface ResultsTabContentProps {
  results: BacktestResult;
  activeTab: ResultsTab;
  onTabChange: (tab: ResultsTab) => void;
  analytics: AnalyticsState;
  paramDefs: ExtractedParam[];
  /** Hides built-in tab nav when sidebar owns it */
  hideTabNav?: boolean;
}

export default function ResultsTabContent({
  results,
  activeTab: activeResultsTab,
  onTabChange: setActiveResultsTab,
  analytics,
  paramDefs,
  hideTabNav = false,
}: ResultsTabContentProps) {
  const {
    optimizeResults, walkForwardResults, oosResults, cpcvResults, factorResults, monteCarloResults,
    optimizeLoading, walkForwardLoading, oosLoading, cpcvLoading, factorLoading, monteCarloLoading,
    optimizeMethod, setOptimizeMethod,
    heatmapParamX, setHeatmapParamX,
    heatmapParamY, setHeatmapParamY,
    walkForwardPurgeBars, setWalkForwardPurgeBars,
    walkForwardWindowMode, setWalkForwardWindowMode,
    oosNfolds, setOosNfolds,
    cpcvNGroups, setCpcvNGroups,
    cpcvPurgeBars, setCpcvPurgeBars,
    lastBacktestId,
    handleRunOptimization, handleRunWalkForward, handleRunOos,
    handleRunCpcv, handleRunFactorAttribution, handleRunMonteCarlo,
  } = analytics;

  // Stats shown in chart headers
  const equityValues = results.equity_curve?.map((p) => p.equity) ?? [];
  const pnl =
    equityValues.length >= 2
      ? ((equityValues.at(-1)! - equityValues[0]) / equityValues[0]) * 100
      : null;
  // drawdown_pct is positive (9.09 = 9%). Worst = max of these
  const maxDrawdown = results.drawdown_series?.length
    ? Math.max(...results.drawdown_series.map((p) => p.drawdown_pct))
    : null;
  const lastSharpe =
    results.rolling_sharpe?.filter((p) => p.value != null).at(-1)?.value ?? null;
  const lastSortino =
    results.rolling_sortino?.filter((p) => p.value != null).at(-1)?.value ?? null;

  const tooltipStyle: React.CSSProperties = {
    background: 'var(--color-surface, #ffffff)',
    border: '0.5px solid rgba(0,0,0,0.1)',
    borderRadius: '6px',
    fontSize: 11,
    fontFamily: 'monospace',
    color: 'inherit',
    padding: '6px 10px',
  };

  return (
                <div className="p-3 pb-6">
                  {!hideTabNav && <div className="space-y-3 pb-3 border-b border-gray-200">
                    <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Analysis</div>
                    {/* main tabs */}
                    <div className="flex gap-1 p-1 rounded-lg bg-gray-100 border border-gray-200">
                      {(['summary', 'trades', 'orders', 'charts'] as const).map((tab) => {
                        const primaryIcons = { summary: LayoutDashboard, trades: ArrowLeftRight, orders: ListOrdered, charts: LineChartIcon };
                        const Icon = primaryIcons[tab];
                        return (
                      <button
                        key={tab}
                        onClick={() => setActiveResultsTab(tab)}
                            className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium rounded-md transition-all duration-150 ${
                              activeResultsTab === tab
                                ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/40 shadow-sm'
                                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/80 border border-transparent'
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{tab === 'summary' ? 'Summary' : tab === 'trades' ? 'Trades' : tab === 'orders' ? 'Orders' : 'Charts'}</span>
                      </button>
                        );
                      })}
                  </div>
                    {/* advanced tabs */}
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['tca', 'optimize', 'walkforward', 'oos', 'cpcv', 'factors', 'montecarlo', 'risk', 'heatmap', 'distribution', 'compare'] as const).map((tab) => {
                        const secondaryIcons = { tca: Activity, optimize: Sliders, walkforward: GitBranch, oos: Filter, cpcv: Layers, factors: PieChartIcon, montecarlo: Shuffle, risk: Shield, heatmap: Calendar, distribution: BarChart2, compare: GitCompare };
                        const Icon = secondaryIcons[tab];
                        const label = ({ tca: 'TCA', optimize: 'Optimize', walkforward: 'Walk-Fwd', oos: 'OOS', cpcv: 'CPCV', factors: 'Factors', montecarlo: 'Monte Carlo', risk: 'Risk', heatmap: 'Monthly', distribution: 'Dist.', compare: 'Compare' } as Record<string, string>)[tab];
                        return (
                      <button
                        key={tab}
                        onClick={() => setActiveResultsTab(tab)}
                            className={`flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium rounded-md transition-all duration-150 ${
                              activeResultsTab === tab
                                ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/30'
                                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/80 border border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <Icon className="h-3 w-3 shrink-0 opacity-80" />
                            <span className="truncate">{label}</span>
                      </button>
                        );
                      })}
                  </div>
                </div>}
                  <div className="pt-3 min-h-[200px] flex flex-col">
                <ErrorBoundary label="Results">
                      {activeResultsTab === 'summary' && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className={`p-3 rounded-lg border ${results.total_return >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                              <div className="text-[10px] text-gray-500 uppercase tracking-wide">Return</div>
                              <div className={`text-xl font-bold ${results.total_return >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {results.total_return >= 0 ? '+' : ''}{results.total_return.toFixed(2)}%
                  </div>
                  </div>
                            <div className={`p-3 rounded-lg border ${(results.final_value - results.initial_capital) >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                              <div className="text-[10px] text-gray-500 uppercase tracking-wide">Net Profit</div>
                              <div className={`text-xl font-bold ${(results.final_value - results.initial_capital) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {(results.final_value - results.initial_capital) >= 0 ? '+' : ''}${(results.final_value - results.initial_capital).toFixed(0)}
                  </div>
                        </div>
                            <div className="p-3 rounded-lg border bg-gray-50 border-gray-200">
                              <div className="text-[10px] text-gray-500 uppercase tracking-wide">Max Drawdown</div>
                              <div className={`text-xl font-bold ${results.max_drawdown > -20 ? 'text-emerald-600' : 'text-red-500'}`}>{results.max_drawdown.toFixed(1)}%</div>
                        </div>
                            <div className="p-3 rounded-lg border bg-gray-50 border-gray-200">
                              <div className="text-[10px] text-gray-500 uppercase tracking-wide">Trades</div>
                              <div className="text-xl font-bold text-gray-900">{results.total_trades}</div>
                      </div>
                          </div>
                      {results.benchmark_return !== undefined && (
                            <div className="p-2 rounded-lg border border-gray-200 bg-gray-50 flex justify-between items-center">
                              <span className="text-[11px] text-gray-500">vs Buy &amp; Hold</span>
                              <span className={results.total_return > results.benchmark_return ? 'text-emerald-600' : 'text-amber-600'}>
                                Alpha {(results.total_return - results.benchmark_return) >= 0 ? '+' : ''}{(results.total_return - results.benchmark_return).toFixed(1)}%
                            </span>
                        </div>
                      )}
                          <div className="grid grid-cols-2 gap-1.5">
                            <div className="p-2 rounded-lg border border-gray-200 bg-gray-50">
                              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-1"><Activity className="h-3 w-3" /> Sharpe</div>
                              <div className={`text-sm font-semibold ${results.sharpe_ratio > 1 ? 'text-emerald-600' : 'text-amber-600'}`}>{results.sharpe_ratio.toFixed(2)}</div>
                          </div>
                            <div className="p-2 rounded-lg border border-gray-200 bg-gray-50">
                              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-1"><TrendingDown className="h-3 w-3" /> Drawdown</div>
                              <div className={`text-sm font-semibold ${results.max_drawdown > -20 ? 'text-emerald-600' : 'text-red-500'}`}>{results.max_drawdown.toFixed(1)}%</div>
                          </div>
                            <div className="p-2 rounded-lg border border-gray-200 bg-gray-50">
                              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-1"><Target className="h-3 w-3" /> Win Rate</div>
                              <div className={`text-sm font-semibold ${results.win_rate && results.win_rate > 50 ? 'text-emerald-600' : 'text-amber-600'}`}>{results.win_rate?.toFixed(0) ?? 0}%</div>
                        </div>
                            <div className="p-2 rounded-lg border border-gray-200 bg-gray-50">
                              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-1"><BarChart3 className="h-3 w-3" /> Trades</div>
                              <div className="text-sm font-semibold text-gray-900">{results.total_trades}</div>
                          </div>
                          </div>
                          {(results as { versioning?: { code_hash?: string; data_hash?: string; config_hash?: string } }).versioning && (
                            <div className="p-2 rounded-lg border border-gray-200 bg-gray-50 text-[10px] text-gray-500" title="config/code/data hashed">
                              Reproducible run
                            </div>
                          )}
                            </div>
                          )}
                      {activeResultsTab === 'trades' && (
                        <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-gray-200 overflow-hidden">
                          <TradeLog trades={results.trades ?? []} />
                            </div>
                          )}
                      {activeResultsTab === 'orders' && results.orders && results.orders.length > 0 && (
                        <div className="space-y-2 overflow-x-auto">
                          <div className="text-xs font-semibold text-gray-500 mb-2">{results.orders.length} Orders</div>
                            <table className="w-full text-xs">
                              <thead>
                              <tr className="text-gray-500 border-b border-gray-200">
                                  <th className="text-left py-1 px-1">Side</th>
                                  <th className="text-left py-1 px-1">Type</th>
                                  <th className="text-right py-1 px-1">Qty</th>
                                  <th className="text-right py-1 px-1">Fill Price</th>
                                  <th className="text-right py-1 px-1">Comm.</th>
                                  <th className="text-left py-1 px-1">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {results.orders.slice(0, 100).map((order, i) => (
                                  <tr key={i} className="border-b border-gray-200 hover:bg-gray-50">
                                  <td className={`py-1 px-1 ${order.side === 'buy' ? 'text-emerald-600' : 'text-red-600'}`}>{order.side.toUpperCase()}</td>
                                    <td className="py-1 px-1 text-gray-700">{order.order_type}</td>
                                    <td className="py-1 px-1 text-right text-gray-700">{order.filled_quantity}</td>
                                    <td className="py-1 px-1 text-right text-gray-900">${order.avg_fill_price.toFixed(2)}</td>
                                    <td className="py-1 px-1 text-right text-gray-500">${order.commission.toFixed(2)}</td>
                                  <td className="py-1 px-1"><span className={`text-[10px] px-1 py-0.5 rounded ${order.status === 'filled' ? 'bg-emerald-50 text-emerald-700' : order.status === 'cancelled' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{order.status}</span></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                        </div>
                      )}
                      {activeResultsTab === 'orders' && (!results.orders || results.orders.length === 0) && (
                        <div className="text-center py-8 text-gray-500 text-xs">Order history shown above.</div>
                      )}
                      {activeResultsTab === 'charts' && (
                        <div className="space-y-3">
                          {results.equity_curve?.length ? (
                            <div>
                              <div className="flex items-baseline justify-between mb-1">
                                <span className="text-[11px] font-medium text-gray-500">Equity curve</span>
                                {pnl != null && (
                                  <span className={`text-[11px] font-mono font-medium ${pnl >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                    {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
                                  </span>
                                )}
                              </div>
                              <div className="h-24">
                                <ResponsiveContainer width="100%" height="100%">
                                  <AreaChart
                                    data={results.equity_curve.map((p) => ({ ...p, value: p.equity }))}
                                    margin={{ top: 4, right: 48, bottom: 0, left: 0 }}
                                  >
                                    <defs>
                                      <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
                                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                                      </linearGradient>
                                    </defs>
                                    <XAxis dataKey="date" hide />
                                    <YAxis
                                      orientation="right"
                                      width={44}
                                      tickCount={3}
                                      tickLine={false}
                                      axisLine={false}
                                      tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#9ca3af' }}
                                      tickFormatter={(v: number) =>
                                        v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`
                                      }
                                      domain={['auto', 'auto']}
                                    />
                                    <Tooltip
                                      contentStyle={tooltipStyle}
                                      formatter={(v) => [`$${Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, 'Equity']}
                                      labelFormatter={(l) => String(l ?? '')}
                                      cursor={{ stroke: 'rgba(0,0,0,0.1)', strokeWidth: 1 }}
                                    />
                                    <Area
                                      type="monotone"
                                      dataKey="value"
                                      stroke="#10b981"
                                      fill="url(#eqGrad)"
                                      strokeWidth={1.5}
                                    />
                                  </AreaChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          ) : null}
                          {results.drawdown_series?.length ? (
                            <div>
                              <div className="flex items-baseline justify-between mb-1">
                                <span className="text-[11px] font-medium text-gray-500">Drawdown</span>
                                {maxDrawdown != null && maxDrawdown > 0 && (
                                  <span className="text-[11px] font-mono font-medium text-red-600">
                                    −{maxDrawdown.toFixed(1)}%
                                  </span>
                                )}
                              </div>
                              <div className="h-16">
                                <ResponsiveContainer width="100%" height="100%">
                                  <AreaChart
                                    data={results.drawdown_series}
                                    margin={{ top: 4, right: 48, bottom: 0, left: 0 }}
                                  >
                                    <defs>
                                      <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
                                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                                      </linearGradient>
                                    </defs>
                                    <XAxis dataKey="date" hide />
                                    <YAxis
                                      orientation="right"
                                      width={44}
                                      tickCount={3}
                                      tickLine={false}
                                      axisLine={false}
                                      tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#9ca3af' }}
                                      tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                                      domain={['auto', 0]}
                                    />
                                    <Tooltip
                                      contentStyle={tooltipStyle}
                                      formatter={(v) => [`${Number(v ?? 0).toFixed(2)}%`, 'Drawdown']}
                                      labelFormatter={(l) => String(l ?? '')}
                                      cursor={{ stroke: 'rgba(0,0,0,0.1)', strokeWidth: 1 }}
                                    />
                                    <Area
                                      type="monotone"
                                      dataKey="drawdown_pct"
                                      stroke="#ef4444"
                                      fill="url(#ddGrad)"
                                      strokeWidth={1.5}
                                    />
                                  </AreaChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          ) : null}
                          {/* Top-5 worst drawdown periods */}
                          {results.drawdown_series && results.drawdown_series.length > 1 && (() => {
                            type DdPeriod = { start: string; trough: string; end: string; depth: number; duration: number };
                            const dd = results.drawdown_series;
                            const periods: DdPeriod[] = [];
                            let inDd = false;
                            let start = '';
                            let troughDate = '';
                            let troughDepth = 0;
                            let startIdx = 0;
                            for (let i = 0; i < dd.length; i++) {
                              const pt = dd[i]!;
                              if (!inDd && pt.drawdown_pct > 0) {
                                inDd = true;
                                start = pt.date;
                                startIdx = i;
                                troughDate = pt.date;
                                troughDepth = pt.drawdown_pct;
                              } else if (inDd) {
                                if (pt.drawdown_pct > troughDepth) {
                                  troughDepth = pt.drawdown_pct;
                                  troughDate = pt.date;
                                }
                                if (pt.drawdown_pct === 0 || i === dd.length - 1) {
                                  periods.push({ start, trough: troughDate, end: pt.date, depth: troughDepth, duration: i - startIdx });
                                  inDd = false;
                                  troughDepth = 0;
                                }
                              }
                            }
                            const top5 = [...periods].sort((a, b) => b.depth - a.depth).slice(0, 5);
                            if (top5.length === 0) return null;
                            return (
                              <div>
                                <div className="text-[11px] font-medium text-gray-500 mb-1">Top Drawdown Periods</div>
                                <div className="rounded-lg border border-gray-200 overflow-hidden">
                                  <table className="w-full text-[10px]">
                                    <thead>
                                      <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                                        <th className="text-left px-2 py-1.5 font-medium">Start</th>
                                        <th className="text-left px-2 py-1.5 font-medium">Trough</th>
                                        <th className="text-right px-2 py-1.5 font-medium">Depth</th>
                                        <th className="text-right px-2 py-1.5 font-medium">Days</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                      {top5.map((p, i) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                          <td className="px-2 py-1.5 font-mono text-gray-600">{p.start}</td>
                                          <td className="px-2 py-1.5 font-mono text-gray-600">{p.trough}</td>
                                          <td className="px-2 py-1.5 text-right font-mono text-red-600">−{p.depth.toFixed(1)}%</td>
                                          <td className="px-2 py-1.5 text-right font-mono text-gray-600">{p.duration}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          })()}
                          {/* Crisis Events */}
                          {(() => {
                            const CRISES = [
                              { name: 'GFC 2008',       start: '2008-09-01', end: '2009-03-31', color: 'text-red-600' },
                              { name: 'COVID Crash',    start: '2020-02-01', end: '2020-04-30', color: 'text-orange-600' },
                              { name: 'Bear 2022',      start: '2022-01-01', end: '2022-12-31', color: 'text-amber-600' },
                              { name: 'Rate Hike 2018', start: '2018-10-01', end: '2018-12-31', color: 'text-yellow-700' },
                            ];
                            const ec = results.equity_curve ?? [];
                            const rows = CRISES.map(c => {
                              const startPt = ec.find(p => p.date >= c.start);
                              const endPt = [...ec].reverse().find(p => p.date <= c.end);
                              if (!startPt || !endPt || startPt.date >= endPt.date) return null;
                              const ret = ((endPt.equity - startPt.equity) / startPt.equity) * 100;
                              return { ...c, ret, startDate: startPt.date, endDate: endPt.date };
                            }).filter(Boolean) as Array<{ name: string; ret: number; startDate: string; endDate: string; color: string }>;
                            return (
                              <div>
                                <div className="text-[11px] font-medium text-gray-500 mb-1">Crisis Events</div>
                                {rows.length > 0 ? (
                                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                                    <table className="w-full text-[10px]">
                                      <thead>
                                        <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                                          <th className="text-left px-2 py-1.5 font-medium">Event</th>
                                          <th className="text-left px-2 py-1.5 font-medium">Period</th>
                                          <th className="text-right px-2 py-1.5 font-medium">Return</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                        {rows.map((r) => (
                                          <tr key={r.name} className="hover:bg-gray-50">
                                            <td className={`px-2 py-1.5 font-medium ${r.color}`}>{r.name}</td>
                                            <td className="px-2 py-1.5 font-mono text-gray-500">{r.startDate} → {r.endDate}</td>
                                            <td className={`px-2 py-1.5 text-right font-mono font-semibold ${r.ret >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                              {r.ret >= 0 ? '+' : ''}{r.ret.toFixed(1)}%
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[10px] text-gray-400">
                                    No known crisis periods overlap this backtest range. Extend your backtest to 2008, 2018, 2020, or 2022 to see crisis performance.
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                          {results.rolling_sharpe?.length ? (
                            <div>
                              <div className="flex items-baseline justify-between mb-1">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="text-[11px] font-medium text-gray-500">Rolling Sharpe</span>
                                  <span className="text-[10px] text-gray-400 font-mono">(63-day)</span>
                                </div>
                                {lastSharpe != null && (
                                  <span className={`text-[11px] font-mono font-medium ${lastSharpe >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                    {lastSharpe.toFixed(2)}
                                  </span>
                                )}
                              </div>
                              <div className="h-16">
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart
                                    data={results.rolling_sharpe}
                                    margin={{ top: 4, right: 48, bottom: 0, left: 0 }}
                                  >
                                    <XAxis dataKey="date" hide />
                                    <YAxis
                                      orientation="right"
                                      width={44}
                                      tickCount={3}
                                      tickLine={false}
                                      axisLine={false}
                                      tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#9ca3af' }}
                                      tickFormatter={(v: number) => v.toFixed(1)}
                                      domain={['auto', 'auto']}
                                    />
                                    <ReferenceLine
                                      y={0}
                                      stroke="rgba(0,0,0,0.15)"
                                      strokeDasharray="3 3"
                                      strokeWidth={1}
                                    />
                                    <Tooltip
                                      contentStyle={tooltipStyle}
                                      formatter={(v) => [v != null && typeof v === 'number' ? v.toFixed(2) : '—', 'Sharpe']}
                                      labelFormatter={(l) => String(l ?? '')}
                                      cursor={{ stroke: 'rgba(0,0,0,0.1)', strokeWidth: 1 }}
                                    />
                                    <Line
                                      type="monotone"
                                      dataKey="value"
                                      stroke="#10b981"
                                      strokeWidth={1.5}
                                      dot={false}
                                      connectNulls={false}
                                    />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          ) : null}
                          {results.rolling_sortino?.length ? (
                            <div>
                              <div className="flex items-baseline justify-between mb-1">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="text-[11px] font-medium text-gray-500">Rolling Sortino</span>
                                  <span className="text-[10px] text-gray-400 font-mono">(63-day)</span>
                                </div>
                                {lastSortino != null && (
                                  <span className={`text-[11px] font-mono font-medium ${lastSortino >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                    {lastSortino.toFixed(2)}
                                  </span>
                                )}
                              </div>
                              <div className="h-16">
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart
                                    data={results.rolling_sortino}
                                    margin={{ top: 4, right: 48, bottom: 0, left: 0 }}
                                  >
                                    <XAxis dataKey="date" hide />
                                    <YAxis
                                      orientation="right"
                                      width={44}
                                      tickCount={3}
                                      tickLine={false}
                                      axisLine={false}
                                      tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#9ca3af' }}
                                      tickFormatter={(v: number) => v.toFixed(1)}
                                      domain={['auto', 'auto']}
                                    />
                                    <ReferenceLine
                                      y={0}
                                      stroke="rgba(0,0,0,0.15)"
                                      strokeDasharray="3 3"
                                      strokeWidth={1}
                                    />
                                    <Tooltip
                                      contentStyle={tooltipStyle}
                                      formatter={(v) => [v != null && typeof v === 'number' ? v.toFixed(2) : '—', 'Sortino']}
                                      labelFormatter={(l) => String(l ?? '')}
                                      cursor={{ stroke: 'rgba(0,0,0,0.1)', strokeWidth: 1 }}
                                    />
                                    <Line
                                      type="monotone"
                                      dataKey="value"
                                      stroke="#6366f1"
                                      strokeWidth={1.5}
                                      dot={false}
                                      connectNulls={false}
                                    />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          ) : null}
                          {/* Daily Returns */}
                          {results.equity_curve && results.equity_curve.length >= 2 && (() => {
                            const ec = results.equity_curve;
                            const dailyReturns = ec.map((p, i) =>
                              i === 0 ? null : {
                                date: p.date,
                                pct: ((p.equity - ec[i - 1].equity) / ec[i - 1].equity) * 100,
                              }
                            ).filter(Boolean) as { date: string; pct: number }[];
                            // Throttle to ~200 bars for perf
                            const maxBars = 200;
                            const displayed = dailyReturns.length > maxBars
                              ? dailyReturns.filter((_, i) => i % Math.ceil(dailyReturns.length / maxBars) === 0)
                              : dailyReturns;
                            return (
                              <div>
                                <div className="flex items-baseline justify-between mb-1">
                                  <span className="text-[11px] font-medium text-gray-500">Daily Returns</span>
                                  <span className="text-[10px] text-gray-400 font-mono">%</span>
                                </div>
                                <div className="h-16">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={displayed} margin={{ top: 4, right: 48, bottom: 0, left: 0 }} barCategoryGap="10%">
                                      <XAxis dataKey="date" hide />
                                      <YAxis
                                        orientation="right"
                                        width={44}
                                        tickCount={3}
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#9ca3af' }}
                                        tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                                        domain={['auto', 'auto']}
                                      />
                                      <ReferenceLine y={0} stroke="rgba(0,0,0,0.15)" strokeWidth={1} />
                                      <Tooltip
                                        contentStyle={tooltipStyle}
                                        formatter={(v) => [typeof v === 'number' ? `${v.toFixed(3)}%` : '—', 'Return']}
                                        labelFormatter={(l) => String(l ?? '')}
                                        cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                                      />
                                      <Bar dataKey="pct" maxBarSize={6}>
                                        {displayed.map((entry, index) => (
                                          <Cell key={index} fill={entry.pct >= 0 ? '#3b82f6' : '#9ca3af'} />
                                        ))}
                                      </Bar>
                                    </BarChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>
                            );
                          })()}
                          {/* Annual Returns */}
                          {results.equity_curve && results.equity_curve.length >= 2 && (() => {
                            const ec = results.equity_curve;
                            const byYear: Record<string, { first: number; last: number }> = {};
                            for (const p of ec) {
                              const yr = p.date.slice(0, 4);
                              if (!byYear[yr]) byYear[yr] = { first: p.equity, last: p.equity };
                              byYear[yr].last = p.equity;
                            }
                            const annualReturns = Object.entries(byYear).map(([year, { first, last }]) => ({
                              year,
                              pct: ((last / first) - 1) * 100,
                            }));
                            if (annualReturns.length < 1) return null;
                            return (
                              <div>
                                <div className="flex items-baseline justify-between mb-1">
                                  <span className="text-[11px] font-medium text-gray-500">Annual Returns</span>
                                  <span className="text-[10px] text-gray-400 font-mono">%</span>
                                </div>
                                <div className="h-16">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={annualReturns} margin={{ top: 4, right: 48, bottom: 0, left: 0 }} barCategoryGap="20%">
                                      <XAxis
                                        dataKey="year"
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#9ca3af' }}
                                      />
                                      <YAxis
                                        orientation="right"
                                        width={44}
                                        tickCount={3}
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#9ca3af' }}
                                        tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                                        domain={['auto', 'auto']}
                                      />
                                      <ReferenceLine y={0} stroke="rgba(0,0,0,0.15)" strokeWidth={1} />
                                      <Tooltip
                                        contentStyle={tooltipStyle}
                                        formatter={(v) => [typeof v === 'number' ? `${v.toFixed(2)}%` : '—', 'Return']}
                                        labelFormatter={(l) => String(l ?? '')}
                                        cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                                      />
                                      <Bar dataKey="pct" maxBarSize={40}>
                                        {annualReturns.map((entry, index) => (
                                          <Cell key={index} fill={entry.pct >= 0 ? '#3b82f6' : '#9ca3af'} />
                                        ))}
                                      </Bar>
                                    </BarChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>
                            );
                          })()}
                          {/* Asset Allocation donut */}
                          {results.trades && results.trades.length > 0 && (() => {
                            const trades = results.trades;
                            const hasShorts = trades.some(t => t.type === 'SHORT');
                            type Slice = { name: string; value: number; color: string };
                            let slices: Slice[];
                            if (hasShorts) {
                              const longWins = trades.filter(t => t.type === 'LONG' && t.pnl > 0).length;
                              const longLoss = trades.filter(t => t.type === 'LONG' && t.pnl <= 0).length;
                              const shortWins = trades.filter(t => t.type === 'SHORT' && t.pnl > 0).length;
                              const shortLoss = trades.filter(t => t.type === 'SHORT' && t.pnl <= 0).length;
                              slices = [
                                { name: 'Long wins', value: longWins, color: '#10b981' },
                                { name: 'Long losses', value: longLoss, color: '#6ee7b7' },
                                { name: 'Short wins', value: shortWins, color: '#3b82f6' },
                                { name: 'Short losses', value: shortLoss, color: '#93c5fd' },
                              ].filter(s => s.value > 0);
                            } else {
                              const wins = trades.filter(t => t.pnl > 0).length;
                              const losses = trades.filter(t => t.pnl <= 0).length;
                              slices = [
                                { name: 'Winners', value: wins, color: '#10b981' },
                                { name: 'Losers', value: losses, color: '#f87171' },
                              ];
                            }
                            const total = slices.reduce((s, x) => s + x.value, 0);
                            if (total === 0) return null;
                            return (
                              <div>
                                <div className="flex items-baseline justify-between mb-1">
                                  <span className="text-[11px] font-medium text-gray-500">Trade Allocation</span>
                                  <span className="text-[10px] text-gray-400 font-mono">{total} trades</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="h-20 w-20 shrink-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <PieChart>
                                        <Pie
                                          data={slices}
                                          cx="50%"
                                          cy="50%"
                                          innerRadius="55%"
                                          outerRadius="80%"
                                          dataKey="value"
                                          strokeWidth={0}
                                        >
                                          {slices.map((s, i) => (
                                            <Cell key={i} fill={s.color} />
                                          ))}
                                        </Pie>
                                        <Tooltip
                                          contentStyle={tooltipStyle}
                                          formatter={(v, name) => [`${v} trades (${((Number(v) / total) * 100).toFixed(0)}%)`, name]}
                                        />
                                      </PieChart>
                                    </ResponsiveContainer>
                                  </div>
                                  <div className="flex-1 space-y-1">
                                    {slices.map((s) => (
                                      <div key={s.name} className="flex items-center justify-between text-[10px]">
                                        <div className="flex items-center gap-1.5">
                                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                                          <span className="text-gray-600">{s.name}</span>
                                        </div>
                                        <span className="font-mono text-gray-900">{s.value} ({((s.value / total) * 100).toFixed(0)}%)</span>
                                      </div>
                                    ))}
                                    {results.exposure_pct != null && (
                                      <div className="pt-1 text-[10px] text-gray-400 border-t border-gray-100">
                                        {results.exposure_pct.toFixed(0)}% time in market
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                          {results.custom_charts && Object.keys(results.custom_charts).length > 0 && (
                            <div className="space-y-2 pt-1">
                              <div className="text-[10px] text-gray-400 uppercase tracking-wider">Custom series</div>
                              {Object.entries(results.custom_charts).map(([name, data]) =>
                                data?.length ? (
                                  <div key={name}>
                                    <div className="text-[11px] font-medium text-gray-500 mb-1">{name}</div>
                                    <div className="h-14">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={data} margin={{ top: 2, right: 48, bottom: 0, left: 0 }}>
                                          <XAxis dataKey="date" hide />
                                          <YAxis
                                            orientation="right"
                                            width={44}
                                            tickCount={2}
                                            tickLine={false}
                                            axisLine={false}
                                            tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#9ca3af' }}
                                            tickFormatter={(v: number) => v.toFixed(2)}
                                          />
                                          <Tooltip
                                            contentStyle={tooltipStyle}
                                            formatter={(v) => [Number(v ?? 0).toFixed(4), name]}
                                            cursor={{ stroke: 'rgba(0,0,0,0.1)', strokeWidth: 1 }}
                                          />
                                          <Line
                                            type="monotone"
                                            dataKey="value"
                                            stroke="#6366f1"
                                            strokeWidth={1.5}
                                            dot={false}
                                          />
                                        </LineChart>
                                      </ResponsiveContainer>
                                    </div>
                                  </div>
                                ) : null
                              )}
                            </div>
                          )}
                          {(results.equity_curve?.length ?? 0) < 2 &&
                            !results.drawdown_series?.length &&
                            !results.rolling_sharpe?.length &&
                            !results.rolling_sortino?.length &&
                            (!results.custom_charts || Object.keys(results.custom_charts).length === 0) && (
                              <div className="text-center py-6 text-gray-400 text-xs">No chart data.</div>
                            )}
                        </div>
                      )}
                      {activeResultsTab === 'alerts' && (
                        <div className="space-y-1.5">
                          {results.alerts && results.alerts.length > 0 ? (
                            results.alerts.map((alert, i) => {
                              const levelStyles = {
                                critical: 'bg-red-50 border-red-200 text-red-700',
                                warning:  'bg-amber-50 border-amber-200 text-amber-700',
                                info:     'bg-blue-50 border-blue-200 text-blue-700',
                              }[alert.level] ?? 'bg-gray-50 border-gray-200 text-gray-700';
                              const badgeStyles = {
                                critical: 'bg-red-100 text-red-700',
                                warning:  'bg-amber-100 text-amber-700',
                                info:     'bg-blue-100 text-blue-700',
                              }[alert.level] ?? 'bg-gray-100 text-gray-600';
                              return (
                                <div key={i} className={`rounded-lg border px-3 py-2 ${levelStyles}`}>
                                  <div className="flex items-center justify-between gap-2 mb-0.5">
                                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${badgeStyles}`}>
                                      {alert.level}
                                    </span>
                                    <span className="text-[10px] font-mono text-gray-400 shrink-0">{alert.timestamp}</span>
                                  </div>
                                  <p className="text-[11px] leading-snug">{alert.message}</p>
                                </div>
                              );
                            })
                          ) : (
                            <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
                              <Bell className="h-5 w-5 opacity-40" />
                              <span className="text-xs">No alerts fired during this backtest.</span>
                            </div>
                          )}
                        </div>
                      )}
                      {activeResultsTab === 'optimize' && (
                        <div className="space-y-3">
                          {paramDefs.length > 0 ? (
                            <>
                              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Configuration</div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <select value={optimizeMethod} onChange={(e) => setOptimizeMethod(e.target.value as typeof optimizeMethod)} className="px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-md text-gray-900">
                                    <option value="grid">Grid</option>
                                    <option value="bayesian">Bayesian</option>
                                    <option value="genetic">Genetic</option>
                                    <option value="multiobjective">Multi-objective</option>
                                    <option value="heatmap">Heatmap</option>
                                  </select>
                                  {optimizeMethod === 'heatmap' && (
                                    <>
                                      <select value={heatmapParamX} onChange={(e) => setHeatmapParamX(e.target.value)} className="px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-md text-gray-900">
                                        <option value="">Param X</option>
                                        {paramDefs.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                                      </select>
                                      <select value={heatmapParamY} onChange={(e) => setHeatmapParamY(e.target.value)} className="px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-md text-gray-900">
                                        <option value="">Param Y</option>
                                        {paramDefs.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                                      </select>
                                    </>
                                  )}
                                  <button onClick={handleRunOptimization} disabled={optimizeLoading || (optimizeMethod === 'heatmap' && (!heatmapParamX || !heatmapParamY || heatmapParamX === heatmapParamY))} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium">
                                    {optimizeLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run
                                  </button>
                          </div>
                            </div>
                              {optimizeResults?.error && (
                                <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs">{optimizeResults.error}</div>
                              )}
                              {optimizeResults && !optimizeResults.error && optimizeResults.results && !optimizeResults.x_values && (
                                <div className="rounded-lg border border-gray-200 overflow-hidden">
                                  <div className="overflow-x-auto max-h-48 overflow-y-auto">
                                    <table className="w-full text-xs">
                                      <thead className="bg-gray-50 sticky top-0">
                                        <tr className="text-gray-500 border-b border-gray-200">
                                          {Object.keys(optimizeResults.results[0]?.params || {}).map(k => <th key={k} className="text-left py-2 px-2 font-medium">{k}</th>)}
                                          <th className="text-right py-2 px-2 font-medium">Sharpe</th>
                                          <th className="text-right py-2 px-2 font-medium">Return</th>
                                          <th className="text-right py-2 px-2 font-medium">Max DD</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {optimizeResults.results.slice(0, 20).map((r: { params: Record<string, number>; sharpe_ratio?: number; total_return?: number; max_drawdown?: number }, i: number) => (
                                          <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                                            {Object.values(r.params || {}).map((v, j) => <td key={j} className="py-1.5 px-2 font-mono text-gray-700">{v}</td>)}
                                            <td className="text-right py-1.5 px-2">{r.sharpe_ratio?.toFixed(2) ?? '-'}</td>
                                            <td className="text-right py-1.5 px-2">{(r.total_return ?? 0).toFixed(1)}%</td>
                                            <td className="text-right py-1.5 px-2">{(r.max_drawdown ?? 0).toFixed(1)}%</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                            </div>
                            </div>
                              )}
                              {optimizeResults && !optimizeResults.error && optimizeResults.x_values && optimizeResults.y_values && optimizeResults.z_values && (() => {
                                const xs = optimizeResults.x_values;
                                const ys = optimizeResults.y_values;
                                const zs = optimizeResults.z_values;
                                const metricLabel = (optimizeResults.metric ?? 'sharpe_ratio') === 'sharpe_ratio' ? 'Sharpe' : (optimizeResults.metric ?? '').replace(/_/g, ' ');
                                const flat = zs.flat().filter((v): v is number => v != null && typeof v === 'number');
                                const zMin = flat.length ? Math.min(...flat) : 0;
                                const zMax = flat.length ? Math.max(...flat) : 1;
                                const range = zMax - zMin || 1;
                                const sorted = [...flat].sort((a, b) => a - b);
                                const zMed = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
                                const validCount = flat.length;
                                const totalCount = xs.length * ys.length;
                                let optYi = 0, optXi = 0, optV = -Infinity;
                                zs.forEach((row, yi) =>
                                  row.forEach((v, xi) => {
                                    if (v != null && v > optV) { optV = v; optYi = yi; optXi = xi; }
                                  })
                                );
                                const toColor = (v: number | null) => {
                                  if (v == null) return 'rgb(229 231 235)';
                                  const t = (v - zMin) / range;
                                  const r = Math.round(239 - t * 223);
                                  const g = Math.round(68 + t * 117);
                                  const b = Math.round(68 + t * 61);
                                  return `rgb(${r} ${g} ${b})`;
                                };
                                const norm = (v: number) => (v - zMin) / range;
                                const textColor = (v: number | null) => {
                                  if (v == null) return undefined;
                                  return norm(v) > 0.55 ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.75)';
                                };
                                return (
                                  <div className="space-y-2">
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                                      {optimizeResults.param_x} × {optimizeResults.param_y} — {metricLabel}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 text-[10px] mb-2">
                                      <span className="uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-500">
                                        {metricLabel}
                                      </span>
                                      {[['best', zMax], ['worst', zMin], ['median', zMed]].map(([label, val]) => (
                                        <span key={label} className="text-gray-400">
                                          {label} <strong className="text-gray-700 font-medium">{(val as number).toFixed(3)}</strong>
                                        </span>
                                      ))}
                                      <span className="text-gray-400">
                                        valid <strong className="text-gray-700 font-medium">{validCount}/{totalCount}</strong>
                                      </span>
                                    </div>
                                    <div className="overflow-auto max-h-64 rounded-lg border border-gray-200">
                                      <table className="w-full text-[10px] border-collapse">
                                        <thead>
                                          <tr>
                                            <th className="p-0.5 bg-gray-50 border border-gray-200 font-medium text-gray-500" />
                                            {xs.map((x, i) => (
                                              <th key={i} className="p-0.5 bg-gray-50 border border-gray-200 font-mono text-gray-600 min-w-[38px]">{x}</th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {ys.map((y, yi) => (
                                            <tr key={yi}>
                                              <td className="p-0.5 bg-gray-50 border border-gray-200 font-mono text-gray-600 sticky left-0 h-7">{y}</td>
                                              {xs.map((_, xi) => {
                                                const v = zs[yi]?.[xi];
                                                return (
                                                  <td
                                                    key={xi}
                                                    className="p-0.5 border border-gray-200 text-center font-medium min-w-[38px] h-7 cursor-crosshair relative"
                                                    style={{
                                                      backgroundColor: toColor(v ?? null),
                                                      color: textColor(v ?? null),
                                                    }}
                                                    title={`${optimizeResults.param_x}=${xs[xi]} ${optimizeResults.param_y}=${y} ${metricLabel}=${v != null ? v.toFixed(4) : 'N/A'}`}
                                                  >
                                                    {v != null ? v.toFixed(2) : '—'}
                                                    {yi === optYi && xi === optXi && (
                                                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-black opacity-70 ml-0.5 align-middle" />
                                                    )}
                                                  </td>
                                                );
                                              })}
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                    <div className="flex items-center gap-2 mt-2">
                                      <span className="text-[10px] font-mono text-gray-400 w-8 text-right">{zMin.toFixed(2)}</span>
                                      <div
                                        className="flex-1 h-2 rounded-full"
                                        style={{
                                          background: `linear-gradient(to right, ${toColor(zMin)}, ${toColor((zMin + zMax) / 2)}, ${toColor(zMax)})`,
                                        }}
                                      />
                                      <span className="text-[10px] font-mono text-gray-400 w-8">{zMax.toFixed(2)}</span>
                                    </div>
                                    {validCount === 0 && (
                                      <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px]">
                                        All backtests failed. {optimizeResults.error && (
                                          <span>Error: {optimizeResults.error}</span>
                                        )}
                                        {optimizeResults.first_failing_combo && (
                                          <span className="block mt-1 font-mono text-[10px]">
                                            First failing combo: {JSON.stringify(optimizeResults.first_failing_combo)}
                                          </span>
                                        )}
                                        {!optimizeResults.error && (
                                          <span>Common causes: constraints too strict, param names mismatch, or insufficient data. Run a single backtest first.</span>
                                        )}
                                      </div>
                                    )}
                                    {validCount > 0 && optimizeResults.warning && (
                                      <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px]">
                                        {optimizeResults.warning}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                        </>
                      ) : (
                            <div className="text-center py-8 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 text-xs">No tunable parameters detected. Add <code className="bg-gray-200 px-1 rounded">self.params.setdefault(&apos;key&apos;, value)</code> to your strategy code.</div>
                          )}
                        </div>
                      )}
                      {activeResultsTab === 'oos' && (
                        <div className="space-y-3">
                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                            <div className="text-[11px] font-medium text-gray-700 mb-1">Out-of-sample validation</div>
                            <p className="text-[11px] text-gray-500 mb-2">Optimize params on in-sample data, then test on held-out OOS period to detect overfitting.</p>
                            <div>
                              <label className="text-[10px] text-gray-500 block mb-0.5">Folds</label>
                              <select value={oosNfolds} onChange={(e) => setOosNfolds(parseInt(e.target.value, 10))} className="w-full px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900">
                                <option value={1}>1 (single split)</option>
                                <option value={3}>3 (k-fold)</option>
                                <option value={5}>5 (k-fold)</option>
                              </select>
                    </div>
                            <button onClick={handleRunOos} disabled={oosLoading} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition">
                              {oosLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run OOS Validation
                          </button>
                      </div>
                          {oosResults?.error && (
                            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs">{oosResults.error}</div>
                          )}
                          {oosResults && !oosResults.error && (oosResults.is_result || (oosResults.n_folds ?? 0) > 1) && (
                            <div className="space-y-2">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">IS vs OOS</div>
                        <div className="grid grid-cols-2 gap-2">
                                {oosResults.is_result ? (
                                  <>
                                    <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                      <div className="text-[10px] text-gray-500">In-sample</div>
                                      <div className="text-xs font-mono text-gray-700">{oosResults.is_period}</div>
                                      <div className="text-sm font-semibold text-gray-900">Sharpe {(oosResults.is_sharpe ?? 0).toFixed(2)} · Return {(oosResults.is_result?.total_return ?? 0).toFixed(1)}%</div>
                          </div>
                                    <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                      <div className="text-[10px] text-gray-500">Out-of-sample</div>
                                      <div className="text-xs font-mono text-gray-700">{oosResults.oos_period}</div>
                                      <div className={`text-sm font-semibold ${(oosResults.oos_sharpe ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>Sharpe {(oosResults.oos_sharpe ?? 0).toFixed(2)} · Return {(oosResults.oos_result?.total_return ?? 0).toFixed(1)}%</div>
                          </div>
                                  </>
                                ) : (oosResults.n_folds ?? 0) > 1 ? (
                                  <div className="col-span-2 p-3 rounded-lg border border-gray-200 bg-white">
                                    <div className="text-[10px] text-gray-500">K-fold cross-validation</div>
                                    <div className="text-sm font-semibold text-gray-900">Sharpe {oosResults.oos_sharpe_mean?.toFixed(2)} ± {oosResults.oos_sharpe_std?.toFixed(2)} · Return {(oosResults.oos_return_mean ?? 0).toFixed(1)}% ± {(oosResults.oos_return_std ?? 0).toFixed(1)}%</div>
                        </div>
                                ) : null}
                              </div>
                              {oosResults.multiple_testing_note && (
                                <div className="p-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-[11px]">{oosResults.multiple_testing_note}</div>
                              )}
                              {oosResults.overfit_score != null && (
                                <div className={`p-2 rounded-lg border text-xs ${oosResults.overfit_score > 50 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-gray-50 border-gray-200'}`}>
                                  Overfit score: <span className="font-semibold">{oosResults.overfit_score}%</span> {oosResults.overfit_score > 50 ? '(high – strategy may be overfit)' : '(low – good generalization)'}
                        </div>
                      )}
                              {(oosResults.n_folds ?? 0) > 1 && !oosResults.is_result && (
                                <div className="p-2 rounded-lg border border-gray-200 bg-gray-50 text-xs">
                                  <span className="font-medium">K-fold ({oosResults.n_folds} folds):</span> Sharpe {oosResults.oos_sharpe_mean?.toFixed(2)} ± {oosResults.oos_sharpe_std?.toFixed(2)} · Return {(oosResults.oos_return_mean ?? 0).toFixed(1)}% ± {(oosResults.oos_return_std ?? 0).toFixed(1)}%
                          </div>
                        )}
                              {Object.keys(oosResults.best_params || {}).length > 0 && (
                                <div className="text-[10px] text-gray-500">Best params: {JSON.stringify(oosResults.best_params)}</div>
                        )}
                      </div>
                          )}
                          {oosResults && !oosResults.error && !oosResults.is_result && oosResults.status === 'completed' && (
                            <div className="px-3 py-4 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 text-xs text-center">No optimization – run with param_ranges for IS/OOS comparison.</div>
                          )}
                        </div>
                      )}
                      {activeResultsTab === 'cpcv' && (
                        <div className="space-y-3">
                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                            <div className="text-[11px] font-medium text-gray-700 mb-1">Combinatorial Purged Cross-Validation</div>
                            <p className="text-[11px] text-gray-500 mb-2">Tests every combination of held-out groups with purging to prevent look-ahead bias. Produces a distribution of OOS performance — not just one number.</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] text-gray-500 block mb-0.5">Groups (N)</label>
                                <select value={cpcvNGroups} onChange={(e) => setCpcvNGroups(parseInt(e.target.value, 10))} className="w-full px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900">
                                  {[4, 5, 6, 8, 10].map(n => (
                                    <option key={n} value={n}>{n} groups ({n * (n - 1) / 2} paths)</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="text-[10px] text-gray-500 block mb-0.5">Purge bars</label>
                                <input type="number" min={0} max={100} value={cpcvPurgeBars} onChange={(e) => setCpcvPurgeBars(Math.max(0, parseInt(e.target.value, 10) || 0))} className="w-full px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900" title="purge bars" />
                              </div>
                            </div>
                            <button onClick={handleRunCpcv} disabled={cpcvLoading} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition">
                              {cpcvLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run CPCV
                            </button>
                          </div>
                          {cpcvResults?.error && (
                            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs">{cpcvResults.error}</div>
                          )}
                          {cpcvResults && !cpcvResults.error && cpcvResults.status === 'completed' && (
                            <div className="space-y-3">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">OOS Distribution ({cpcvResults.valid_paths} / {cpcvResults.total_paths} paths)</div>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                  <div className="text-[10px] text-gray-500">OOS Sharpe (mean)</div>
                                  <div className={`text-sm font-semibold ${(cpcvResults.oos_sharpe_mean ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{(cpcvResults.oos_sharpe_mean ?? 0).toFixed(2)}</div>
                                </div>
                                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                  <div className="text-[10px] text-gray-500">OOS Sharpe (std)</div>
                                  <div className="text-sm font-semibold text-gray-900">± {(cpcvResults.oos_sharpe_std ?? 0).toFixed(2)}</div>
                                </div>
                                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                  <div className="text-[10px] text-gray-500">Median Sharpe</div>
                                  <div className={`text-sm font-semibold ${(cpcvResults.oos_sharpe_median ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{(cpcvResults.oos_sharpe_median ?? 0).toFixed(2)}</div>
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                  <div className="text-[10px] text-gray-500">OOS Return (mean)</div>
                                  <div className={`text-sm font-semibold ${(cpcvResults.oos_return_mean ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{(cpcvResults.oos_return_mean ?? 0).toFixed(1)}%</div>
                                </div>
                                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                  <div className="text-[10px] text-gray-500">Train Sharpe (mean)</div>
                                  <div className="text-sm font-semibold text-gray-900">{(cpcvResults.train_sharpe_mean ?? 0).toFixed(2)}</div>
                                </div>
                                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                  <div className="text-[10px] text-gray-500">P(OOS Loss)</div>
                                  <div className={`text-sm font-semibold ${(cpcvResults.prob_oos_loss ?? 0) > 50 ? 'text-red-500' : 'text-emerald-600'}`}>{(cpcvResults.prob_oos_loss ?? 0).toFixed(0)}%</div>
                                </div>
                              </div>
                              {cpcvResults.overfit_score != null && (
                                <div className={`p-2 rounded-lg border text-xs ${cpcvResults.overfit_score > 50 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-gray-50 border-gray-200'}`}>
                                  Overfit score: <span className="font-semibold">{cpcvResults.overfit_score}%</span> {cpcvResults.overfit_score > 50 ? '(high – strategy may be overfit)' : '(low – good generalization)'}
                                </div>
                              )}
                              {cpcvResults.paths && cpcvResults.paths.length > 0 && (
                                <div>
                                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Path Details</div>
                                  <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
                                    <table className="w-full text-[11px]">
                                      <thead className="bg-gray-50 sticky top-0">
                                        <tr>
                                          <th className="px-2 py-1 text-left text-gray-500 font-medium">Path</th>
                                          <th className="px-2 py-1 text-left text-gray-500 font-medium">Test Groups</th>
                                          <th className="px-2 py-1 text-right text-gray-500 font-medium">Train Sharpe</th>
                                          <th className="px-2 py-1 text-right text-gray-500 font-medium">OOS Sharpe</th>
                                          <th className="px-2 py-1 text-right text-gray-500 font-medium">OOS Return</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                        {cpcvResults.paths.map((p: any) => (
                                          <tr key={p.path} className="hover:bg-gray-50">
                                            <td className="px-2 py-1 text-gray-700">{p.path}</td>
                                            <td className="px-2 py-1 text-gray-500 font-mono">[{p.test_groups.join(', ')}]</td>
                                            <td className="px-2 py-1 text-right text-gray-700">{p.train_sharpe != null ? p.train_sharpe.toFixed(2) : '-'}</td>
                                            <td className={`px-2 py-1 text-right font-medium ${(p.test_sharpe ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{p.test_sharpe != null ? p.test_sharpe.toFixed(2) : '-'}</td>
                                            <td className={`px-2 py-1 text-right ${(p.test_return ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{p.test_return != null ? `${p.test_return.toFixed(1)}%` : '-'}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {activeResultsTab === 'factors' && (
                        <div className="space-y-3">
                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                            <div className="text-[11px] font-medium text-gray-700 mb-1">Multi-Factor Attribution</div>
                            <p className="text-[11px] text-gray-500 mb-2">Decomposes returns into Market, Size (SMB), Value (HML), and Momentum factors. Shows how much of your return is true alpha vs. factor exposure.</p>
                            <button onClick={handleRunFactorAttribution} disabled={factorLoading || !lastBacktestId} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition">
                              {factorLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run Factor Attribution
                            </button>
                            {!lastBacktestId && (
                              <p className="text-[10px] text-amber-600">Run a backtest first to enable factor attribution.</p>
                            )}
                          </div>
                          {factorResults?.error && (
                            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs">{factorResults.error}</div>
                          )}
                          {factorResults && !factorResults.error && factorResults.status === 'completed' && (
                            <div className="space-y-3">
                              {/* alpha */}
                              <div className={`p-3 rounded-lg border ${factorResults.alpha_significant ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-white'}`}>
                                <div className="flex items-baseline justify-between">
                                  <div>
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Annualized Alpha</div>
                                    <div className={`text-xl font-bold ${(factorResults.alpha_annual_pct ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{(factorResults.alpha_annual_pct ?? 0) >= 0 ? '+' : ''}{(factorResults.alpha_annual_pct ?? 0).toFixed(2)}%</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-[10px] text-gray-500">t-stat: {(factorResults.alpha_t_stat ?? 0).toFixed(2)}</div>
                                    <div className={`text-[11px] font-medium ${factorResults.alpha_significant ? 'text-emerald-600' : 'text-amber-600'}`}>
                                      {factorResults.alpha_significant ? 'Statistically significant' : 'Not significant (p > 0.05)'}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* model fit */}
                              <div className="grid grid-cols-3 gap-2">
                                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                  <div className="text-[10px] text-gray-500">R²</div>
                                  <div className="text-sm font-semibold text-gray-900">{((factorResults.r_squared ?? 0) * 100).toFixed(1)}%</div>
                                  <div className="text-[10px] text-gray-400">{(factorResults.r_squared ?? 0) > 0.7 ? 'Well explained' : (factorResults.r_squared ?? 0) > 0.3 ? 'Partially explained' : 'Mostly unexplained'}</div>
                                </div>
                                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                  <div className="text-[10px] text-gray-500">Strategy Return (ann.)</div>
                                  <div className={`text-sm font-semibold ${(factorResults.strategy_annual_return_pct ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{(factorResults.strategy_annual_return_pct ?? 0).toFixed(1)}%</div>
                                </div>
                                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                  <div className="text-[10px] text-gray-500">Observations</div>
                                  <div className="text-sm font-semibold text-gray-900">{factorResults.n_observations}</div>
                                </div>
                              </div>

                              {/* factor loadings */}
                              <div>
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Factor Loadings</div>
                                <div className="rounded-lg border border-gray-200 overflow-hidden">
                                  <table className="w-full text-[11px]">
                                    <thead className="bg-gray-50">
                                      <tr>
                                        <th className="px-3 py-1.5 text-left text-gray-500 font-medium">Factor</th>
                                        <th className="px-3 py-1.5 text-right text-gray-500 font-medium">Beta (β)</th>
                                        <th className="px-3 py-1.5 text-right text-gray-500 font-medium">t-stat</th>
                                        <th className="px-3 py-1.5 text-right text-gray-500 font-medium">p-value</th>
                                        <th className="px-3 py-1.5 text-right text-gray-500 font-medium">Contrib. (ann.)</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                      {(factorResults.factors ?? []).map((f: any) => (
                                        <tr key={f.factor} className="hover:bg-gray-50">
                                          <td className="px-3 py-1.5 text-gray-700 font-medium">{f.factor} <span className="text-emerald-500">{f.significance}</span></td>
                                          <td className={`px-3 py-1.5 text-right font-mono ${Math.abs(f.beta) > 0.3 ? 'font-semibold' : ''}`}>{f.beta.toFixed(3)}</td>
                                          <td className="px-3 py-1.5 text-right text-gray-600">{f.t_stat.toFixed(2)}</td>
                                          <td className={`px-3 py-1.5 text-right ${f.p_value < 0.05 ? 'text-emerald-600 font-medium' : 'text-gray-500'}`}>{f.p_value < 0.001 ? '<0.001' : f.p_value.toFixed(3)}</td>
                                          <td className={`px-3 py-1.5 text-right font-medium ${f.annual_contribution_pct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{f.annual_contribution_pct >= 0 ? '+' : ''}{f.annual_contribution_pct.toFixed(2)}%</td>
                                        </tr>
                                      ))}
                                      <tr className="bg-gray-50 font-medium">
                                        <td className="px-3 py-1.5 text-gray-700">Alpha (α)</td>
                                        <td className="px-3 py-1.5 text-right text-gray-400">—</td>
                                        <td className="px-3 py-1.5 text-right text-gray-600">{(factorResults.alpha_t_stat ?? 0).toFixed(2)}</td>
                                        <td className={`px-3 py-1.5 text-right ${(factorResults.alpha_p_value ?? 1) < 0.05 ? 'text-emerald-600' : 'text-gray-500'}`}>{(factorResults.alpha_p_value ?? 1) < 0.001 ? '<0.001' : (factorResults.alpha_p_value ?? 0).toFixed(3)}</td>
                                        <td className={`px-3 py-1.5 text-right ${(factorResults.alpha_annual_pct ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{(factorResults.alpha_annual_pct ?? 0) >= 0 ? '+' : ''}{(factorResults.alpha_annual_pct ?? 0).toFixed(2)}%</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              </div>

                              {/* breakdown */}
                              <div>
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Return Decomposition</div>
                                <div className="p-3 rounded-lg border border-gray-200 bg-white space-y-2">
                                  {(factorResults.factors ?? []).map((f: any) => {
                                    const maxAbs = Math.max(
                                      ...(factorResults.factors ?? []).map((x: any) => Math.abs(x.annual_contribution_pct)),
                                      Math.abs(factorResults.alpha_annual_pct ?? 0),
                                      0.01
                                    );
                                    const pct = Math.min(Math.abs(f.annual_contribution_pct) / maxAbs * 100, 100);
                                    return (
                                      <div key={f.factor} className="flex items-center gap-2">
                                        <div className="w-28 text-[10px] text-gray-600 truncate">{f.factor}</div>
                                        <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden relative">
                                          <div className={`h-full rounded-full ${f.annual_contribution_pct >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
                                        </div>
                                        <div className={`w-16 text-right text-[10px] font-mono ${f.annual_contribution_pct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{f.annual_contribution_pct >= 0 ? '+' : ''}{f.annual_contribution_pct.toFixed(1)}%</div>
                                      </div>
                                    );
                                  })}
                                  <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                                    <div className="w-28 text-[10px] text-gray-600 font-medium">Alpha (α)</div>
                                    <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden relative">
                                      {(() => {
                                        const maxAbs = Math.max(
                                          ...(factorResults.factors ?? []).map((x: any) => Math.abs(x.annual_contribution_pct)),
                                          Math.abs(factorResults.alpha_annual_pct ?? 0),
                                          0.01
                                        );
                                        const pct = Math.min(Math.abs(factorResults.alpha_annual_pct ?? 0) / maxAbs * 100, 100);
                                        return <div className={`h-full rounded-full ${(factorResults.alpha_annual_pct ?? 0) >= 0 ? 'bg-blue-400' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />;
                                      })()}
                                    </div>
                                    <div className={`w-16 text-right text-[10px] font-mono ${(factorResults.alpha_annual_pct ?? 0) >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{(factorResults.alpha_annual_pct ?? 0) >= 0 ? '+' : ''}{(factorResults.alpha_annual_pct ?? 0).toFixed(1)}%</div>
                                  </div>
                                </div>
                              </div>

                              {/* notes */}
                              <div className="p-2 rounded-lg border border-gray-200 bg-gray-50 text-[11px] text-gray-600 space-y-1">
                                {(factorResults.r_squared ?? 0) > 0.7 && <p>High R² ({((factorResults.r_squared ?? 0) * 100).toFixed(0)}%) — most of your returns are explained by known factors.</p>}
                                {(factorResults.r_squared ?? 0) <= 0.7 && (factorResults.r_squared ?? 0) > 0.3 && <p>Moderate R² ({((factorResults.r_squared ?? 0) * 100).toFixed(0)}%) — returns are partially driven by factors, with meaningful unique behavior.</p>}
                                {(factorResults.r_squared ?? 0) <= 0.3 && <p>Low R² ({((factorResults.r_squared ?? 0) * 100).toFixed(0)}%) — your strategy behaves independently of standard factors. This is often desirable.</p>}
                                {factorResults.alpha_significant && (factorResults.alpha_annual_pct ?? 0) > 0 && <p className="text-emerald-700 font-medium">Positive significant alpha — evidence of genuine skill beyond factor tilts.</p>}
                                {!factorResults.alpha_significant && <p className="text-amber-700">Alpha is not statistically significant — observed returns could be explained by factor exposures.</p>}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {activeResultsTab === 'walkforward' && (
                        <div className="space-y-3">
                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                            <div className="text-[11px] font-medium text-gray-700 mb-1">Walk-forward analysis</div>
                            <p className="text-[11px] text-gray-500 mb-2">Split data into train/test windows and evaluate out-of-sample performance.</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] text-gray-500 block mb-0.5">Purge bars</label>
                                <input type="number" min={0} max={100} value={walkForwardPurgeBars} onChange={(e) => setWalkForwardPurgeBars(Math.max(0, parseInt(e.target.value, 10) || 0))} className="w-full px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900" title="gap between train/test" />
                          </div>
                              <div>
                                <label className="text-[10px] text-gray-500 block mb-0.5">Window mode</label>
                                <select value={walkForwardWindowMode} onChange={(e) => setWalkForwardWindowMode(e.target.value as 'rolling' | 'anchored')} className="w-full px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900">
                                  <option value="rolling">Rolling</option>
                                  <option value="anchored">Anchored</option>
                                </select>
                          </div>
                          </div>
                            <button onClick={handleRunWalkForward} disabled={walkForwardLoading} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition">
                              {walkForwardLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run Walk-Forward
                            </button>
                        </div>
                          {walkForwardResults?.error && (
                            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs">{walkForwardResults.error}</div>
                      )}
                          {walkForwardResults && !walkForwardResults.error && (walkForwardResults.windows?.length || walkForwardResults.splits?.length) && (() => {
                            const wins = walkForwardResults.windows ?? walkForwardResults.splits ?? [];
                            // One row per window: IS/OOS Sharpe + OOS return
                            const chartData = wins.map((w, i) => ({
                              label: `W${(w.window ?? i + 1)}`,
                              is_sharpe: w.train_sharpe ?? null,
                              oos_sharpe: w.test_sharpe ?? w.oos_sharpe ?? null,
                              oos_return: (w.test_return ?? w.oos_return ?? 0) * 100,
                              testStart: w.test_period?.start ?? w.test_start ?? '-',
                              testEnd: w.test_period?.end ?? w.oos_end ?? '-',
                            }));
                            const hasIS = chartData.some(d => d.is_sharpe != null);
                            return (
                              <div className="space-y-3">
                                {/* Summary row */}
                                <div className="grid grid-cols-3 gap-2">
                                  {walkForwardResults.avg_oos_return != null && (
                                    <div className="p-2 rounded-lg border border-gray-200 bg-white">
                                      <div className="text-[10px] text-gray-500 mb-0.5">Avg OOS Return</div>
                                      <div className={`text-sm font-semibold ${walkForwardResults.avg_oos_return >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                        {(walkForwardResults.avg_oos_return * 100).toFixed(1)}%
                                      </div>
                                    </div>
                                  )}
                                  {walkForwardResults.avg_oos_sharpe != null && (
                                    <div className="p-2 rounded-lg border border-gray-200 bg-white">
                                      <div className="text-[10px] text-gray-500 mb-0.5">Avg OOS Sharpe</div>
                                      <div className={`text-sm font-semibold ${(walkForwardResults.avg_oos_sharpe ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                        {walkForwardResults.avg_oos_sharpe.toFixed(2)}
                                      </div>
                                    </div>
                                  )}
                                  {walkForwardResults.overall_overfit_score != null && (
                                    <div className="p-2 rounded-lg border border-gray-200 bg-white">
                                      <div className="text-[10px] text-gray-500 mb-0.5">Overfit Score</div>
                                      <div className={`text-sm font-semibold ${walkForwardResults.overall_overfit_score < 40 ? 'text-emerald-600' : walkForwardResults.overall_overfit_score < 70 ? 'text-amber-600' : 'text-red-500'}`}>
                                        {walkForwardResults.overall_overfit_score.toFixed(0)}%
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* IS vs OOS Sharpe bar chart */}
                                <div>
                                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                                    {hasIS ? 'IS vs OOS Sharpe per Window' : 'OOS Sharpe per Window'}
                                  </div>
                                  <div className="h-32">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <BarChart data={chartData} margin={{ top: 4, right: 48, bottom: 0, left: 0 }} barCategoryGap="25%">
                                        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#9ca3af' }} />
                                        <YAxis orientation="right" width={44} tickCount={3} tickLine={false} axisLine={false} tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#9ca3af' }} tickFormatter={(v: number) => v.toFixed(1)} domain={['auto', 'auto']} />
                                        <ReferenceLine y={0} stroke="rgba(0,0,0,0.15)" strokeWidth={1} />
                                        <Tooltip
                                          contentStyle={tooltipStyle}
                                          formatter={(v, name) => [v != null ? Number(v).toFixed(2) : '—', name === 'is_sharpe' ? 'IS Sharpe' : 'OOS Sharpe']}
                                        />
                                        {hasIS && <Bar dataKey="is_sharpe" name="is_sharpe" fill="#94a3b8" radius={[2, 2, 0, 0]} maxBarSize={20} />}
                                        <Bar dataKey="oos_sharpe" name="oos_sharpe" radius={[2, 2, 0, 0]} maxBarSize={20}>
                                          {chartData.map((d, i) => (
                                            <Cell key={i} fill={(d.oos_sharpe ?? 0) >= 0 ? '#10b981' : '#f87171'} />
                                          ))}
                                        </Bar>
                                      </BarChart>
                                    </ResponsiveContainer>
                                  </div>
                                </div>

                                {/* OOS Return bar chart */}
                                <div>
                                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">OOS Return per Window (%)</div>
                                  <div className="h-20">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <BarChart data={chartData} margin={{ top: 4, right: 48, bottom: 0, left: 0 }} barCategoryGap="25%">
                                        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#9ca3af' }} />
                                        <YAxis orientation="right" width={44} tickCount={3} tickLine={false} axisLine={false} tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#9ca3af' }} tickFormatter={(v: number) => `${v.toFixed(0)}%`} domain={['auto', 'auto']} />
                                        <ReferenceLine y={0} stroke="rgba(0,0,0,0.15)" strokeWidth={1} />
                                        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v != null ? `${Number(v).toFixed(1)}%` : '—', 'OOS Return']} />
                                        <Bar dataKey="oos_return" radius={[2, 2, 0, 0]} maxBarSize={20}>
                                          {chartData.map((d, i) => (
                                            <Cell key={i} fill={d.oos_return >= 0 ? '#10b981' : '#f87171'} />
                                          ))}
                                        </Bar>
                                      </BarChart>
                                    </ResponsiveContainer>
                                  </div>
                                </div>

                                {/* Detail list */}
                                <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-40 overflow-y-auto">
                                  {chartData.map((d, i) => (
                                    <div key={i} className="px-3 py-1.5 flex items-center justify-between text-[10px] hover:bg-gray-50">
                                      <span className="text-gray-500 font-mono">{d.testStart} → {d.testEnd}</span>
                                      <span className="text-gray-800">
                                        OOS Sharpe {d.oos_sharpe != null ? d.oos_sharpe.toFixed(2) : '—'}
                                        {d.is_sharpe != null ? ` · IS ${d.is_sharpe.toFixed(2)}` : ''}
                                        {' '}· Return {d.oos_return.toFixed(1)}%
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                          {walkForwardResults && !walkForwardResults.error && !walkForwardResults.windows?.length && !walkForwardResults.splits?.length && (
                            <div className="px-3 py-4 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 text-xs text-center">Run completed. No splits data returned.</div>
                          )}
                            </div>
                          )}
                      {activeResultsTab === 'montecarlo' && (
                        <div className="space-y-3">
                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                            <div className="text-[11px] font-medium text-gray-700 mb-2">Monte Carlo simulation</div>
                            <p className="text-[11px] text-gray-500 mb-3">Run multiple simulated equity paths to assess strategy robustness.</p>
                            <button onClick={handleRunMonteCarlo} disabled={monteCarloLoading || !lastBacktestId} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition" title={!lastBacktestId ? 'Run a backtest first' : ''}>
                              {monteCarloLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run Monte Carlo
                            </button>
                          </div>
                          {!lastBacktestId && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                              <AlertCircle className="h-4 w-4 shrink-0" /> Run a backtest first to enable Monte Carlo.
                    </div>
                          )}
                          {monteCarloResults?.error && (
                            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs">{monteCarloResults.error}</div>
                          )}
                          {monteCarloResults && !monteCarloResults.error && (monteCarloResults.percentiles || monteCarloResults.percentile_curves) && (
                            <div className="space-y-3">
                              {/* Summary stats */}
                              <div className="grid grid-cols-3 gap-2">
                                {monteCarloResults.probability_of_loss != null && (
                                  <div className="p-2 rounded-lg border border-gray-200 bg-white">
                                    <div className="text-[10px] text-gray-500 mb-0.5">Prob. of Loss</div>
                                    <div className={`text-sm font-semibold ${monteCarloResults.probability_of_loss > 30 ? 'text-red-500' : 'text-emerald-600'}`}>
                                      {monteCarloResults.probability_of_loss.toFixed(1)}%
                                    </div>
                                  </div>
                                )}
                                {monteCarloResults.mean_final != null && (
                                  <div className="p-2 rounded-lg border border-gray-200 bg-white">
                                    <div className="text-[10px] text-gray-500 mb-0.5">Mean Final</div>
                                    <div className="text-sm font-semibold text-gray-900">${monteCarloResults.mean_final.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                  </div>
                                )}
                                {monteCarloResults.std_final != null && (
                                  <div className="p-2 rounded-lg border border-gray-200 bg-white">
                                    <div className="text-[10px] text-gray-500 mb-0.5">Std Dev</div>
                                    <div className="text-sm font-semibold text-gray-900">${monteCarloResults.std_final.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                  </div>
                                )}
                              </div>

                              {/* Fan chart if percentile_curves available, else table fallback */}
                              {monteCarloResults.percentile_curves ? (() => {
                                const pc = monteCarloResults.percentile_curves!;
                                const fanData = pc.p5.map((v, i) => ({
                                  step: i,
                                  // Deltas for stacked bands
                                  p5: v,
                                  d_p5_p25: pc.p25[i] - v,
                                  d_p25_p75: pc.p75[i] - pc.p25[i],
                                  d_p75_p95: pc.p95[i] - pc.p75[i],
                                  // Absolute vals for tooltip
                                  abs_p5: v,
                                  abs_p25: pc.p25[i],
                                  abs_p50: pc.p50[i],
                                  abs_p75: pc.p75[i],
                                  abs_p95: pc.p95[i],
                                  p50: pc.p50[i],
                                }));
                                const fmt = (v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
                                const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: typeof fanData[0] }> }) => {
                                  if (!active || !payload?.length) return null;
                                  const d = payload[0].payload;
                                  return (
                                    <div style={tooltipStyle}>
                                      <div className="text-[10px] text-gray-400 mb-1">Step {d.step + 1}</div>
                                      {[['p95', d.abs_p95], ['p75', d.abs_p75], ['p50', d.abs_p50], ['p25', d.abs_p25], ['p5', d.abs_p5]].map(([label, val]) => (
                                        <div key={String(label)} className="flex justify-between gap-3 text-[10px]">
                                          <span className="text-gray-500">{String(label)}</span>
                                          <span className="font-mono text-gray-900">{fmt(Number(val))}</span>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                };
                                return (
                                  <div>
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Equity Fan</div>
                                    <div className="h-40">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={fanData} margin={{ top: 4, right: 48, bottom: 0, left: 0 }}>
                                          <XAxis dataKey="step" hide />
                                          <YAxis
                                            orientation="right"
                                            width={52}
                                            tickCount={4}
                                            tickLine={false}
                                            axisLine={false}
                                            tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#9ca3af' }}
                                            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                                            domain={['auto', 'auto']}
                                          />
                                          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(0,0,0,0.1)', strokeWidth: 1 }} />
                                          {/* p5→p25, p25→p75, p75→p95 stacked bands */}
                                          <Area stackId="fan" type="monotone" dataKey="p5" fill="transparent" stroke="none" />
                                          <Area stackId="fan" type="monotone" dataKey="d_p5_p25" fill="#bfdbfe" fillOpacity={0.5} stroke="none" />
                                          <Area stackId="fan" type="monotone" dataKey="d_p25_p75" fill="#93c5fd" fillOpacity={0.4} stroke="none" />
                                          <Area stackId="fan" type="monotone" dataKey="d_p75_p95" fill="#bfdbfe" fillOpacity={0.5} stroke="none" />
                                          {/* Median line (ignores stack) */}
                                          <Line type="monotone" dataKey="p50" stroke="#2563eb" strokeWidth={2} dot={false} />
                                        </ComposedChart>
                                      </ResponsiveContainer>
                                    </div>
                                  </div>
                                );
                              })() : (
                                /* No fan chart — show percentile table */
                                monteCarloResults.percentiles && (
                                  <div>
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Final Value Percentiles</div>
                                    <div className="grid grid-cols-2 gap-2">
                                      {Object.entries(monteCarloResults.percentiles).map(([p, v]: [string, unknown]) => (
                                        <div key={p} className="p-2 rounded-lg border border-gray-200 bg-white">
                                          <span className="text-[10px] text-gray-500">{p}</span>
                                          <div className="text-sm font-semibold text-gray-900">{typeof v === 'number' ? v.toFixed(2) : String(v)}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          )}
                          {monteCarloResults && !monteCarloResults.error && !monteCarloResults.percentiles && !monteCarloResults.percentile_curves && (
                            <div className="px-3 py-4 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 text-xs text-center">Simulation completed. No percentile data returned.</div>
                          )}
                        </div>
                      )}
                      {activeResultsTab === 'risk' && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="p-3 rounded-lg border border-gray-200 bg-white">
                              <div className="text-[11px] text-gray-500 mb-1">Max drawdown</div>
                              <div className={`text-sm font-semibold ${(results.max_drawdown ?? 0) > -20 ? 'text-emerald-600' : 'text-red-500'}`}>{(results.max_drawdown ?? 0).toFixed(1)}%</div>
                              </div>
                            <div className="p-3 rounded-lg border border-gray-200 bg-white">
                              <div className="text-[11px] text-gray-500 mb-1">Sortino</div>
                              <div className="text-sm font-semibold text-gray-900">{(results as { sortino_ratio?: number }).sortino_ratio?.toFixed(2) ?? '-'}</div>
                            </div>
                            <div className="p-3 rounded-lg border border-gray-200 bg-white">
                              <div className="text-[11px] text-gray-500 mb-1">Calmar</div>
                              <div className="text-sm font-semibold text-gray-900">{(results as { calmar_ratio?: number }).calmar_ratio?.toFixed(2) ?? '-'}</div>
                              </div>
                            <div className="p-3 rounded-lg border border-gray-200 bg-white">
                              <div className="text-[11px] text-gray-500 mb-1">Max consec. losses</div>
                              <div className="text-sm font-semibold text-gray-900">{(results as { max_consecutive_losses?: number }).max_consecutive_losses ?? '-'}</div>
                            </div>
                            <div className="p-3 rounded-lg border border-gray-200 bg-white">
                              <div className="text-[11px] text-gray-500 mb-1">VaR 95%</div>
                              <div className="text-sm font-semibold text-red-500">{results.var_95 != null ? `${results.var_95.toFixed(2)}%` : '-'}</div>
                            </div>
                            <div className="p-3 rounded-lg border border-gray-200 bg-white">
                              <div className="text-[11px] text-gray-500 mb-1">CVaR 95%</div>
                              <div className="text-sm font-semibold text-red-500">{results.cvar_95 != null ? `${results.cvar_95.toFixed(2)}%` : '-'}</div>
                            </div>
                            <div className="p-3 rounded-lg border border-gray-200 bg-white">
                              <div className="text-[11px] text-gray-500 mb-1">VaR 99%</div>
                              <div className="text-sm font-semibold text-red-500">{results.var_99 != null ? `${results.var_99.toFixed(2)}%` : '-'}</div>
                            </div>
                            <div className="p-3 rounded-lg border border-gray-200 bg-white">
                              <div className="text-[11px] text-gray-500 mb-1">CVaR 99%</div>
                              <div className="text-sm font-semibold text-red-500">{results.cvar_99 != null ? `${results.cvar_99.toFixed(2)}%` : '-'}</div>
                            </div>
                          </div>
                          {(results as { risk_violations?: Array<{ rule: string; description: string }> }).risk_violations?.length ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mb-2">Risk violations</div>
                              <ul className="space-y-1.5">
                                {(results as { risk_violations: Array<{ rule: string; description: string }> }).risk_violations.map((v, i) => (
                                  <li key={i} className="text-xs text-amber-800 flex items-start gap-2">
                                    <span className="text-amber-500 mt-0.5">•</span>
                                    <span><span className="font-medium">{v.rule}:</span> {v.description}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <div className="rounded-lg border border-gray-200 bg-emerald-50/50 p-3 text-xs text-emerald-700">No risk violations.</div>
                      )}
                    </div>
                      )}
                      {activeResultsTab === 'heatmap' && (() => {
                        const ec = results.equity_curve || [];
                        const byMonth: Record<string, { first: number; last: number }> = {};
                        for (const p of ec) {
                          const m = p.date?.slice(0, 7);
                          if (!m) continue;
                          if (!byMonth[m]) byMonth[m] = { first: p.equity, last: p.equity };
                          else byMonth[m]!.last = p.equity;
                        }
                        const months = Object.keys(byMonth).sort();
                        const monthReturns: Record<string, number> = {};
                        for (const m of months) {
                          const v = byMonth[m]!;
                          if (v.first > 0) monthReturns[m] = (v.last / v.first - 1) * 100;
                        }
                        const validMonths = Object.keys(monthReturns).sort();
                        if (validMonths.length === 0) return <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-gray-500 text-xs">No equity curve for monthly returns heatmap.</div>;
                        return (
                          <div className="space-y-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Monthly Returns (%)</div>
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                              {validMonths.map(m => {
                                const ret = monthReturns[m] ?? 0;
                                return (
                                  <div key={m} className={`p-2.5 rounded-lg border text-center ${ret >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                    <div className="text-[10px] text-gray-500">{m}</div>
                                    <div className="text-sm font-semibold">{ret >= 0 ? '+' : ''}{ret.toFixed(2)}%</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                      {activeResultsTab === 'distribution' && (() => {
                        const trades = results.trades || [];
                        const pnls = trades.map(t => t.pnl ?? 0).filter(Boolean);
                        if (pnls.length === 0) return <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-gray-500 text-xs">No trade P&amp;L data.</div>;
                        const bins: Record<string, number> = {};
                        const step = 50;
                        for (const p of pnls) {
                          const b = Math.floor(p / step) * step;
                          bins[b] = (bins[b] ?? 0) + 1;
                        }
                        const entries = Object.entries(bins).sort((a, b) => Number(a[0]) - Number(b[0]));
                        const maxCount = Math.max(...entries.map(([, c]) => c), 1);
                        return (
                          <div className="space-y-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">P&amp;L distribution</div>
                            <div className="space-y-2">
                              {entries.map(([bin, count]) => (
                                <div key={bin} className="flex items-center gap-3">
                                  <span className="w-14 text-xs text-gray-600 font-mono">${bin}</span>
                                  <div className="flex-1 h-6 bg-gray-100 rounded-md overflow-hidden">
                                    <div className={`h-full min-w-[2px] rounded-md ${Number(bin) >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${Math.max((count / maxCount) * 100, 2)}%` }} />
                          </div>
                                  <span className="text-xs text-gray-700 font-medium w-6 text-right">{count}</span>
                                </div>
                              ))}
                            </div>
                                        </div>
                                      );
                                  })()}
                      {activeResultsTab === 'compare' && (
                        <div className="space-y-3">
                          {results.benchmark_return !== undefined ? (
                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">vs Buy &amp; Hold</div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                  <div className="text-[11px] text-gray-500 mb-1">Strategy</div>
                                  <div className={`text-sm font-semibold ${results.total_return >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{results.total_return.toFixed(1)}%</div>
                                </div>
                                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                  <div className="text-[11px] text-gray-500 mb-1">Benchmark</div>
                                  <div className={`text-sm font-semibold ${results.benchmark_return >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{results.benchmark_return.toFixed(1)}%</div>
                              </div>
                          </div>
                              <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50">
                                <div className="text-[11px] text-gray-600 mb-0.5">Alpha</div>
                                <div className={`text-lg font-bold ${results.total_return > results.benchmark_return ? 'text-emerald-600' : 'text-amber-600'}`}>
                                  {(results.total_return - results.benchmark_return) >= 0 ? '+' : ''}{(results.total_return - results.benchmark_return).toFixed(1)}%
                        </div>
                    </div>
                        </div>
                      ) : (
                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
                              <div className="text-[11px] text-gray-500">Enable benchmark in Setup → Benchmark to compare strategy vs buy &amp; hold.</div>
                          </div>
                          )}
                                                </div>
                      )}
                      {activeResultsTab === 'tca' && (
                        <div className="space-y-3">
                          {((results as { total_commission?: number }).total_commission || (results as { total_slippage?: number }).total_slippage) ? (
                            <>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                <div className="text-[11px] text-gray-500 mb-1">Total commission</div>
                                <div className="text-sm font-semibold text-gray-900">${((results as { total_commission?: number }).total_commission ?? 0).toFixed(2)}</div>
                              </div>
                              <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                <div className="text-[11px] text-gray-500 mb-1">Total slippage</div>
                                <div className="text-sm font-semibold text-gray-900">${((results as { total_slippage?: number }).total_slippage ?? 0).toFixed(2)}</div>
                              </div>
                              <div className="p-3 rounded-lg border border-gray-200 bg-white col-span-2">
                                <div className="text-[11px] text-gray-500 mb-1">Cost as % of P&amp;L</div>
                                <div className="text-sm font-semibold text-gray-900">{((results as { cost_as_pct_of_pnl?: number }).cost_as_pct_of_pnl ?? 0).toFixed(2)}%</div>
                              </div>
                            </div>
                            {((results.total_funding_paid ?? 0) > 0 || (results.total_funding_received ?? 0) > 0) && (
                              <div className="space-y-2">
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Perpetual Funding</div>
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                    <div className="text-[11px] text-gray-500 mb-1">Funding paid</div>
                                    <div className="text-sm font-semibold text-red-500">${(results.total_funding_paid ?? 0).toFixed(2)}</div>
                                  </div>
                                  <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                    <div className="text-[11px] text-gray-500 mb-1">Funding received</div>
                                    <div className="text-sm font-semibold text-emerald-600">${(results.total_funding_received ?? 0).toFixed(2)}</div>
                                  </div>
                                  <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                    <div className="text-[11px] text-gray-500 mb-1">Net funding</div>
                                    <div className={`text-sm font-semibold ${(results.net_funding ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>${(results.net_funding ?? 0).toFixed(2)}</div>
                                  </div>
                                </div>
                              </div>
                            )}
                            </>
                          ) : (
                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
                              <div className="text-[11px] text-gray-500">Configure commission and slippage in Setup &rarr; Costs to see transaction cost analysis.</div>
                            </div>
                          )}
                  </div>
                )}
                </ErrorBoundary>
              </div>
            </div>

  );
}
