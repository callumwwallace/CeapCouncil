"""HTML tear sheet generator: professional backtest report.

Generates a standalone HTML report with:
- Equity curve and drawdown charts (inline SVG)
- Monthly returns heatmap
- Trade distribution histogram
- Key performance metrics table
- Trade log summary
"""

from __future__ import annotations

import json
import math
from datetime import datetime
from typing import Any

import numpy as np


def generate_tearsheet(results: dict, title: str = "Backtest Report") -> str:
    """Generate a standalone HTML tear sheet from backtest results.

    Args:
        results: Output from EngineResult.to_results_dict()
        title: Report title

    Returns:
        Complete HTML string
    """
    metrics = _format_metrics(results)
    monthly_returns = _compute_monthly_returns(results.get("equity_curve", []))
    trade_dist = _compute_trade_distribution(results.get("trades", []))
    equity_data = json.dumps(results.get("equity_curve", []))
    drawdown_data = json.dumps(results.get("drawdown_series", []))
    monthly_data = json.dumps(monthly_returns)
    trade_dist_data = json.dumps(trade_dist)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0f; color: #e0e0e0; padding: 24px; }}
.container {{ max-width: 1200px; margin: 0 auto; }}
h1 {{ font-size: 24px; color: #fff; margin-bottom: 8px; }}
h2 {{ font-size: 18px; color: #a0a0b0; margin: 24px 0 12px; border-bottom: 1px solid #1a1a2e; padding-bottom: 8px; }}
.subtitle {{ color: #666; font-size: 13px; margin-bottom: 24px; }}
.metrics-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }}
.metric {{ background: #12121a; border: 1px solid #1a1a2e; border-radius: 8px; padding: 14px; }}
.metric-label {{ font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }}
.metric-value {{ font-size: 20px; font-weight: 600; margin-top: 4px; }}
.positive {{ color: #10b981; }}
.negative {{ color: #ef4444; }}
.neutral {{ color: #a0a0b0; }}
.chart-container {{ background: #12121a; border: 1px solid #1a1a2e; border-radius: 8px; padding: 16px; margin-bottom: 16px; }}
canvas {{ width: 100%; height: 200px; }}
.heatmap-grid {{ display: grid; gap: 2px; }}
.heatmap-cell {{ padding: 4px; text-align: center; font-size: 11px; border-radius: 3px; }}
.trade-table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
.trade-table th {{ text-align: left; padding: 8px; border-bottom: 1px solid #1a1a2e; color: #666; font-weight: 500; }}
.trade-table td {{ padding: 8px; border-bottom: 1px solid #0f0f1a; }}
.footer {{ text-align: center; color: #444; font-size: 11px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #1a1a2e; }}
.row {{ display: flex; gap: 16px; }}
.col {{ flex: 1; }}
</style>
</head>
<body>
<div class="container">
<h1>{title}</h1>
<div class="subtitle">Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} &middot; Ceap Council</div>

<h2>Performance Summary</h2>
<div class="metrics-grid">
{metrics}
</div>

<h2>Equity Curve</h2>
<div class="chart-container">
<canvas id="equityChart"></canvas>
</div>

<h2>Drawdown</h2>
<div class="chart-container">
<canvas id="drawdownChart"></canvas>
</div>

<div class="row">
<div class="col">
<h2>Monthly Returns (%)</h2>
<div class="chart-container" id="monthlyHeatmap"></div>
</div>
<div class="col">
<h2>Trade P&L Distribution</h2>
<div class="chart-container">
<canvas id="tradeDistChart"></canvas>
</div>
</div>
</div>

<h2>Recent Trades</h2>
{_format_trade_table(results.get("trades", [])[:20])}

<div class="footer">Ceap Council Backtesting Platform &middot; {datetime.utcnow().year}</div>
</div>

<script>
const equityData = {equity_data};
const drawdownData = {drawdown_data};
const monthlyData = {monthly_data};
const tradeDistData = {trade_dist_data};

function drawLineChart(canvasId, data, key, color, fill) {{
    const canvas = document.getElementById(canvasId);
    if (!canvas || !data.length) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 200 * dpr;
    canvas.style.height = '200px';
    ctx.scale(dpr, dpr);
    const w = rect.width, h = 200;
    const values = data.map(d => d[key]);
    const min = Math.min(...values), max = Math.max(...values);
    const range = max - min || 1;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < values.length; i++) {{
        const x = (i / (values.length - 1)) * w;
        const y = h - ((values[i] - min) / range) * (h - 20) - 10;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }}
    ctx.stroke();
    if (fill) {{
        ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
        ctx.fillStyle = color.replace(')', ', 0.1)').replace('rgb', 'rgba');
        ctx.fill();
    }}
}}

function drawMonthlyHeatmap(containerId, data) {{
    const el = document.getElementById(containerId);
    if (!el || !data.length) return;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const years = [...new Set(data.map(d => d.year))].sort();
    let html = '<div style="display:grid;grid-template-columns:50px repeat(12,1fr);gap:2px;font-size:11px">';
    html += '<div></div>' + months.map(m => '<div style="text-align:center;color:#666">'+m+'</div>').join('');
    for (const year of years) {{
        html += '<div style="color:#666;padding:4px">'+year+'</div>';
        for (let m = 1; m <= 12; m++) {{
            const entry = data.find(d => d.year === year && d.month === m);
            const val = entry ? entry.return_pct : null;
            const bg = val === null ? '#0a0a0f' : val >= 0 ? `rgba(16,185,129,${{Math.min(Math.abs(val)/5, 1)}})` : `rgba(239,68,68,${{Math.min(Math.abs(val)/5, 1)}})`;
            const text = val !== null ? val.toFixed(1) : '';
            html += `<div class="heatmap-cell" style="background:${{bg}}">${{text}}</div>`;
        }}
    }}
    html += '</div>';
    el.innerHTML = html;
}}

function drawHistogram(canvasId, data) {{
    const canvas = document.getElementById(canvasId);
    if (!canvas || !data.length) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 200 * dpr;
    canvas.style.height = '200px';
    ctx.scale(dpr, dpr);
    const w = rect.width, h = 200;
    const maxCount = Math.max(...data.map(d => d.count));
    const barWidth = w / data.length - 2;
    data.forEach((d, i) => {{
        const x = i * (barWidth + 2);
        const barH = (d.count / maxCount) * (h - 30);
        ctx.fillStyle = d.bin_center >= 0 ? '#10b981' : '#ef4444';
        ctx.fillRect(x, h - barH - 15, barWidth, barH);
        if (data.length <= 20) {{
            ctx.fillStyle = '#666';
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(d.bin_center.toFixed(0), x + barWidth/2, h - 2);
        }}
    }});
}}

drawLineChart('equityChart', equityData, 'equity', 'rgb(16, 185, 129)', true);
drawLineChart('drawdownChart', drawdownData, 'drawdown_pct', 'rgb(239, 68, 68)', true);
drawMonthlyHeatmap('monthlyHeatmap', monthlyData);
drawHistogram('tradeDistChart', tradeDistData);
</script>
</body>
</html>"""
    return html


def _format_metrics(results: dict) -> str:
    """Format key metrics as HTML cards."""
    items = [
        ("Total Return", f"{results.get('total_return_pct', 0):.2f}%", results.get('total_return_pct', 0) >= 0),
        ("Sharpe Ratio", f"{results.get('sharpe_ratio', 0) or 0:.4f}", (results.get('sharpe_ratio') or 0) > 0),
        ("Sortino Ratio", f"{results.get('sortino_ratio', 0) or 0:.4f}", (results.get('sortino_ratio') or 0) > 0),
        ("Max Drawdown", f"{results.get('max_drawdown_pct', 0):.2f}%", False),
        ("Win Rate", f"{results.get('win_rate', 0):.1f}%", (results.get('win_rate', 0) or 0) > 50),
        ("Total Trades", f"{results.get('total_trades', 0)}", None),
        ("Profit Factor", f"{results.get('profit_factor', 0) or 0:.2f}", (results.get('profit_factor') or 0) > 1),
        ("Calmar Ratio", f"{results.get('calmar_ratio', 0) or 0:.4f}", (results.get('calmar_ratio') or 0) > 0),
        ("Expectancy", f"${results.get('expectancy', 0) or 0:.2f}", (results.get('expectancy') or 0) > 0),
        ("Annual Volatility", f"{results.get('volatility_annual', 0) or 0:.2f}%", None),
        ("Beta", f"{results.get('beta', 0) or 0:.4f}", None),
        ("Alpha", f"{results.get('alpha', 0) or 0:.4f}%", (results.get('alpha') or 0) > 0),
        ("Final Value", f"${results.get('final_value', 0):,.2f}", None),
    ]
    html = ""
    for label, value, is_positive in items:
        cls = "neutral"
        if is_positive is True:
            cls = "positive"
        elif is_positive is False:
            cls = "negative"
        html += f'<div class="metric"><div class="metric-label">{label}</div><div class="metric-value {cls}">{value}</div></div>\n'
    return html


def _compute_monthly_returns(equity_curve: list[dict]) -> list[dict]:
    """Compute monthly returns from equity curve."""
    if len(equity_curve) < 2:
        return []

    monthly: dict[tuple[int, int], list[float]] = {}
    for i, point in enumerate(equity_curve):
        try:
            date_str = point.get("date", "")
            if isinstance(date_str, str):
                if "T" in date_str:
                    dt = datetime.fromisoformat(date_str.replace("Z", ""))
                else:
                    dt = datetime.strptime(date_str, "%Y-%m-%d")
            else:
                continue
            key = (dt.year, dt.month)
            monthly.setdefault(key, []).append(point.get("equity", 0))
        except (ValueError, TypeError):
            continue

    results = []
    for (year, month), equities in sorted(monthly.items()):
        if len(equities) >= 2 and equities[0] > 0:
            ret = (equities[-1] / equities[0] - 1) * 100
            results.append({"year": year, "month": month, "return_pct": round(ret, 2)})
    return results


def _compute_trade_distribution(trades: list[dict]) -> list[dict]:
    """Compute trade P&L distribution histogram."""
    pnls = [t.get("pnl", 0) for t in trades if "pnl" in t]
    if not pnls:
        return []

    pnl_arr = np.array(pnls)
    if len(pnl_arr) < 2:
        return [{"bin_center": float(pnl_arr[0]), "count": 1}]

    num_bins = min(20, max(5, len(pnl_arr) // 5))
    counts, edges = np.histogram(pnl_arr, bins=num_bins)
    result = []
    for i in range(len(counts)):
        center = (edges[i] + edges[i + 1]) / 2
        result.append({"bin_center": round(float(center), 2), "count": int(counts[i])})
    return result


def _format_trade_table(trades: list[dict]) -> str:
    """Format trades as an HTML table."""
    if not trades:
        return '<p style="color:#666">No trades to display.</p>'

    html = '<table class="trade-table"><thead><tr>'
    html += '<th>#</th><th>Entry</th><th>Exit</th><th>Side</th><th>P&L</th><th>Return %</th></tr></thead><tbody>'

    for i, t in enumerate(trades):
        pnl = t.get("pnl", 0)
        pnl_class = "positive" if pnl >= 0 else "negative"
        ret = t.get("return_pct", 0)
        html += f'<tr><td>{i+1}</td><td>{t.get("entry_date", "-")}</td><td>{t.get("exit_date", "-")}</td>'
        html += f'<td>{t.get("side", "-")}</td>'
        html += f'<td class="{pnl_class}">${pnl:,.2f}</td>'
        html += f'<td class="{pnl_class}">{ret:.2f}%</td></tr>'

    html += '</tbody></table>'
    return html
