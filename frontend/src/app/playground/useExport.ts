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
    const pnls = trades.map((t: any) => t.pnl || 0);
    const bins = 15;
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
    void mData; // used in future tearsheet expansion

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tear Sheet</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;background:#0a0a0f;color:#e0e0e0;padding:24px}.c{max-width:1200px;margin:0 auto}h1{font-size:24px;color:#fff;margin-bottom:8px}h2{font-size:18px;color:#a0a0b0;margin:24px 0 12px;border-bottom:1px solid #1a1a2e;padding-bottom:8px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:24px}.m{background:#12121a;border:1px solid #1a1a2e;border-radius:8px;padding:14px}.ml{font-size:11px;color:#666;text-transform:uppercase}.mv{font-size:20px;font-weight:600;margin-top:4px}.pos{color:#10b981}.neg{color:#ef4444}.cc{background:#12121a;border:1px solid #1a1a2e;border-radius:8px;padding:16px;margin-bottom:16px}canvas{width:100%;height:200px}</style></head>
<body><div class="c"><h1>Backtest Report: ${config.symbol}</h1><p style="color:#666;font-size:13px;margin-bottom:24px">${new Date().toISOString().split('T')[0]} · Ceap Council Engine v2</p>
<h2>Performance</h2><div class="g">
<div class="m"><div class="ml">Return</div><div class="mv ${(r.total_return||0)>=0?'pos':'neg'}">${(r.total_return||0).toFixed(2)}%</div></div>
<div class="m"><div class="ml">Sharpe</div><div class="mv">${(r.sharpe_ratio||0).toFixed(4)}</div></div>
<div class="m"><div class="ml">Sortino</div><div class="mv">${(r.sortino_ratio||0).toFixed(4)}</div></div>
<div class="m"><div class="ml">Max Drawdown</div><div class="mv neg">${(r.max_drawdown||0).toFixed(2)}%</div></div>
<div class="m"><div class="ml">Win Rate</div><div class="mv">${(r.win_rate||0).toFixed(1)}%</div></div>
<div class="m"><div class="ml">Trades</div><div class="mv">${r.total_trades||0}</div></div>
<div class="m"><div class="ml">Profit Factor</div><div class="mv">${(r.profit_factor||0).toFixed(2)}</div></div>
<div class="m"><div class="ml">Final Value</div><div class="mv">$${(r.final_value||0).toLocaleString()}</div></div>
<div class="m"><div class="ml">VaR 95%</div><div class="mv neg">${(r.var_95||0).toFixed(2)}%</div></div>
<div class="m"><div class="ml">CVaR 95%</div><div class="mv neg">${(r.cvar_95||0).toFixed(2)}%</div></div>
<div class="m"><div class="ml">VaR 99%</div><div class="mv neg">${(r.var_99||0).toFixed(2)}%</div></div>
<div class="m"><div class="ml">CVaR 99%</div><div class="mv neg">${(r.cvar_99||0).toFixed(2)}%</div></div>
</div>
<h2>Equity Curve</h2><div class="cc"><canvas id="eq"></canvas></div>
<h2>Drawdown</h2><div class="cc"><canvas id="dd"></canvas></div>
<h2>Trade P&L Distribution</h2><div class="cc"><canvas id="dist"></canvas></div>
<script>
function draw(id,data,key,color,fill){const c=document.getElementById(id);if(!c||!data.length)return;const x=c.getContext('2d');const r=c.getBoundingClientRect();const d=window.devicePixelRatio||1;c.width=r.width*d;c.height=200*d;c.style.height='200px';x.scale(d,d);const w=r.width,h=200;const v=data.map(p=>p[key]);const mn=Math.min(...v),mx=Math.max(...v),rng=mx-mn||1;x.beginPath();x.strokeStyle=color;x.lineWidth=1.5;for(let i=0;i<v.length;i++){const px=i/(v.length-1)*w,py=h-((v[i]-mn)/rng)*(h-20)-10;i===0?x.moveTo(px,py):x.lineTo(px,py)}x.stroke();if(fill){x.lineTo(w,h);x.lineTo(0,h);x.closePath();x.fillStyle=color.replace(')',',0.1)').replace('rgb','rgba');x.fill()}}
function hist(id,data){const c=document.getElementById(id);if(!c||!data.length)return;const x=c.getContext('2d');const r=c.getBoundingClientRect();const d=window.devicePixelRatio||1;c.width=r.width*d;c.height=200*d;c.style.height='200px';x.scale(d,d);const w=r.width,h=200;const mx=Math.max(...data.map(d=>d.count));const bw=w/data.length-2;data.forEach((d,i)=>{const bh=d.count/mx*(h-30);x.fillStyle=d.bin_center>=0?'#10b981':'#ef4444';x.fillRect(i*(bw+2),h-bh-15,bw,bh)})}
draw('eq',${ec},'equity','rgb(16,185,129)',true);
draw('dd',${dd},'drawdown_pct','rgb(239,68,68)',true);
hist('dist',${histData});
</script></div></body></html>`;
  }, [config.symbol]);

  return { handleExportResults, handleExportJSON, generateLocalTearsheet };
}
