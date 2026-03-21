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
  PieChart,
  Shuffle,
  Shield,
  Calendar,
  BarChart2,
  BarChart3,
  GitCompare,
  AlertCircle,
  TrendingDown,
  Target,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import TradeLog from '@/components/playground/TradeLog';
import ErrorBoundary from '@/components/ErrorBoundary';
import type { BacktestResult } from '@/app/playground/types';
import type { ExtractedParam } from '@/app/playground/extractParams';
import type { useAnalytics } from '@/app/playground/useAnalytics';

type AnalyticsState = ReturnType<typeof useAnalytics>;

type ResultsTab = 'summary' | 'trades' | 'orders' | 'charts' | 'compare' | 'optimize' | 'walkforward' | 'oos' | 'cpcv' | 'factors' | 'montecarlo' | 'risk' | 'tca' | 'heatmap' | 'distribution';

interface ResultsTabContentProps {
  results: BacktestResult;
  activeTab: ResultsTab;
  onTabChange: (tab: ResultsTab) => void;
  analytics: AnalyticsState;
  paramDefs: ExtractedParam[];
}

export default function ResultsTabContent({
  results,
  activeTab: activeResultsTab,
  onTabChange: setActiveResultsTab,
  analytics,
  paramDefs,
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

  return (
                <div className="p-3 pb-6">
                  <div className="space-y-3 pb-3 border-b border-gray-200">
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
                        const secondaryIcons = { tca: Activity, optimize: Sliders, walkforward: GitBranch, oos: Filter, cpcv: Layers, factors: PieChart, montecarlo: Shuffle, risk: Shield, heatmap: Calendar, distribution: BarChart2, compare: GitCompare };
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
                </div>
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
                        <div className="space-y-4">
                          {results.equity_curve?.length ? (
                            <div className="h-32">
                              <div className="text-[10px] text-gray-500 mb-0.5">Equity curve</div>
                            <ResponsiveContainer width="100%" height="100%" minHeight={128}>
                                <AreaChart data={results.equity_curve.map(p => ({ ...p, value: p.equity }))} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                                <defs>
                                  <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <XAxis dataKey="date" hide />
                                  <YAxis hide domain={['auto', 'auto']} />
                                  <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', fontSize: 11 }} />
                                  <Area type="monotone" dataKey="value" stroke="#10b981" fill="url(#eqGrad)" strokeWidth={1.5} />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                          ) : null}
                          {results.drawdown_series?.length ? (
                            <div className="h-24">
                              <div className="text-[10px] text-gray-500 mb-0.5">Drawdown</div>
                            <ResponsiveContainer width="100%" height="100%" minHeight={96}>
                                <AreaChart data={results.drawdown_series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                                <defs>
                                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <XAxis dataKey="date" hide />
                                  <YAxis hide domain={['auto', 0]} />
                                  <Area type="monotone" dataKey="drawdown_pct" stroke="#ef4444" fill="url(#ddGrad)" strokeWidth={1.5} />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                          ) : null}
                          {results.custom_charts && Object.keys(results.custom_charts).length > 0 ? (
                            <div className="space-y-2">
                              <div className="text-[10px] text-gray-500">Custom series</div>
                              {Object.entries(results.custom_charts).map(([name, data]) => (
                                data?.length ? (
                                <div key={name} className="h-20">
                                  <div className="text-[10px] text-gray-400 mb-0.5">{name}</div>
                                  <ResponsiveContainer width="100%" height="100%" minHeight={80}>
                                    <LineChart data={data} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}>
                                      <XAxis dataKey="date" hide />
                                      <YAxis hide />
                                      <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={1.5} dot={false} />
                                    </LineChart>
                                  </ResponsiveContainer>
                        </div>
                                ) : null
                              ))}
                            </div>
                          ) : null}
                          {(!results.equity_curve?.length && !results.drawdown_series?.length && (!results.custom_charts || Object.keys(results.custom_charts).length === 0)) && (
                            <div className="text-center py-6 text-gray-500 text-xs">No chart data.</div>
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
                              {optimizeResults && !optimizeResults.error && optimizeResults.results && (
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
                              {optimizeResults?.heatmap && (
                                <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-[11px] text-gray-500">Heatmap: use Setup panel for full 2D view.</div>
                              )}
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
                          {walkForwardResults && !walkForwardResults.error && (walkForwardResults.windows?.length || walkForwardResults.splits?.length) && (
                        <div className="space-y-2">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Out-of-sample results</div>
                              {walkForwardResults.avg_oos_return != null && (
                                <div className="text-xs text-gray-700">Avg OOS return: <span className="font-semibold">{(walkForwardResults.avg_oos_return * 100).toFixed(1)}%</span></div>
                              )}
                              <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-48 overflow-y-auto">
                                {(walkForwardResults.windows ?? walkForwardResults.splits ?? []).map((w: { window?: number; train_period?: { start: string; end: string }; test_period?: { start: string; end: string }; train_start?: string; train_end?: string; test_start?: string; test_end?: string; test_sharpe?: number; test_return?: number; sharpe?: number; total_return?: number }, i: number) => {
                                  const testStart = w.test_period?.start ?? w.test_start ?? '-';
                                  const testEnd = w.test_period?.end ?? w.test_end ?? '-';
                                  const sharpe = w.test_sharpe ?? w.sharpe;
                                  const ret = w.test_return ?? w.total_return ?? 0;
                                    return (
                                    <div key={i} className="px-3 py-2 flex items-center justify-between text-xs hover:bg-gray-50">
                                      <span className="text-gray-600 font-mono">{testStart} → {testEnd}</span>
                                      <span className="text-gray-900">Sharpe {sharpe != null ? sharpe.toFixed(2) : '-'} · Return {(ret * 100).toFixed(1)}%</span>
                                      </div>
                                    );
                                })}
                          </div>
                        </div>
                      )}
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
                          {monteCarloResults && !monteCarloResults.error && monteCarloResults.percentiles && (
                            <div className="space-y-2">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Percentiles</div>
                              <div className="grid grid-cols-2 gap-2">
                                {Object.entries(monteCarloResults.percentiles).map(([p, v]: [string, unknown]) => (
                                  <div key={p} className="p-2 rounded-lg border border-gray-200 bg-white">
                                    <span className="text-[10px] text-gray-500">{p}</span>
                                    <div className="text-sm font-semibold text-gray-900">{typeof v === 'number' ? v.toFixed(2) : String(v)}</div>
                              </div>
                                ))}
                          </div>
                    </div>
                          )}
                          {monteCarloResults && !monteCarloResults.error && !monteCarloResults.percentiles && (
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
                        const trades = results.trades || [];
                        const byMonth: Record<string, number> = {};
                        for (const t of trades) {
                          const m = t.exit_date?.slice(0, 7) || t.entry_date?.slice(0, 7);
                          if (m) byMonth[m] = (byMonth[m] || 0) + (t.pnl ?? 0);
                        }
                        const months = Object.keys(byMonth).sort();
                        if (months.length === 0) return <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-gray-500 text-xs">No trades for monthly P&amp;L heatmap.</div>;
                          return (
                          <div className="space-y-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Monthly P&amp;L ($)</div>
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                              {months.map(m => (
                                <div key={m} className={`p-2.5 rounded-lg border text-center ${(byMonth[m] ?? 0) >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                  <div className="text-[10px] text-gray-500">{m}</div>
                                  <div className="text-sm font-semibold">${(byMonth[m] ?? 0).toFixed(0)}</div>
                                    </div>
                                  ))}
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
