import { useCallback } from 'react';
import type { BacktestConfig, BacktestResult } from './types';

export function useExport(results: BacktestResult | null, config: BacktestConfig) {
  const handleExportResults = useCallback(() => {
    if (!results) return;

    const tradesCsv = results.trades.length > 0
      ? [
          '',
          'Trades',
          'Entry Date,Exit Date,Type,Entry Price,Exit Price,Size,P&L,P&L %,Commission',
          ...results.trades.map(t =>
            `${t.entry_date},${t.exit_date},${t.type},${t.entry_price.toFixed(2)},${t.exit_price.toFixed(2)},${t.size},${t.pnl.toFixed(2)},${t.pnl_pct.toFixed(2)}%,${t.commission.toFixed(2)}`
          ),
        ]
      : [];

    const csvContent = [
      'Metric,Value',
      `Total Return,${results.total_return.toFixed(2)}%`,
      `Sharpe Ratio,${results.sharpe_ratio.toFixed(2)}`,
      `Max Drawdown,${results.max_drawdown.toFixed(1)}%`,
      `Win Rate,${results.win_rate.toFixed(0)}%`,
      `Total Trades,${results.total_trades}`,
      `Final Value,$${results.final_value.toFixed(2)}`,
      results.sortino_ratio !== undefined ? `Sortino Ratio,${results.sortino_ratio.toFixed(2)}` : '',
      results.profit_factor !== undefined ? `Profit Factor,${results.profit_factor.toFixed(2)}` : '',
      results.var_95 != null ? `VaR 95%,${results.var_95.toFixed(2)}%` : '',
      results.cvar_95 != null ? `CVaR 95%,${results.cvar_95.toFixed(2)}%` : '',
      results.var_99 != null ? `VaR 99%,${results.var_99.toFixed(2)}%` : '',
      results.cvar_99 != null ? `CVaR 99%,${results.cvar_99.toFixed(2)}%` : '',
      results.benchmark_return !== undefined ? `Benchmark Return,${results.benchmark_return.toFixed(2)}%` : '',
      results.benchmark_return !== undefined ? `Alpha,${(results.total_return - results.benchmark_return).toFixed(2)}%` : '',
      '',
      'Configuration',
      `Symbol,${config.symbol}`,
      `Start Date,${config.startDate}`,
      `End Date,${config.endDate}`,
      `Initial Capital,$${config.initialCapital}`,
      `Slippage,${config.slippage}%`,
      `Commission,${config.commission}%`,
      ...tradesCsv,
    ].filter(Boolean).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backtest-${config.symbol}-${config.startDate}-${config.endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results, config]);

  const handleExportJSON = useCallback(() => {
    if (!results) return;
    const jsonData = JSON.stringify(results, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backtest_${config.symbol}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results, config.symbol]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generateLocalTearsheet = useCallback((r: any) => {
    const ec = JSON.stringify(r.equity_curve || []);
    const dd = JSON.stringify(r.drawdown_series || []);
    const trades = r.trades || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pnls: number[] = trades.map((t: any) => t.pnl || 0);
    const bins = 20;
    const mn = Math.min(...pnls, 0);
    const mx = Math.max(...pnls, 0);
    const step = (mx - mn) / bins || 1;
    const hist = Array.from({length: bins}, (_, i) => {
      const lo = mn + i * step;
      const hi = lo + step;
      const cnt = pnls.filter((v: number) => v >= lo && (i === bins-1 ? v <= hi : v < hi)).length;
      return { bin_center: (lo+hi)/2, count: cnt };
    });
    const histData = JSON.stringify(hist);

    // monthly returns for heatmap
    const monthlyMap: Record<string, Record<number, number>> = {};
    let prev = (r.equity_curve?.[0]?.equity) || 1;
    let pM = -1, pY = -1, mStart = prev;
    for (const pt of (r.equity_curve || [])) {
      const d = new Date(pt.date);
      const y = d.getFullYear(), m = d.getMonth();
      if (pM !== -1 && (m !== pM || y !== pY)) {
        if (!monthlyMap[pY]) monthlyMap[pY] = {};
        monthlyMap[pY][pM] = mStart > 0 ? ((prev / mStart) - 1) * 100 : 0;
        mStart = prev;
      }
      prev = pt.equity; pM = m; pY = y;
    }
    if (pM !== -1) { if (!monthlyMap[pY]) monthlyMap[pY] = {}; monthlyMap[pY][pM] = mStart > 0 ? ((prev/mStart)-1)*100 : 0; }
    const mData = JSON.stringify(Object.entries(monthlyMap).flatMap(([yr, ms]) =>
      Object.entries(ms).map(([mo, ret]) => ({year: +yr, month: +mo+1, return_pct: Math.round((ret as number)*100)/100}))
    ));

    // trade log, cap at 50 so html doesnt get huge
    const tradeLog = JSON.stringify(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      trades.slice(0, 50).map((t: any) => ({
        entry: t.entry_date, exit: t.exit_date, type: t.type,
        ep: t.entry_price, xp: t.exit_price, sz: t.size,
        pnl: t.pnl, pct: t.pnl_pct, comm: t.commission,
      }))
    );

    const rollingSharpe = JSON.stringify(r.rolling_sharpe || []);

    // for underwater/drawdown chart
    const winCount = pnls.filter((v: number) => v > 0).length;
    const lossCount = pnls.filter((v: number) => v < 0).length;
    const avgWin = winCount > 0 ? pnls.filter((v: number) => v > 0).reduce((a: number, b: number) => a + b, 0) / winCount : 0;
    const avgLoss = lossCount > 0 ? Math.abs(pnls.filter((v: number) => v < 0).reduce((a: number, b: number) => a + b, 0) / lossCount) : 0;
    const totalPnl = pnls.reduce((a: number, b: number) => a + b, 0);
    const grossProfit = pnls.filter((v: number) => v > 0).reduce((a: number, b: number) => a + b, 0);
    const grossLoss = Math.abs(pnls.filter((v: number) => v < 0).reduce((a: number, b: number) => a + b, 0));
    const bestTrade = pnls.length > 0 ? Math.max(...pnls) : 0;
    const worstTrade = pnls.length > 0 ? Math.min(...pnls) : 0;

    const v = (x: number | undefined | null, d = 2) => (x ?? 0).toFixed(d);
    const vp = (x: number | undefined | null, d = 2) => (x ?? 0) >= 0 ? '+' + (x ?? 0).toFixed(d) + '%' : (x ?? 0).toFixed(d) + '%';
    const cls = (x: number | undefined | null) => (x ?? 0) >= 0 ? 'pos' : 'neg';
    const money = (x: number) => x < 0 ? '-$' + Math.abs(x).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) : '$' + x.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
    const esc = (s: unknown) => { if (s == null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); };

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Backtest Report — ${esc(config.symbol)}</title>
<style>
:root {
  --bg: #ffffff; --fg: #111827; --muted: #6b7280; --border: #e5e7eb;
  --card: #ffffff; --card-border: #f3f4f6; --section-bg: #f9fafb;
  --green: #059669; --green-bg: #ecfdf5; --green-light: #d1fae5;
  --red: #dc2626; --red-bg: #fef2f2; --red-light: #fecaca;
  --blue: #2563eb; --blue-bg: #eff6ff;
  --amber: #d97706; --amber-bg: #fffbeb;
}
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--fg); line-height: 1.5; -webkit-font-smoothing: antialiased; }
.page { max-width: 1100px; margin: 0 auto; padding: 48px 32px; }
@media print { .page { padding: 24px 16px; } .no-print { display: none !important; } }

/* Header */
.header { margin-bottom: 40px; padding-bottom: 24px; border-bottom: 2px solid var(--fg); }
.header h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 4px; }
.header .sub { font-size: 13px; color: var(--muted); display: flex; gap: 16px; align-items: center; }
.header .sub span { display: flex; align-items: center; gap: 4px; }
.badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 9999px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.badge-pos { background: var(--green-bg); color: var(--green); }
.badge-neg { background: var(--red-bg); color: var(--red); }

/* Section */
.section { margin-bottom: 36px; }
.section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: var(--muted); margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
.section-title::after { content: ''; flex: 1; height: 1px; background: var(--border); }

/* Metric grid */
.metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; margin-bottom: 32px; }
.metric { background: var(--card); padding: 20px; }
.metric-label { font-size: 11px; font-weight: 500; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
.metric-value { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.5px; }
.metric-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }
.pos { color: var(--green); }
.neg { color: var(--red); }
.neutral { color: var(--fg); }

/* Two-column layout */
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
@media (max-width: 768px) { .metrics { grid-template-columns: repeat(2, 1fr); } .cols { grid-template-columns: 1fr; } }

/* Charts */
.chart-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
.chart-card h3 { font-size: 13px; font-weight: 600; color: var(--fg); margin-bottom: 12px; }
canvas { width: 100%; display: block; }

/* Table */
.table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
thead th { background: var(--section-bg); padding: 10px 12px; text-align: left; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); border-bottom: 1px solid var(--border); white-space: nowrap; }
tbody td { padding: 8px 12px; border-bottom: 1px solid var(--card-border); white-space: nowrap; }
tbody tr:last-child td { border-bottom: none; }
tbody tr:hover { background: var(--section-bg); }
td.right, th.right { text-align: right; }
td.mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 11px; }

/* Monthly heatmap */
.heatmap { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.heatmap table { font-size: 11px; }
.heatmap th, .heatmap td { text-align: center; padding: 6px 8px; min-width: 52px; }
.heatmap th { font-size: 10px; }
.heatmap td.heat { font-weight: 600; border-radius: 0; }

/* Stats grid */
.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.stat-row { display: flex; justify-content: space-between; padding: 10px 16px; background: var(--card); font-size: 13px; }
.stat-row .label { color: var(--muted); }
.stat-row .val { font-weight: 600; font-variant-numeric: tabular-nums; }

/* Config bar */
.config-bar { display: flex; flex-wrap: wrap; gap: 8px; padding: 16px 20px; background: var(--section-bg); border: 1px solid var(--border); border-radius: 12px; font-size: 12px; color: var(--muted); }
.config-bar .item { display: flex; gap: 4px; }
.config-bar .item strong { color: var(--fg); font-weight: 600; }

/* Footer */
.footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid var(--border); font-size: 11px; color: var(--muted); display: flex; justify-content: space-between; }
</style>
</head>
<body>
<div class="page">

<!-- Header -->
<div class="header">
  <h1>${esc(config.symbol)} Backtest Report</h1>
  <div class="sub">
    <span>${esc(config.startDate)} &mdash; ${esc(config.endDate)}</span>
    <span>&bull;</span>
    <span>Initial Capital: $${config.initialCapital.toLocaleString()}</span>
    <span>&bull;</span>
    <span class="badge ${cls(r.total_return)}-pos badge-${cls(r.total_return)}">${vp(r.total_return)}</span>
  </div>
</div>

<!-- Key Metrics -->
<div class="section">
  <div class="section-title">Performance Summary</div>
  <div class="metrics">
    <div class="metric">
      <div class="metric-label">Total Return</div>
      <div class="metric-value ${cls(r.total_return)}">${vp(r.total_return)}</div>
      <div class="metric-sub">${money(r.final_value||0)} final value</div>
    </div>
    <div class="metric">
      <div class="metric-label">Sharpe Ratio</div>
      <div class="metric-value ${(r.sharpe_ratio||0)>=1?'pos':(r.sharpe_ratio||0)>=0?'neutral':'neg'}">${v(r.sharpe_ratio, 3)}</div>
      <div class="metric-sub">${(r.sharpe_ratio||0)>=2?'Excellent':(r.sharpe_ratio||0)>=1?'Good':(r.sharpe_ratio||0)>=0.5?'Moderate':'Poor'}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Max Drawdown</div>
      <div class="metric-value neg">${v(r.max_drawdown)}%</div>
      <div class="metric-sub">${(r.calmar_ratio!=null)?'Calmar: '+v(r.calmar_ratio,2):''}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Win Rate</div>
      <div class="metric-value ${(r.win_rate||0)>=50?'pos':'neg'}">${v(r.win_rate,1)}%</div>
      <div class="metric-sub">${r.total_trades||0} trades</div>
    </div>
    <div class="metric">
      <div class="metric-label">Sortino Ratio</div>
      <div class="metric-value ${(r.sortino_ratio||0)>=1?'pos':'neutral'}">${v(r.sortino_ratio, 3)}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Profit Factor</div>
      <div class="metric-value ${(r.profit_factor||0)>=1.5?'pos':(r.profit_factor||0)>=1?'neutral':'neg'}">${v(r.profit_factor)}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Volatility (ann.)</div>
      <div class="metric-value neutral">${r.volatility_annual!=null?v(r.volatility_annual)+'%':'—'}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Expectancy</div>
      <div class="metric-value ${cls(r.expectancy)}">${r.expectancy!=null?money(r.expectancy):'—'}</div>
    </div>
  </div>
</div>

<!-- Equity Curve -->
<div class="section">
  <div class="section-title">Equity Curve</div>
  <div class="chart-card">
    <canvas id="eq" height="260"></canvas>
  </div>
</div>

<!-- Drawdown + Distribution side by side -->
<div class="section">
  <div class="cols">
    <div class="chart-card">
      <h3>Underwater (Drawdown)</h3>
      <canvas id="dd" height="180"></canvas>
    </div>
    <div class="chart-card">
      <h3>Trade P&L Distribution</h3>
      <canvas id="dist" height="180"></canvas>
    </div>
  </div>
</div>

<!-- Rolling Sharpe + Trade Stats side by side -->
<div class="section">
  <div class="cols">
    <div class="chart-card">
      <h3>Rolling Sharpe Ratio</h3>
      <canvas id="rsharpe" height="180"></canvas>
    </div>
    <div>
      <div class="section-title">Trade Statistics</div>
      <div class="stats-grid">
        <div class="stat-row"><span class="label">Total Trades</span><span class="val">${r.total_trades||0}</span></div>
        <div class="stat-row"><span class="label">Winners / Losers</span><span class="val"><span class="pos">${winCount}</span> / <span class="neg">${lossCount}</span></span></div>
        <div class="stat-row"><span class="label">Avg Win</span><span class="val pos">${money(avgWin)}</span></div>
        <div class="stat-row"><span class="label">Avg Loss</span><span class="val neg">-${money(avgLoss)}</span></div>
        <div class="stat-row"><span class="label">Best Trade</span><span class="val pos">${money(bestTrade)}</span></div>
        <div class="stat-row"><span class="label">Worst Trade</span><span class="val neg">${money(worstTrade)}</span></div>
        <div class="stat-row"><span class="label">Gross Profit</span><span class="val pos">${money(grossProfit)}</span></div>
        <div class="stat-row"><span class="label">Gross Loss</span><span class="val neg">-${money(grossLoss)}</span></div>
        <div class="stat-row"><span class="label">Net P&L</span><span class="val ${cls(totalPnl)}">${money(totalPnl)}</span></div>
        <div class="stat-row"><span class="label">Max Consec. Losses</span><span class="val">${r.max_consecutive_losses ?? '—'}</span></div>
        ${r.avg_trade_duration != null ? `<div class="stat-row"><span class="label">Avg Duration</span><span class="val">${v(r.avg_trade_duration,1)} bars</span></div>` : ''}
        ${r.exposure_pct != null ? `<div class="stat-row"><span class="label">Exposure</span><span class="val">${v(r.exposure_pct,1)}%</span></div>` : ''}
      </div>
    </div>
  </div>
</div>

<!-- Risk Metrics -->
${(r.var_95 != null || r.benchmark_return != null) ? `
<div class="section">
  <div class="section-title">Risk Metrics</div>
  <div class="stats-grid">
    ${r.var_95 != null ? `<div class="stat-row"><span class="label">Value at Risk (95%)</span><span class="val neg">${v(r.var_95)}%</span></div>` : ''}
    ${r.cvar_95 != null ? `<div class="stat-row"><span class="label">CVaR / Expected Shortfall (95%)</span><span class="val neg">${v(r.cvar_95)}%</span></div>` : ''}
    ${r.var_99 != null ? `<div class="stat-row"><span class="label">Value at Risk (99%)</span><span class="val neg">${v(r.var_99)}%</span></div>` : ''}
    ${r.cvar_99 != null ? `<div class="stat-row"><span class="label">CVaR / Expected Shortfall (99%)</span><span class="val neg">${v(r.cvar_99)}%</span></div>` : ''}
    ${r.benchmark_return != null ? `<div class="stat-row"><span class="label">Benchmark Return</span><span class="val ${cls(r.benchmark_return)}">${vp(r.benchmark_return)}</span></div>` : ''}
    ${r.alpha != null ? `<div class="stat-row"><span class="label">Alpha</span><span class="val ${cls(r.alpha)}">${vp(r.alpha)}</span></div>` : ''}
    ${r.beta != null ? `<div class="stat-row"><span class="label">Beta</span><span class="val">${v(r.beta, 3)}</span></div>` : ''}
    ${r.information_ratio != null ? `<div class="stat-row"><span class="label">Information Ratio</span><span class="val">${v(r.information_ratio, 3)}</span></div>` : ''}
    ${r.deflated_sharpe_ratio != null ? `<div class="stat-row"><span class="label">Deflated Sharpe Ratio</span><span class="val">${v(r.deflated_sharpe_ratio, 3)}</span></div>` : ''}
  </div>
</div>` : ''}

<!-- Transaction Cost Analysis -->
${(r.total_commission != null || r.total_slippage != null) ? `
<div class="section">
  <div class="section-title">Transaction Cost Analysis</div>
  <div class="stats-grid">
    ${r.total_commission != null ? `<div class="stat-row"><span class="label">Total Commission</span><span class="val">${money(r.total_commission)}</span></div>` : ''}
    ${r.total_slippage != null ? `<div class="stat-row"><span class="label">Total Slippage</span><span class="val">${money(r.total_slippage)}</span></div>` : ''}
    ${r.total_spread_cost != null ? `<div class="stat-row"><span class="label">Total Spread Cost</span><span class="val">${money(r.total_spread_cost)}</span></div>` : ''}
    ${r.cost_as_pct_of_pnl != null ? `<div class="stat-row"><span class="label">Costs as % of P&L</span><span class="val">${v(r.cost_as_pct_of_pnl,1)}%</span></div>` : ''}
  </div>
</div>` : ''}

<!-- Monthly Returns Heatmap -->
<div class="section">
  <div class="section-title">Monthly Returns</div>
  <div class="heatmap" id="heatmap-wrap"></div>
</div>

<!-- Trade Log -->
${trades.length > 0 ? `
<div class="section">
  <div class="section-title">Trade Log${trades.length > 50 ? ' (showing first 50)' : ''}</div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Entry</th><th>Exit</th><th>Side</th>
          <th class="right">Entry $</th><th class="right">Exit $</th><th class="right">Size</th>
          <th class="right">P&L</th><th class="right">P&L %</th><th class="right">Commission</th>
        </tr>
      </thead>
      <tbody id="trade-body"></tbody>
    </table>
  </div>
</div>` : ''}

<!-- Configuration -->
<div class="section">
  <div class="section-title">Configuration</div>
  <div class="config-bar">
    <div class="item"><strong>Symbol:</strong> ${esc(config.symbol)}</div>
    <div class="item"><strong>Period:</strong> ${esc(config.startDate)} to ${esc(config.endDate)}</div>
    <div class="item"><strong>Capital:</strong> $${config.initialCapital.toLocaleString()}</div>
    <div class="item"><strong>Interval:</strong> ${esc(config.interval)}</div>
    <div class="item"><strong>Commission:</strong> ${config.commission}%</div>
    <div class="item"><strong>Slippage:</strong> ${config.slippage}%</div>
  </div>
</div>

<!-- Footer -->
<div class="footer">
  <span>Generated ${new Date().toISOString().split('T')[0]} &middot; Ceap Council Backtest Engine</span>
  <span>This report is for informational purposes only. Past performance does not guarantee future results.</span>
</div>

</div>

<script>
// === Data ===
var EC=${ec}, DD=${dd}, HIST=${histData}, MONTHLY=${mData}, TRADES=${tradeLog}, RSHARPE=${rollingSharpe};

// === Chart utilities ===
var DPR = window.devicePixelRatio || 1;
function initCanvas(id, h) {
  var c = document.getElementById(id); if (!c) return null;
  var rect = c.getBoundingClientRect();
  c.width = rect.width * DPR; c.height = h * DPR;
  c.style.height = h + 'px';
  var ctx = c.getContext('2d'); ctx.scale(DPR, DPR);
  return { c: c, ctx: ctx, w: rect.width, h: h };
}

function niceScale(mn, mx, ticks) {
  var range = mx - mn || 1;
  var rough = range / (ticks - 1);
  var mag = Math.pow(10, Math.floor(Math.log10(rough)));
  var residual = rough / mag;
  var nice = residual <= 1.5 ? 1 : residual <= 3 ? 2 : residual <= 7 ? 5 : 10;
  var step = nice * mag;
  var lo = Math.floor(mn / step) * step;
  var hi = Math.ceil(mx / step) * step;
  var vals = [];
  for (var v = lo; v <= hi + step * 0.001; v += step) vals.push(Math.round(v * 1e6) / 1e6);
  return vals;
}

function fmt(v) {
  if (Math.abs(v) >= 1e6) return (v/1e6).toFixed(1)+'M';
  if (Math.abs(v) >= 1e3) return (v/1e3).toFixed(1)+'K';
  if (Math.abs(v) >= 1) return v.toFixed(Math.abs(v) >= 100 ? 0 : 1);
  return v.toFixed(2);
}

var PAD = { t: 16, r: 16, b: 32, l: 56 };

function drawLine(id, data, key, color, opts) {
  opts = opts || {};
  var h = opts.h || 260;
  var o = initCanvas(id, h); if (!o || !data.length) return;
  var ctx=o.ctx, w=o.w;
  var vals = data.map(function(p){return p[key]});
  var mn = opts.min != null ? opts.min : Math.min.apply(null, vals);
  var mx = opts.max != null ? opts.max : Math.max.apply(null, vals);
  var plotW = w - PAD.l - PAD.r, plotH = h - PAD.t - PAD.b;

  // Grid + Y axis
  var ticks = niceScale(mn, mx, 5);
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.font = '10px -apple-system, sans-serif';
  ticks.forEach(function(t) {
    var y = PAD.t + plotH - ((t - mn) / (mx - mn || 1)) * plotH;
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(w - PAD.r, y); ctx.stroke();
    ctx.fillStyle = '#9ca3af'; ctx.fillText(opts.pct ? t.toFixed(1)+'%' : fmt(t), PAD.l - 6, y);
  });

  // X axis labels (5-6 evenly spaced dates)
  if (data[0] && data[0].date) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    var step = Math.max(1, Math.floor(data.length / 5));
    for (var i = 0; i < data.length; i += step) {
      var px = PAD.l + (i / (data.length - 1)) * plotW;
      var lbl = data[i].date; if (lbl && lbl.length > 10) lbl = lbl.substring(0, 10);
      ctx.fillStyle = '#9ca3af'; ctx.fillText(lbl, px, h - PAD.b + 6);
    }
  }

  // Zero line
  if (mn < 0 && mx > 0) {
    var zy = PAD.t + plotH - ((0 - mn) / (mx - mn)) * plotH;
    ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 1; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(PAD.l, zy); ctx.lineTo(w - PAD.r, zy); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Fill
  ctx.beginPath();
  var fillBase = opts.fillToZero && mn < 0 ? PAD.t + plotH - ((0 - mn) / (mx - mn || 1)) * plotH : PAD.t + plotH;
  for (var i = 0; i < vals.length; i++) {
    var px = PAD.l + (i / (vals.length - 1)) * plotW;
    var py = PAD.t + plotH - ((vals[i] - mn) / (mx - mn || 1)) * plotH;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.lineTo(PAD.l + plotW, fillBase);
  ctx.lineTo(PAD.l, fillBase);
  ctx.closePath();
  var grad = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + plotH);
  var c2 = color.replace(')', ',0.15)').replace('rgb', 'rgba');
  var c3 = color.replace(')', ',0.01)').replace('rgb', 'rgba');
  grad.addColorStop(0, c2); grad.addColorStop(1, c3);
  ctx.fillStyle = grad; ctx.fill();

  // Line
  ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.8;
  for (var i = 0; i < vals.length; i++) {
    var px = PAD.l + (i / (vals.length - 1)) * plotW;
    var py = PAD.t + plotH - ((vals[i] - mn) / (mx - mn || 1)) * plotH;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.stroke();
}

function drawHist(id, data, h) {
  h = h || 180;
  var o = initCanvas(id, h); if (!o || !data.length) return;
  var ctx=o.ctx, w=o.w;
  var plotW = w - PAD.l - PAD.r, plotH = h - PAD.t - PAD.b;
  var mx = Math.max.apply(null, data.map(function(d){return d.count}));
  var barW = (plotW / data.length) - 2;
  var ticks = niceScale(0, mx, 4);

  // Grid
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.font = '10px -apple-system, sans-serif';
  ticks.forEach(function(t) {
    var y = PAD.t + plotH - (t / (mx || 1)) * plotH;
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(w - PAD.r, y); ctx.stroke();
    ctx.fillStyle = '#9ca3af'; ctx.fillText(t.toFixed(0), PAD.l - 6, y);
  });

  // Bars
  data.forEach(function(d, i) {
    var bh = (d.count / (mx||1)) * plotH;
    var bx = PAD.l + i * (barW + 2) + 1;
    var by = PAD.t + plotH - bh;
    ctx.fillStyle = d.bin_center >= 0 ? '#059669' : '#dc2626';
    ctx.beginPath();
    // Rounded top corners
    var r = Math.min(3, barW/2, bh/2);
    ctx.moveTo(bx, by + r);
    ctx.arcTo(bx, by, bx + r, by, r);
    ctx.arcTo(bx + barW, by, bx + barW, by + r, r);
    ctx.lineTo(bx + barW, PAD.t + plotH);
    ctx.lineTo(bx, PAD.t + plotH);
    ctx.closePath();
    ctx.fill();
  });

  // X labels (a few bin centers)
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.font = '10px -apple-system, sans-serif';
  var step = Math.max(1, Math.floor(data.length / 5));
  for (var i = 0; i < data.length; i += step) {
    var cx = PAD.l + i * (barW + 2) + barW / 2 + 1;
    ctx.fillStyle = '#9ca3af';
    ctx.fillText('$' + data[i].bin_center.toFixed(0), cx, h - PAD.b + 6);
  }
}

// === Monthly heatmap ===
function renderHeatmap() {
  if (!MONTHLY.length) { document.getElementById('heatmap-wrap').innerHTML = '<div style="padding:24px;text-align:center;color:#9ca3af;font-size:12px">Insufficient data for monthly breakdown</div>'; return; }
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var years = []; var map = {};
  MONTHLY.forEach(function(m) {
    var k = m.year; if (years.indexOf(k) < 0) years.push(k);
    map[k + '-' + m.month] = m.return_pct;
  });
  years.sort();
  var html = '<table><thead><tr><th></th>';
  months.forEach(function(m) { html += '<th>' + m + '</th>'; });
  html += '<th style="font-weight:700">Year</th></tr></thead><tbody>';
  years.forEach(function(y) {
    html += '<tr><td style="font-weight:600;text-align:left;padding-left:12px">' + y + '</td>';
    var yearTotal = 0, hasData = false;
    months.forEach(function(_, mi) {
      var k = y + '-' + (mi+1);
      var v = map[k];
      if (v != null) {
        hasData = true; yearTotal += v;
        var intensity = Math.min(Math.abs(v) / 5, 1);
        var bg = v >= 0
          ? 'rgba(5,150,105,' + (0.08 + intensity * 0.35) + ')'
          : 'rgba(220,38,38,' + (0.08 + intensity * 0.35) + ')';
        var clr = v >= 0 ? '#059669' : '#dc2626';
        html += '<td class="heat" style="background:' + bg + ';color:' + clr + '">' + (v>=0?'+':'') + v.toFixed(1) + '%</td>';
      } else {
        html += '<td style="color:#d1d5db">—</td>';
      }
    });
    var ybg = yearTotal >= 0
      ? 'rgba(5,150,105,0.08)' : 'rgba(220,38,38,0.08)';
    var yclr = yearTotal >= 0 ? '#059669' : '#dc2626';
    html += '<td class="heat" style="background:' + ybg + ';color:' + yclr + ';font-weight:700">' + (hasData ? (yearTotal>=0?'+':'') + yearTotal.toFixed(1) + '%' : '—') + '</td></tr>';
  });
  html += '</tbody></table>';
  document.getElementById('heatmap-wrap').innerHTML = html;
}

// === Trade log ===
function esc(s) { if (s == null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function renderTrades() {
  var el = document.getElementById('trade-body'); if (!el || !TRADES.length) return;
  var html = '';
  TRADES.forEach(function(t) {
    var cls = t.pnl >= 0 ? 'pos' : 'neg';
    html += '<tr>'
      + '<td class="mono">' + esc(t.entry) + '</td>'
      + '<td class="mono">' + esc(t.exit) + '</td>'
      + '<td><span style="display:inline-block;padding:1px 8px;border-radius:9999px;font-size:10px;font-weight:600;' + (t.type==='LONG' ? 'background:#ecfdf5;color:#059669' : 'background:#fef2f2;color:#dc2626') + '">' + esc(t.type) + '</span></td>'
      + '<td class="right mono">$' + t.ep.toFixed(2) + '</td>'
      + '<td class="right mono">$' + t.xp.toFixed(2) + '</td>'
      + '<td class="right">' + esc(t.sz) + '</td>'
      + '<td class="right ' + cls + ' mono" style="font-weight:600">' + (t.pnl>=0?'+':'') + '$' + t.pnl.toFixed(2) + '</td>'
      + '<td class="right ' + cls + ' mono">' + (t.pct>=0?'+':'') + t.pct.toFixed(2) + '%</td>'
      + '<td class="right mono">$' + t.comm.toFixed(2) + '</td>'
      + '</tr>';
  });
  el.innerHTML = html;
}

// === Render ===
drawLine('eq', EC, 'equity', 'rgb(5,150,105)', { h: 260 });
drawLine('dd', DD, 'drawdown_pct', 'rgb(220,38,38)', { h: 180, max: 0, pct: true, fillToZero: true });
drawHist('dist', HIST, 180);
drawLine('rsharpe', RSHARPE, 'value', 'rgb(37,99,235)', { h: 180 });
renderHeatmap();
renderTrades();
</script>
</body>
</html>`;
  }, [config]);

  return { handleExportResults, handleExportJSON, generateLocalTearsheet };
}
