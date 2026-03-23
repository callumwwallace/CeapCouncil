'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
  CartesianGrid,
  usePlotArea,
  useYAxisDomain,
} from 'recharts';
import { ChevronDown, ZoomIn, ZoomOut, Maximize2, CircleOff } from 'lucide-react';
import api from '@/lib/api';

// Type exports

export type ChartType =
  | 'candles'
  | 'hollowCandles'
  | 'ohlcBars'
  | 'heikinAshi'
  | 'line'
  | 'area'
  | 'baseline';

export interface TradeMarker {
  date: string;
  type: 'buy' | 'sell';
  price: number;
}

export interface EquityCurvePoint {
  date: string;
  equity: number;
}

export interface DrawdownPoint {
  date: string;
  drawdown_pct: number;
}

export type ChartTheme = 'light' | 'dark';

export interface ActiveMAs {
  sma9: boolean; sma20: boolean; sma50: boolean; sma100: boolean; sma200: boolean;
  ema12: boolean; ema26: boolean; ema50: boolean;
}

export const DEFAULT_ACTIVE_MAS: ActiveMAs = {
  sma9: false, sma20: false, sma50: false, sma100: false, sma200: false,
  ema12: false, ema26: false, ema50: false,
};

export interface AssetChartProps {
  symbol: string;
  startDate: string;
  endDate: string;
  interval?: string;
  trades?: TradeMarker[];
  equityCurve?: EquityCurvePoint[];
  drawdownSeries?: DrawdownPoint[];
  benchmarkReturn?: number | null;
  chartTheme?: ChartTheme;
}

export interface PriceDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  return: number;
  sma9?: number;
  sma20?: number;
  sma50?: number;
  sma100?: number;
  sma200?: number;
  ema12?: number;
  ema26?: number;
  ema50?: number;
}

// Chart types and icons

function CandleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="4" y1="2" x2="4" y2="14" stroke="currentColor" strokeWidth="1" />
      <rect x="2" y="4" width="4" height="6" fill="#10b981" stroke="#10b981" rx="0.5" />
      <line x1="12" y1="2" x2="12" y2="14" stroke="currentColor" strokeWidth="1" />
      <rect x="10" y="5" width="4" height="6" fill="#ef4444" stroke="#ef4444" rx="0.5" />
    </svg>
  );
}

function HollowCandleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="4" y1="2" x2="4" y2="14" stroke="currentColor" strokeWidth="1" />
      <rect x="2" y="4" width="4" height="6" fill="none" stroke="#10b981" strokeWidth="1.5" rx="0.5" />
      <line x1="12" y1="2" x2="12" y2="14" stroke="currentColor" strokeWidth="1" />
      <rect x="10" y="5" width="4" height="6" fill="#ef4444" stroke="#ef4444" rx="0.5" />
    </svg>
  );
}

function OHLCBarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="4" y1="2" x2="4" y2="14" stroke="#10b981" strokeWidth="1.5" />
      <line x1="2" y1="5" x2="4" y2="5" stroke="#10b981" strokeWidth="1.5" />
      <line x1="4" y1="10" x2="6" y2="10" stroke="#10b981" strokeWidth="1.5" />
      <line x1="12" y1="2" x2="12" y2="14" stroke="#ef4444" strokeWidth="1.5" />
      <line x1="10" y1="4" x2="12" y2="4" stroke="#ef4444" strokeWidth="1.5" />
      <line x1="12" y1="11" x2="14" y2="11" stroke="#ef4444" strokeWidth="1.5" />
    </svg>
  );
}

function HeikinAshiIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="4" y1="3" x2="4" y2="13" stroke="currentColor" strokeWidth="1" />
      <rect x="2" y="5" width="4" height="5" fill="#10b981" stroke="#10b981" rx="1" />
      <line x1="12" y1="3" x2="12" y2="13" stroke="currentColor" strokeWidth="1" />
      <rect x="10" y="5" width="4" height="5" fill="#ef4444" stroke="#ef4444" rx="1" />
    </svg>
  );
}

function LineChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <polyline points="1,12 4,6 7,9 10,3 14,7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AreaChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <polygon points="1,12 4,6 7,9 10,3 14,7 14,14 1,14" fill="currentColor" opacity="0.2" />
      <polyline points="1,12 4,6 7,9 10,3 14,7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BaselineChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="1" y1="8" x2="15" y2="8" stroke="#6b7280" strokeWidth="1" strokeDasharray="2 2" />
      <polyline points="1,10 4,5 7,7 10,3 14,6" stroke="#10b981" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const CHART_TYPES: { value: ChartType; label: string; icon: React.ReactNode }[] = [
  { value: 'candles', label: 'Candles', icon: <CandleIcon /> },
  { value: 'hollowCandles', label: 'Hollow Candles', icon: <HollowCandleIcon /> },
  { value: 'ohlcBars', label: 'OHLC Bars', icon: <OHLCBarIcon /> },
  { value: 'heikinAshi', label: 'Heikin-Ashi', icon: <HeikinAshiIcon /> },
  { value: 'line', label: 'Line', icon: <LineChartIcon /> },
  { value: 'area', label: 'Area', icon: <AreaChartIcon /> },
  { value: 'baseline', label: 'Baseline', icon: <BaselineChartIcon /> },
];

// Interval and helpers

function isIntraday(interval: string): boolean {
  return interval !== '1d';
}

/** Pick chart type based on symbol (forex, crypto, indices, etc) */
function getOptimalChartType(symbol: string): ChartType {
  const s = symbol.toUpperCase();
  if (s.endsWith('=X')) return 'ohlcBars';  // Forex
  if (s.includes('-USD') || ['BTC', 'ETH', 'SOL', 'DOGE', 'ADA', 'XRP', 'AVAX', 'MATIC', 'LINK', 'UNI'].some(x => s.includes(x)))
    return 'candles';  // Crypto
  if (['SPY', 'QQQ', 'IWM', 'GLD', 'SLV', 'TLT', 'HYG', 'DIA'].includes(s)) return 'area';  // Indices & ETFs
  return 'candles';  // Stocks
}

// Smart x-axis tick formatter (TradingView-style)

function createSmartTickFormatter(interval: string, data: PriceDataPoint[]) {
  const dayStarts = new Set<string>();
  const monthStarts = new Set<string>();
  let prevDate = '';
  let prevMonth = '';

  for (const d of data) {
    const dateOnly = d.date.slice(0, 10);
    const monthKey = dateOnly.slice(0, 7);
    if (dateOnly !== prevDate) { dayStarts.add(d.date); prevDate = dateOnly; }
    if (monthKey !== prevMonth) { monthStarts.add(d.date); prevMonth = monthKey; }
  }

  return (value: string) => {
    if (!value) return '';
    const dateOnly = value.slice(0, 10);
    const hasTime = value.length > 10;

    if (isIntraday(interval)) {
      if (dayStarts.has(value)) {
        const d = new Date(dateOnly);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
      if (hasTime) return value.slice(11);
      return '';
    }

    if (monthStarts.has(value)) {
      const d = new Date(dateOnly);
      return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    }
    const d = new Date(dateOnly);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
}

// Session boundaries for intraday dividers

function getSessionBoundaries(data: PriceDataPoint[]): string[] {
  const boundaries: string[] = [];
  let prevDate = '';
  for (const d of data) {
    const dateOnly = d.date.slice(0, 10);
    if (dateOnly !== prevDate && prevDate !== '') boundaries.push(d.date);
    prevDate = dateOnly;
  }
  return boundaries;
}

// Heikin-Ashi transform

function computeHeikinAshi(data: PriceDataPoint[]): PriceDataPoint[] {
  if (data.length === 0) return [];
  const ha: PriceDataPoint[] = [];
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const haClose = (d.open + d.high + d.low + d.close) / 4;
    const haOpen = i === 0 ? (d.open + d.close) / 2 : (ha[i - 1].open + ha[i - 1].close) / 2;
    const haHigh = Math.max(d.high, haOpen, haClose);
    const haLow = Math.min(d.low, haOpen, haClose);
    ha.push({
      ...d,
      open: parseFloat(haOpen.toFixed(2)),
      high: parseFloat(haHigh.toFixed(2)),
      low: parseFloat(haLow.toFixed(2)),
      close: parseFloat(haClose.toFixed(2)),
    });
  }
  return ha;
}

// Moving averages

function sma(data: PriceDataPoint[], period: number, key: keyof PriceDataPoint) {
  for (let i = period - 1; i < data.length; i++) {
    const sum = data.slice(i - period + 1, i + 1).reduce((acc, d) => acc + d.close, 0);
    (data[i] as any)[key] = parseFloat((sum / period).toFixed(2));
  }
}

function ema(data: PriceDataPoint[], period: number, key: keyof PriceDataPoint) {
  const alpha = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) continue;
    if (prev === null) {
      // Seed with SMA of first `period` bars
      const seed = data.slice(0, period).reduce((acc, d) => acc + d.close, 0) / period;
      prev = seed;
    }
    const val = parseFloat((alpha * data[i].close + (1 - alpha) * prev).toFixed(2));
    (data[i] as any)[key] = val;
    prev = val;
  }
}

function addMovingAverages(data: PriceDataPoint[]): PriceDataPoint[] {
  sma(data, 9, 'sma9');
  sma(data, 20, 'sma20');
  sma(data, 50, 'sma50');
  sma(data, 100, 'sma100');
  sma(data, 200, 'sma200');
  ema(data, 12, 'ema12');
  ema(data, 26, 'ema26');
  ema(data, 50, 'ema50');
  return data;
}

// Price bars (candlestick, hollow, OHLC)

const BULL_COLOR = '#26a69a';
const BEAR_COLOR = '#ef5350';

const BUY_GLOW = '#0ea5e9';
const SELL_GLOW = '#f59e0b';

export type TradeMarkerStyle = 'none' | 'dot' | 'pro' | 'box';

/** Trade markers: none, dot, pro (TradingView), or box */
function TradeMarkersLayer({
  trades,
  data,
  scale,
  style: markerStyle,
}: {
  trades: TradeMarker[];
  data: PriceDataPoint[];
  scale: number;
  style: TradeMarkerStyle;
}) {
  if (markerStyle === 'none') return null;
  const plotArea = usePlotArea();
  const yDomainRaw = useYAxisDomain('price');

  if (!plotArea || !yDomainRaw || !Array.isArray(yDomainRaw) || yDomainRaw.length < 2) return null;
  if (data.length === 0 || trades.length === 0) return null;

  const yMin = Number(yDomainRaw[0]);
  const yMax = Number(yDomainRaw[yDomainRaw.length - 1]);
  if (!isFinite(yMin) || !isFinite(yMax) || yMax === yMin) return null;

  const yScale = (price: number) => plotArea.y + (1 - (price - yMin) / (yMax - yMin)) * plotArea.height;
  const n = data.length;
  const bandWidth = plotArea.width / n;

  const s = scale;
  const boxH = 10 * s;
  const boxW = 32 * s;
  const lineLen = 18 * s;

  return (
    <g>
      {trades
        .filter((trade) => data.some((d) => d.date === trade.date))
        .map((trade, i) => {
          const idx = data.findIndex((d) => d.date === trade.date);
          if (idx < 0) return null;
          const cx = plotArea.x + (idx + 0.5) * bandWidth;
          const cy = yScale(trade.price);
          const isBuy = trade.type === 'buy';
          const color = isBuy ? BUY_GLOW : SELL_GLOW;
          const boxY = isBuy ? cy - lineLen - boxH : cy + lineLen;
          const lineEndY = isBuy ? cy - lineLen : cy + lineLen;
          const priceStr = trade.price != null ? trade.price.toFixed(2) : '';

          const candleWidth = Math.max(3, Math.min(bandWidth * 0.7, 20));
          const markerSize = Math.min(5 * s, Math.max(2.5, candleWidth * 0.45));

          if (markerStyle === 'dot') {
            return (
              <g key={i} filter={`url(#${isBuy ? 'trade-buy-glow' : 'trade-sell-glow'})`}>
                <circle cx={cx} cy={cy} r={markerSize} fill={color} stroke="#0f172a" strokeWidth={1} />
                {trade.date && <title>{(isBuy ? 'Buy' : 'Sell')} @ ${priceStr} ({trade.date})</title>}
              </g>
            );
          }

          if (markerStyle === 'pro') {
            const size = markerSize;
            const path = isBuy
              ? `M ${cx} ${cy - size} L ${cx - size} ${cy + size} L ${cx + size} ${cy + size} Z`
              : `M ${cx} ${cy + size} L ${cx - size} ${cy - size} L ${cx + size} ${cy - size} Z`;
            return (
              <g key={i} filter={`url(#${isBuy ? 'trade-buy-glow' : 'trade-sell-glow'})`}>
                <path d={path} fill={color} stroke="#0f172a" strokeWidth={1} />
                {trade.date && <title>{(isBuy ? 'Buy' : 'Sell')} @ ${priceStr} ({trade.date})</title>}
              </g>
            );
          }

          return (
            <g key={i} filter={`url(#${isBuy ? 'trade-buy-glow' : 'trade-sell-glow'})`}>
              <circle cx={cx} cy={cy} r={2.5 * s} fill="#0f172a" stroke={color} strokeWidth={1} />
              <line x1={cx} y1={cy} x2={cx} y2={lineEndY} stroke={color} strokeWidth={1} opacity={0.9} />
              <rect x={cx - boxW / 2} y={boxY} width={boxW} height={boxH} rx={2 * s} fill="#0f172a" stroke={color} strokeWidth={1} />
              <text x={cx} y={boxY + boxH / 2} textAnchor="middle" dominantBaseline="central" fill={color} fontSize={6 * s} fontWeight={600}>
                {isBuy ? 'BUY' : 'SELL'} ${priceStr}
              </text>
              {trade.date && <title>{(isBuy ? 'Buy' : 'Sell')} @ ${priceStr} ({trade.date})</title>}
            </g>
          );
        })}
    </g>
  );
}

function PriceBarsLayer({ data, chartType }: { data: PriceDataPoint[]; chartType: ChartType }) {
  const plotArea = usePlotArea();
  const yDomainRaw = useYAxisDomain('price');

  if (!plotArea || !yDomainRaw || !Array.isArray(yDomainRaw) || yDomainRaw.length < 2) return null;
  if (data.length === 0) return null;

  const yMin = Number(yDomainRaw[0]);
  const yMax = Number(yDomainRaw[yDomainRaw.length - 1]);
  if (!isFinite(yMin) || !isFinite(yMax) || yMax === yMin) return null;
  if (!isFinite(plotArea.x) || !isFinite(plotArea.y) || plotArea.width <= 0 || plotArea.height <= 0) return null;

  const yScale = (price: number) => plotArea.y + (1 - (price - yMin) / (yMax - yMin)) * plotArea.height;
  const n = data.length;
  const bandWidth = plotArea.width / n;
  const candleWidth = Math.max(3, Math.min(bandWidth * 0.7, 20));
  const isRounded = chartType === 'heikinAshi';

  return (
    <g>
      {data.map((d, i) => {
        const cx = plotArea.x + (i + 0.5) * bandWidth;
        const yHigh = yScale(d.high);
        const yLow = yScale(d.low);
        const yOpen = yScale(d.open);
        const yClose = yScale(d.close);
        // When open === close (Doji), use prior close so flat bars follow trend direction
        const prevClose = i > 0 ? data[i - 1].close : d.open;
        const bullish = d.close > d.open ? true : d.close < d.open ? false : d.close >= prevClose;
        const color = bullish ? BULL_COLOR : BEAR_COLOR;
        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));

        if (!isFinite(cx) || !isFinite(yHigh) || !isFinite(yLow) || !isFinite(yOpen) || !isFinite(yClose)) return null;

        if (chartType === 'ohlcBars') {
          const tickLen = candleWidth * 0.5;
          return (
            <g key={i}>
              <line x1={cx} y1={yHigh} x2={cx} y2={yLow} stroke={color} strokeWidth={1.5} />
              <line x1={cx - tickLen} y1={yOpen} x2={cx} y2={yOpen} stroke={color} strokeWidth={1.5} />
              <line x1={cx} y1={yClose} x2={cx + tickLen} y2={yClose} stroke={color} strokeWidth={1.5} />
            </g>
          );
        }

        if (chartType === 'hollowCandles') {
          return (
            <g key={i}>
              <line x1={cx} y1={yHigh} x2={cx} y2={yLow} stroke={color} strokeWidth={1} />
              <rect x={cx - candleWidth / 2} y={bodyTop} width={candleWidth} height={bodyHeight}
                fill={bullish ? 'transparent' : color} stroke={color} strokeWidth={bullish ? 1.5 : 0} rx={isRounded ? 2 : 0} />
            </g>
          );
        }

        return (
          <g key={i}>
            <line x1={cx} y1={yHigh} x2={cx} y2={yLow} stroke={color} strokeWidth={1} />
            <rect x={cx - candleWidth / 2} y={bodyTop} width={candleWidth} height={bodyHeight} fill={color} rx={isRounded ? 2 : 0} />
          </g>
        );
      })}
    </g>
  );
}

// Crosshair cursor

function CustomCursor({ points, width, height }: any) {
  if (!points || !points.length) return null;
  const x = points[0].x;
  const y = points[0].y;
  return (
    <g>
      <line x1={x} y1={0} x2={x} y2={height} stroke="#6b7280" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
      <line x1={0} y1={y} x2={width} y2={y} stroke="#6b7280" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
    </g>
  );
}

// TradingView-style tooltip

function TradingViewTooltip({ active, payload, interval, activeMAs, showPerfOverlay, showDrawdownOverlay, tc }: {
  active?: boolean; payload?: any[]; interval: string; activeMAs: ActiveMAs;
  showPerfOverlay?: boolean; showDrawdownOverlay?: boolean;
  tc: { tooltipBg: string; tooltipBorder: string; tooltipText: string; tooltipTextMuted: string };
}) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload as PriceDataPoint & { strategy_idx?: number | null; benchmark_idx?: number; drawdown_neg?: number | null };
  const barChange = d.close - d.open;
  const barChangePct = d.open !== 0 ? (barChange / d.open) * 100 : 0;
  const barPositive = barChange >= 0;

  let dateStr: string;
  if (isIntraday(interval) && d.date.length > 10) {
    const dateOnly = d.date.slice(0, 10);
    const time = d.date.slice(11);
    const dt = new Date(dateOnly);
    dateStr = `${dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} ${time}`;
  } else {
    dateStr = new Date(d.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  const fmt = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="rounded-lg shadow-xl p-3 text-xs font-mono backdrop-blur-sm min-w-[200px]" style={{ backgroundColor: tc.tooltipBg, borderWidth: 1, borderStyle: 'solid', borderColor: tc.tooltipBorder }}>
      <div className="mb-2 font-sans text-[11px]" style={{ color: tc.tooltipTextMuted }}>{dateStr}</div>
      <div className="flex items-center gap-3 mb-1.5">
        <span style={{ color: tc.tooltipTextMuted }}>O</span><span style={{ color: tc.tooltipText }}>{fmt(d.open)}</span>
        <span style={{ color: tc.tooltipTextMuted }}>H</span><span className="text-emerald-400">{fmt(d.high)}</span>
        <span style={{ color: tc.tooltipTextMuted }}>L</span><span className="text-red-400">{fmt(d.low)}</span>
        <span style={{ color: tc.tooltipTextMuted }}>C</span>
        <span className={`font-semibold ${barPositive ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(d.close)}</span>
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[11px] font-sans ${barPositive ? 'text-emerald-400' : 'text-red-400'}`}>
          {barPositive ? '+' : ''}{fmt(barChange)} ({barPositive ? '+' : ''}{barChangePct.toFixed(2)}%)
        </span>
      </div>
      <div className="flex items-center gap-2 font-sans text-[11px]" style={{ color: tc.tooltipTextMuted }}>
        <span>Vol</span>
        <span style={{ color: tc.tooltipText }}>
          {d.volume >= 1_000_000 ? `${(d.volume / 1_000_000).toFixed(2)}M` : d.volume >= 1_000 ? `${(d.volume / 1_000).toFixed(1)}K` : d.volume.toLocaleString()}
        </span>
      </div>
      {MA_OPTIONS.some((o) => activeMAs[o.key] && (d as any)[o.key] !== undefined) && (
        <div className="mt-1.5 pt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-sans text-[11px]" style={{ borderTop: `1px solid ${tc.tooltipBorder}` }}>
          {MA_OPTIONS.filter((o) => activeMAs[o.key] && (d as any)[o.key] !== undefined).map((o) => (
            <span key={o.key} style={{ color: o.color }}>{o.label}: {fmt((d as any)[o.key])}</span>
          ))}
        </div>
      )}
      <div className="mt-1.5 pt-1.5 flex items-center justify-between font-sans text-[11px]" style={{ borderTop: `1px solid ${tc.tooltipBorder}` }}>
        <span style={{ color: tc.tooltipTextMuted }}>Return</span>
        <span className={`font-semibold ${d.return >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {d.return >= 0 ? '+' : ''}{d.return}%
        </span>
      </div>
      {showPerfOverlay && (d.strategy_idx != null || d.benchmark_idx != null) && (
        <div className="mt-1.5 pt-1.5 space-y-1 font-sans text-[11px]" style={{ borderTop: `1px solid ${tc.tooltipBorder}` }}>
          {d.strategy_idx != null && (
            <div className="flex justify-between">
              <span style={{ color: tc.tooltipTextMuted }}>Strategy</span>
              <span className={d.strategy_idx >= 100 ? 'text-emerald-400' : 'text-red-400'}>
                {d.strategy_idx >= 100 ? '+' : ''}{(d.strategy_idx - 100).toFixed(1)}%
              </span>
            </div>
          )}
          {d.benchmark_idx != null && (
            <div className="flex justify-between">
              <span style={{ color: tc.tooltipTextMuted }}>Benchmark</span>
              <span className={d.benchmark_idx >= 100 ? 'text-gray-400' : 'text-gray-500'}>
                {d.benchmark_idx >= 100 ? '+' : ''}{(d.benchmark_idx - 100).toFixed(1)}%
              </span>
            </div>
          )}
          {d.strategy_idx != null && d.benchmark_idx != null && (
            <div className="flex justify-between">
              <span style={{ color: tc.tooltipTextMuted }}>Alpha</span>
              <span className={(d.strategy_idx - d.benchmark_idx) >= 0 ? 'text-emerald-400' : 'text-amber-400'}>
                {(d.strategy_idx - d.benchmark_idx) >= 0 ? '+' : ''}{(d.strategy_idx - d.benchmark_idx).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      )}
      {showDrawdownOverlay && d.drawdown_neg != null && (
        <div className="mt-1.5 pt-1.5 font-sans text-[11px]" style={{ borderTop: `1px solid ${tc.tooltipBorder}` }}>
          <div className="flex justify-between">
            <span style={{ color: tc.tooltipTextMuted }}>Drawdown</span>
            <span className="text-amber-400">{(-d.drawdown_neg).toFixed(2)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Trade marker style selector

function DotMarkerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" className="flex-shrink-0">
      <circle cx="7" cy="7" r="4" fill="currentColor" stroke="currentColor" strokeWidth={1} />
    </svg>
  );
}

function ProMarkerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" className="flex-shrink-0 scale-110 origin-center">
      <path d="M 7 2 L 11 12 L 3 12 Z" fill="currentColor" stroke="currentColor" strokeWidth={0.5} />
    </svg>
  );
}

function BoxMarkerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" className="flex-shrink-0">
      <rect x="2" y="2" width="10" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

const TRADE_MARKER_STYLES: { value: TradeMarkerStyle; label: string; icon: React.ReactNode }[] = [
  { value: 'none', label: 'None', icon: <CircleOff size={14} className="opacity-60" /> },
  { value: 'dot', label: 'Dot', icon: <DotMarkerIcon /> },
  { value: 'pro', label: 'Triangle', icon: <ProMarkerIcon /> },
  { value: 'box', label: 'Box', icon: <BoxMarkerIcon /> },
];

function TradeMarkerStyleSelector({ value, onChange, hasTrades, chartTheme }: { value: TradeMarkerStyle; onChange: (v: TradeMarkerStyle) => void; hasTrades: boolean; chartTheme: ChartTheme }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = TRADE_MARKER_STYLES.find((t) => t.value === value)!;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!hasTrades) return null;

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} title={`Markers: ${current.label}`}
        className={`flex items-center gap-1.5 h-7 px-2 rounded-md border transition-all text-[11px] ${chartTheme === 'light' ? 'border-gray-200 bg-white/90 hover:border-gray-300 text-gray-700' : 'border-gray-700 bg-gray-800/80 hover:border-gray-600 text-gray-300'}`}>
        <span className="text-gray-400 [&>svg]:w-3.5 [&>svg]:h-3.5">{current.icon}</span>
        <ChevronDown size={12} className={`text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={`absolute top-full left-0 mt-1 z-50 rounded-lg shadow-xl py-1 min-w-[140px] ${chartTheme === 'light' ? 'bg-white border border-gray-200' : 'bg-gray-900 border border-gray-700'}`}>
          {TRADE_MARKER_STYLES.map((opt) => (
            <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] transition-colors ${
                value === opt.value
                  ? chartTheme === 'light' ? 'bg-gray-100 text-gray-900' : 'bg-gray-800 text-white'
                  : chartTheme === 'light' ? 'text-gray-600 hover:bg-gray-50 hover:text-gray-900' : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
              }`}>
              <span className={`w-4 flex-shrink-0 flex items-center justify-center ${chartTheme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Chart type selector

function ChartTypeSelector({ value, onChange, chartTheme }: { value: ChartType; onChange: (ct: ChartType) => void; chartTheme: ChartTheme }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = CHART_TYPES.find((t) => t.value === value)!;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 h-7 px-2 rounded-md border transition-all text-[11px] ${chartTheme === 'light' ? 'border-gray-200 bg-white/90 hover:border-gray-300 text-gray-700' : 'border-gray-700 bg-gray-800/80 hover:border-gray-600 text-gray-300'}`}>
        <span className={chartTheme === 'light' ? 'text-gray-600' : 'text-gray-400'}>{current.icon}</span>
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown size={12} className={`text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={`absolute top-full left-0 mt-1 z-50 rounded-lg shadow-xl py-1 min-w-[160px] ${chartTheme === 'light' ? 'bg-white border border-gray-200' : 'bg-gray-900 border border-gray-700'}`}>
          {CHART_TYPES.map((ct) => (
            <button key={ct.value} onClick={() => { onChange(ct.value); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] transition-colors ${
                value === ct.value
                  ? chartTheme === 'light' ? 'bg-gray-100 text-gray-900' : 'bg-gray-800 text-white'
                  : chartTheme === 'light' ? 'text-gray-600 hover:bg-gray-50 hover:text-gray-900' : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
              }`}>
              <span className="w-4 flex-shrink-0">{ct.icon}</span>
              <span>{ct.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Charts dropdown (overlays + trade markers)

interface ChartsDropdownProps {
  hasEquity: boolean;
  hasBenchmark: boolean;
  hasDrawdown: boolean;
  showEquity: boolean; onEquityChange: (v: boolean) => void;
  showBenchmark: boolean; onBenchmarkChange: (v: boolean) => void;
  showDrawdown: boolean; onDrawdownChange: (v: boolean) => void;
  hasTrades: boolean;
  showEntries: boolean; onEntriesChange: (v: boolean) => void;
  showExits: boolean; onExitsChange: (v: boolean) => void;
  chartTheme: ChartTheme;
}

function ChartsDropdown({
  hasEquity, hasBenchmark, hasDrawdown,
  showEquity, onEquityChange,
  showBenchmark, onBenchmarkChange,
  showDrawdown, onDrawdownChange,
  hasTrades,
  showEntries, onEntriesChange,
  showExits, onExitsChange,
  chartTheme,
}: ChartsDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const activeCount = [
    hasEquity && showEquity,
    hasBenchmark && showBenchmark,
    hasDrawdown && showDrawdown,
    hasTrades && showEntries,
    hasTrades && showExits,
  ].filter(Boolean).length;

  const isDark = chartTheme === 'dark';
  const menuCls = isDark ? 'bg-gray-900 border-gray-700 text-gray-300' : 'bg-white border-gray-200 text-gray-700';
  const sectionCls = isDark ? 'text-gray-500' : 'text-gray-400';
  const itemHover = isDark ? 'hover:bg-gray-800/70 hover:text-gray-100' : 'hover:bg-gray-50 hover:text-gray-900';
  const sepCls = isDark ? 'border-gray-800' : 'border-gray-100';

  function CB({ on, color }: { on: boolean; color: string }) {
    return (
      <span className="w-3.5 h-3.5 flex-shrink-0 rounded-[3px] border flex items-center justify-center transition-colors"
        style={{ background: on ? color : 'transparent', borderColor: on ? color : isDark ? '#4b5563' : '#d1d5db' }}>
        {on && <svg width="8" height="8" viewBox="0 0 8 8"><polyline points="1,4 3,6 7,1.5" stroke="#fff" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </span>
    );
  }

  function ColorLine({ color, dashed }: { color: string; dashed?: boolean }) {
    return (
      <span className="w-4 h-0.5 rounded flex-shrink-0" style={{
        background: dashed ? 'none' : color,
        borderTop: dashed ? `2px dashed ${color}` : undefined,
        opacity: dashed ? 0.8 : 1,
      }} />
    );
  }

  function Badge({ label }: { label: string }) {
    return (
      <span className={`text-[10px] px-1.5 py-0 rounded font-mono ${isDark ? 'bg-gray-800 text-gray-500' : 'bg-gray-100 text-gray-400'}`}>{label}</span>
    );
  }

  function Item({ on, onToggle, color, dashed, label, badge, icon }: {
    on: boolean; onToggle: () => void; color: string; dashed?: boolean;
    label: string; badge?: string; icon?: React.ReactNode;
  }) {
    return (
      <button onClick={onToggle}
        className={`w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] rounded-md transition-colors gap-4 ${itemHover}`}>
        <span className="flex items-center gap-1.5 min-w-0">
          <CB on={on} color={color} />
          {icon ?? <ColorLine color={color} dashed={dashed} />}
          <span className="truncate">{label}</span>
        </span>
        {badge && <Badge label={badge} />}
      </button>
    );
  }

  const showSection = hasEquity || hasBenchmark || hasDrawdown || hasTrades;
  if (!showSection) return null;

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 h-7 px-2 rounded-md border transition-all text-[11px] ${
          isDark
            ? `border-gray-700 bg-gray-800/80 hover:border-gray-600 text-gray-300 ${open ? 'border-gray-600' : ''}`
            : `border-gray-200 bg-white/90 hover:border-gray-300 text-gray-700 ${open ? 'border-gray-300' : ''}`
        }`}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><polyline points="1,10 4,6 6.5,8 10,3 13,4" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span>Overlays</span>
        {activeCount > 0 && (
          <span className="text-[10px] px-1.5 py-0 rounded font-medium" style={{ background: isDark ? '#14532d' : '#dcfce7', color: isDark ? '#4ade80' : '#166534' }}>{activeCount}</span>
        )}
        <ChevronDown size={11} className={`text-gray-500 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={`absolute top-full right-0 mt-1.5 z-50 rounded-lg shadow-xl border min-w-[208px] p-1 ${menuCls}`}>
          {(hasEquity || hasBenchmark || hasDrawdown) && (
            <>
              <div className={`px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${sectionCls}`}>Performance</div>
              {hasEquity && <Item on={showEquity} onToggle={() => onEquityChange(!showEquity)} color="#1D9E75" label="Equity curve" badge="PnL" />}
              {hasBenchmark && <Item on={showBenchmark} onToggle={() => onBenchmarkChange(!showBenchmark)} color="#6366f1" dashed label="vs Benchmark" badge="rel" />}
              {hasDrawdown && <Item on={showDrawdown} onToggle={() => onDrawdownChange(!showDrawdown)} color="#e53935" label="Drawdown" badge="%" />}
            </>
          )}
          {hasTrades && (hasEquity || hasBenchmark || hasDrawdown) && <div className={`my-1 border-t ${sepCls}`} />}
          {hasTrades && (
            <>
              <div className={`px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${sectionCls}`}>Trade Markers</div>
              <Item on={showEntries} onToggle={() => onEntriesChange(!showEntries)} color="#1D9E75" label="Entry signals"
                icon={<svg width="10" height="10" viewBox="0 0 10 10" className="flex-shrink-0"><polygon points="5,1 9,9 1,9" fill="#1D9E75" /></svg>} />
              <Item on={showExits} onToggle={() => onExitsChange(!showExits)} color="#e53935" label="Exit signals"
                icon={<svg width="10" height="10" viewBox="0 0 10 10" className="flex-shrink-0"><polygon points="5,9 9,1 1,1" fill="#e53935" /></svg>} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// MA dropdown

const MA_OPTIONS = [
  { key: 'sma9'  as keyof ActiveMAs, label: 'SMA 9',   color: '#f59e0b', hint: 'scalp', section: 'sma' },
  { key: 'sma20' as keyof ActiveMAs, label: 'SMA 20',  color: '#10b981', hint: 'short', section: 'sma' },
  { key: 'sma50' as keyof ActiveMAs, label: 'SMA 50',  color: '#6366f1', hint: 'mid',   section: 'sma' },
  { key: 'sma100'as keyof ActiveMAs, label: 'SMA 100', color: '#0ea5e9', hint: '',       section: 'sma' },
  { key: 'sma200'as keyof ActiveMAs, label: 'SMA 200', color: '#e53935', hint: 'long',  section: 'sma' },
  { key: 'ema12' as keyof ActiveMAs, label: 'EMA 12',  color: '#f97316', hint: 'fast',  section: 'ema' },
  { key: 'ema26' as keyof ActiveMAs, label: 'EMA 26',  color: '#8b5cf6', hint: 'slow',  section: 'ema' },
  { key: 'ema50' as keyof ActiveMAs, label: 'EMA 50',  color: '#ec4899', hint: '',       section: 'ema' },
];

function MADropdown({ activeMAs, onChange, chartTheme }: { activeMAs: ActiveMAs; onChange: (v: ActiveMAs) => void; chartTheme: ChartTheme }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const activeCount = MA_OPTIONS.filter((o) => activeMAs[o.key]).length;
  const isDark = chartTheme === 'dark';
  const menuCls = isDark ? 'bg-gray-900 border-gray-700 text-gray-300' : 'bg-white border-gray-200 text-gray-700';
  const sectionCls = isDark ? 'text-gray-500' : 'text-gray-400';
  const itemHover = isDark ? 'hover:bg-gray-800/70 hover:text-gray-100' : 'hover:bg-gray-50 hover:text-gray-900';
  const sepCls = isDark ? 'border-gray-800' : 'border-gray-100';

  const toggle = (key: keyof ActiveMAs) => onChange({ ...activeMAs, [key]: !activeMAs[key] });

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 h-7 px-2 rounded-md border transition-all text-[11px] ${
          isDark
            ? `border-gray-700 bg-gray-800/80 hover:border-gray-600 text-gray-300 ${open ? 'border-gray-600' : ''}`
            : `border-gray-200 bg-white/90 hover:border-gray-300 text-gray-700 ${open ? 'border-gray-300' : ''}`
        }`}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><polyline points="1,10 3.5,6 6.5,7.5 9.5,4 13,5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span>Avgs</span>
        {activeCount > 0 && (
          <span className="text-[10px] px-1.5 py-0 rounded font-medium" style={{ background: isDark ? '#14532d' : '#dcfce7', color: isDark ? '#4ade80' : '#166534' }}>{activeCount}</span>
        )}
        <ChevronDown size={11} className={`text-gray-500 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={`absolute top-full right-0 mt-1.5 z-50 rounded-lg shadow-xl border min-w-[184px] p-1 ${menuCls}`}>
          <div className={`px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${sectionCls}`}>Simple (SMA)</div>
          {MA_OPTIONS.filter((o) => o.section === 'sma').map((opt) => {
            const on = activeMAs[opt.key];
            return (
              <button key={opt.key} onClick={() => toggle(opt.key)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] rounded-md transition-colors gap-4 ${itemHover}`}>
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 flex-shrink-0 rounded-[3px] border flex items-center justify-center transition-colors"
                    style={{ background: on ? opt.color : 'transparent', borderColor: on ? opt.color : isDark ? '#4b5563' : '#d1d5db' }}>
                    {on && <svg width="8" height="8" viewBox="0 0 8 8"><polyline points="1,4 3,6 7,1.5" stroke="#fff" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </span>
                  <span className="w-4 h-0.5 rounded flex-shrink-0" style={{ background: opt.color }} />
                  <span>{opt.label}</span>
                </span>
                {opt.hint && <span className={`text-[10px] font-mono ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>{opt.hint}</span>}
              </button>
            );
          })}
          <div className={`my-1 border-t ${sepCls}`} />
          <div className={`px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${sectionCls}`}>Exponential (EMA)</div>
          {MA_OPTIONS.filter((o) => o.section === 'ema').map((opt) => {
            const on = activeMAs[opt.key];
            return (
              <button key={opt.key} onClick={() => toggle(opt.key)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] rounded-md transition-colors gap-4 ${itemHover}`}>
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 flex-shrink-0 rounded-[3px] border flex items-center justify-center transition-colors"
                    style={{ background: on ? opt.color : 'transparent', borderColor: on ? opt.color : isDark ? '#4b5563' : '#d1d5db' }}>
                    {on && <svg width="8" height="8" viewBox="0 0 8 8"><polyline points="1,4 3,6 7,1.5" stroke="#fff" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </span>
                  <span className="w-4 h-0.5 rounded flex-shrink-0" style={{ background: opt.color }} />
                  <span>{opt.label}</span>
                </span>
                {opt.hint && <span className={`text-[10px] font-mono ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>{opt.hint}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Main component

const CHART_THEME_COLORS: Record<ChartTheme, { grid: string; axis: string; axisTick: string; volume: string; sessionBoundary: string; baseline: string; markerStroke: string; tooltipBg: string; tooltipBorder: string; tooltipText: string; tooltipTextMuted: string; controlBg: string; controlBorder: string; controlText: string; controlTextMuted: string }> = {
  dark: {
    grid: '#1f2937',
    axis: '#4b5563',
    axisTick: '#6b7280',
    volume: '#374151',
    sessionBoundary: '#374151',
    baseline: '#6b7280',
    markerStroke: '#0f172a',
    tooltipBg: 'rgba(17,24,39,0.95)',
    tooltipBorder: '#374151',
    tooltipText: '#f3f4f6',
    tooltipTextMuted: '#9ca3af',
    controlBg: 'rgba(17,24,39,0.95)',
    controlBorder: 'rgba(55,65,81,0.8)',
    controlText: '#d1d5db',
    controlTextMuted: '#9ca3af',
  },
  light: {
    grid: '#e5e7eb',
    axis: '#9ca3af',
    axisTick: '#6b7280',
    volume: '#d1d5db',
    sessionBoundary: '#d1d5db',
    baseline: '#6b7280',
    markerStroke: '#ffffff',
    tooltipBg: 'rgba(255,255,255,0.98)',
    tooltipBorder: '#e5e7eb',
    tooltipText: '#111827',
    tooltipTextMuted: '#6b7280',
    controlBg: 'rgba(255,255,255,0.98)',
    controlBorder: 'rgba(229,231,235,0.9)',
    controlText: '#374151',
    controlTextMuted: '#6b7280',
  },
};

export default function AssetChart({
  symbol,
  startDate,
  endDate,
  interval = '1d',
  trades = [],
  equityCurve,
  drawdownSeries,
  benchmarkReturn,
  chartTheme = 'dark',
}: AssetChartProps) {
  const tc = CHART_THEME_COLORS[chartTheme];
  const [activeMAs, setActiveMAs] = useState<ActiveMAs>(DEFAULT_ACTIVE_MAS);
  const [realData, setRealData] = useState<PriceDataPoint[] | null>(null);
  const [effectiveInterval, setEffectiveInterval] = useState<string | undefined>(undefined);
  const [dataLoading, setDataLoading] = useState(false);
  const [chartType, setChartType] = useState<ChartType>(() => getOptimalChartType(symbol));
  const [tradeMarkerStyle] = useState<TradeMarkerStyle>('pro');
  const [showEquityOverlay, setShowEquityOverlay] = useState(true);
  const [showBenchmarkOverlay, setShowBenchmarkOverlay] = useState(true);
  const [showDrawdownOverlay, setShowDrawdownOverlay] = useState(false);
  const [showEntrySignals, setShowEntrySignals] = useState(true);
  const [showExitSignals, setShowExitSignals] = useState(true);

  // Auto-switch chart type when symbol (asset) changes
  useEffect(() => {
    setChartType(getOptimalChartType(symbol));
  }, [symbol]);

  // Zoom/pan state : indices into the data array
  const [viewStart, setViewStart] = useState(0);
  const [viewEnd, setViewEnd] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const viewStartRef = useRef(0);
  const viewEndRef = useRef(0);
  const dataLenRef = useRef(0);

  const fetchKey = `${symbol}|${startDate}|${endDate}|${interval}`;

  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);
    api.getMarketData(symbol, startDate, endDate, interval)
      .then((res) => {
        if (cancelled) return;
        setEffectiveInterval(res.effective_interval);
        const basePrice = res.data[0]?.close ?? 100;
        const points: PriceDataPoint[] = res.data.map((d: any) => ({
          date: d.date, open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume,
          return: parseFloat((((d.close - basePrice) / basePrice) * 100).toFixed(2)),
        }));
        setRealData(addMovingAverages(points));
      })
      .catch(() => { if (!cancelled) setRealData(null); })
      .finally(() => { if (!cancelled) setDataLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey]);

  const fullData = useMemo(() => {
    if (realData && realData.length > 0) return realData;
    return [];
  }, [realData]);

  // Apply Heikin-Ashi transform on the full dataset
  const transformedData = useMemo(() => {
    if (chartType === 'heikinAshi') return computeHeikinAshi(fullData);
    return fullData;
  }, [fullData, chartType]);

  // Reset view when data changes
  useEffect(() => {
    setViewStart(0);
    setViewEnd(Math.max(0, transformedData.length - 1));
  }, [transformedData.length]);

  // Sync refs for use in non-passive event handlers
  useEffect(() => { viewStartRef.current = viewStart; }, [viewStart]);
  useEffect(() => { viewEndRef.current = viewEnd; }, [viewEnd]);
  useEffect(() => { dataLenRef.current = transformedData.length; }, [transformedData.length]);

  // Visible slice of data (controlled by brush / zoom / pan)
  const data = useMemo(() => {
    return transformedData.slice(viewStart, viewEnd + 1);
  }, [transformedData, viewStart, viewEnd]);

  // Merge overlay data: strategy (normalized to 100), benchmark, drawdown
  const hasPerfOverlay = Boolean(
    (showEquityOverlay && equityCurve?.length) || (showBenchmarkOverlay && benchmarkReturn != null)
  );
  const hasDrawdownOverlay = Boolean(showDrawdownOverlay && drawdownSeries?.length);
  const chartData = useMemo(() => {
    let out = data;
    const n = transformedData.length;
    const ec = equityCurve;
    const dd = drawdownSeries;

    if (hasPerfOverlay || hasDrawdownOverlay) {
      out = data.map((d, j) => {
        const i = viewStart + j;
        const row: Record<string, unknown> = { ...d };

        if (showEquityOverlay && ec?.length) {
          const eq = ec[Math.min(i, ec.length - 1)];
          const baseEquity = ec[0].equity;
          row.strategy_idx = baseEquity > 0 ? (eq.equity / baseEquity) * 100 : null;
        }
        if (showBenchmarkOverlay && benchmarkReturn != null) {
          const progress = n > 1 ? i / (n - 1) : 1;
          row.benchmark_idx = 100 * (1 + progress * (benchmarkReturn / 100));
        }
        if (showDrawdownOverlay && dd?.length) {
          const pt = dd[Math.min(i, dd.length - 1)];
          row.drawdown_neg = pt ? -pt.drawdown_pct : null;
        }
        return row as unknown as typeof d & { strategy_idx?: number | null; benchmark_idx?: number; drawdown_neg?: number | null };
      });
    }
    return out;
  }, [data, hasPerfOverlay, hasDrawdownOverlay, equityCurve, drawdownSeries, benchmarkReturn, showEquityOverlay, showBenchmarkOverlay, showDrawdownOverlay, viewStart, transformedData.length]);

  const perfDomain = useMemo(() => {
    if (!hasPerfOverlay || chartData.length === 0) return [0, 150];
    let min = 100;
    let max = 100;
    for (const d of chartData as (typeof chartData[0] & { strategy_idx?: number | null; benchmark_idx?: number })[]) {
      if (d.strategy_idx != null) { min = Math.min(min, d.strategy_idx); max = Math.max(max, d.strategy_idx); }
      if (d.benchmark_idx != null) { min = Math.min(min, d.benchmark_idx); max = Math.max(max, d.benchmark_idx); }
    }
    const pad = (max - min) * 0.1 || 5;
    return [Math.max(0, Math.floor(min - pad)), Math.ceil(max + pad)];
  }, [hasPerfOverlay, chartData]);

  const ddDomain = useMemo(() => {
    if (!hasDrawdownOverlay || chartData.length === 0) return [-50, 0];
    let min = 0;
    for (const d of chartData as (typeof chartData[0] & { drawdown_neg?: number | null })[]) {
      if (d.drawdown_neg != null) min = Math.min(min, d.drawdown_neg);
    }
    return [Math.min(min - 2, -5), 2];
  }, [hasDrawdownOverlay, chartData]);

  // ── Zoom / Pan handlers ──

  const zoomIn = useCallback(() => {
    const range = viewEndRef.current - viewStartRef.current;
    if (range <= 10) return;
    const shrink = Math.max(1, Math.floor(range * 0.15));
    setViewStart((s) => Math.min(s + shrink, viewEndRef.current - 10));
    setViewEnd((e) => Math.max(e - shrink, viewStartRef.current + 10));
  }, []);

  const zoomOut = useCallback(() => {
    const maxIdx = dataLenRef.current - 1;
    const range = viewEndRef.current - viewStartRef.current;
    const grow = Math.max(1, Math.floor(range * 0.2));
    setViewStart((s) => Math.max(0, s - grow));
    setViewEnd((e) => Math.min(maxIdx, e + grow));
  }, []);

  const resetZoom = useCallback(() => {
    setViewStart(0);
    setViewEnd(Math.max(0, dataLenRef.current - 1));
  }, []);

  // Mouse drag to pan
  const dragState = useRef<{ dragging: boolean; startX: number; origStart: number; origEnd: number }>({
    dragging: false, startX: 0, origStart: 0, origEnd: 0,
  });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragState.current = { dragging: true, startX: e.clientX, origStart: viewStartRef.current, origEnd: viewEndRef.current };
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState.current.dragging) return;
    const rect = chartWrapperRef.current?.getBoundingClientRect();
    if (!rect) return;

    const range = dragState.current.origEnd - dragState.current.origStart;
    const pixelDelta = e.clientX - dragState.current.startX;
    const indexDelta = Math.round((pixelDelta / rect.width) * range);
    const maxIdx = dataLenRef.current - 1;

    let newStart = dragState.current.origStart - indexDelta;
    let newEnd = dragState.current.origEnd - indexDelta;

    if (newStart < 0) { newEnd -= newStart; newStart = 0; }
    if (newEnd > maxIdx) { newStart -= (newEnd - maxIdx); newEnd = maxIdx; }
    newStart = Math.max(0, newStart);

    setViewStart(newStart);
    setViewEnd(newEnd);
  }, []);

  const handleMouseUp = useCallback(() => {
    dragState.current.dragging = false;
    setIsDragging(false);
  }, []);

  // ── Non-passive wheel handler (trackpad pinch + scroll + mouse wheel) ──
  useEffect(() => {
    const el = chartWrapperRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      const vs = viewStartRef.current;
      const ve = viewEndRef.current;
      const range = ve - vs;
      const maxIdx = dataLenRef.current - 1;
      if (maxIdx <= 0) return;

      const rect = el.getBoundingClientRect();
      const isPinch = e.ctrlKey || e.metaKey;
      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);
      const isHorizontalScroll = absX > absY * 1.5 && !isPinch;

      if (isHorizontalScroll) {
        // PAN : horizontal two-finger swipe on trackpad
        const panSensitivity = Math.max(1, range / rect.width * 3);
        const panDelta = Math.round(e.deltaX * panSensitivity);
        if (panDelta === 0) return;

        let newStart = vs + panDelta;
        let newEnd = ve + panDelta;
        if (newStart < 0) { newEnd -= newStart; newStart = 0; }
        if (newEnd > maxIdx) { newStart -= (newEnd - maxIdx); newEnd = maxIdx; }

        setViewStart(Math.max(0, newStart));
        setViewEnd(Math.min(maxIdx, newEnd));
      } else {
        // ZOOM : vertical scroll / pinch-to-zoom / mouse wheel
        if (absY < 0.5) return;

        const cursorPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        // Pinch sends small fractional deltas; mouse wheel sends ~100
        const sensitivity = isPinch ? 0.01 : 0.0015;
        const zoomAmount = Math.min(0.3, absY * sensitivity);
        const delta = Math.max(1, Math.round(range * zoomAmount));

        if (e.deltaY > 0) {
          const growLeft = Math.round(delta * cursorPct);
          const growRight = delta - growLeft;
          setViewStart(Math.max(0, vs - growLeft));
          setViewEnd(Math.min(maxIdx, ve + growRight));
        } else {
          if (range <= 10) return;
          const shrinkLeft = Math.round(delta * cursorPct);
          const shrinkRight = delta - shrinkLeft;
          setViewStart(Math.max(0, Math.min(vs + shrinkLeft, ve - 10)));
          setViewEnd(Math.min(maxIdx, Math.max(ve - shrinkRight, vs + 10)));
        }
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── Touch handler (mobile/tablet pinch-to-zoom + drag-to-pan) ──
  useEffect(() => {
    const el = chartWrapperRef.current;
    if (!el) return;

    let touchMode: 'none' | 'pan' | 'pinch' = 'none';
    let startTouch: Touch | null = null;
    let startDist = 0;
    let startVS = 0;
    let startVE = 0;

    const pinchDist = (a: Touch, b: Touch) => Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);

    const onTouchStart = (e: TouchEvent) => {
      startVS = viewStartRef.current;
      startVE = viewEndRef.current;
      if (e.touches.length === 2) {
        e.preventDefault();
        touchMode = 'pinch';
        startDist = pinchDist(e.touches[0], e.touches[1]);
      } else if (e.touches.length === 1) {
        touchMode = 'pan';
        startTouch = e.touches[0];
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const maxIdx = dataLenRef.current - 1;
      const rect = el.getBoundingClientRect();
      if (maxIdx <= 0) return;

      if (touchMode === 'pan' && e.touches.length === 1 && startTouch) {
        const dx = e.touches[0].clientX - startTouch.clientX;
        const range = startVE - startVS;
        const indexDelta = Math.round((dx / rect.width) * range);

        let newStart = startVS - indexDelta;
        let newEnd = startVE - indexDelta;
        if (newStart < 0) { newEnd -= newStart; newStart = 0; }
        if (newEnd > maxIdx) { newStart -= (newEnd - maxIdx); newEnd = maxIdx; }

        setViewStart(Math.max(0, newStart));
        setViewEnd(Math.min(maxIdx, newEnd));
      } else if (touchMode === 'pinch' && e.touches.length === 2) {
        e.preventDefault();
        const currentDist = pinchDist(e.touches[0], e.touches[1]);
        const scale = startDist / currentDist;
        const range = startVE - startVS;
        const newRange = Math.max(10, Math.min(maxIdx, Math.round(range * scale)));

        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const centerPct = Math.max(0, Math.min(1, (midX - rect.left) / rect.width));
        const center = startVS + Math.round(range * centerPct);

        let newStart = center - Math.round(newRange * centerPct);
        let newEnd = newStart + newRange;
        if (newStart < 0) { newEnd -= newStart; newStart = 0; }
        if (newEnd > maxIdx) { newStart -= (newEnd - maxIdx); newEnd = maxIdx; }

        setViewStart(Math.max(0, newStart));
        setViewEnd(Math.min(maxIdx, newEnd));
      }
    };

    const onTouchEnd = () => { touchMode = 'none'; startTouch = null; };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  // Computed chart values from visible data
  const priceChange = data.length > 1 ? data[data.length - 1].close - data[0].close : 0;
  const isPositive = priceChange >= 0;
  const minPrice = data.length > 0 ? Math.min(...data.map((d) => d.low)) : 0;
  const maxPrice = data.length > 0 ? Math.max(...data.map((d) => d.high)) : 0;
  const priceRange = maxPrice - minPrice;
  const maxVolume = data.length > 0 ? Math.max(...data.map((d) => d.volume)) : 0;

  const sessionBoundaries = useMemo(() => {
    if (!isIntraday(interval)) return [];
    return getSessionBoundaries(data);
  }, [data, interval]);

  const smartTickFormatter = useMemo(() => createSmartTickFormatter(interval, data), [interval, data]);

  // Smart tick selection: always includes day boundaries for intraday data
  const smartTicks = useMemo(() => {
    if (data.length === 0) return undefined;

    // Collect day-boundary indices
    const dayStartIndices: number[] = [];
    let prevDateStr = '';
    for (let i = 0; i < data.length; i++) {
      const dateOnly = data[i].date.slice(0, 10);
      if (dateOnly !== prevDateStr) {
        dayStartIndices.push(i);
        prevDateStr = dateOnly;
      }
    }

    if (isIntraday(interval)) {
      // Always include every day boundary, then fill time ticks between them
      const targetTotal = Math.min(20, data.length);
      const timeTickBudget = Math.max(0, targetTotal - dayStartIndices.length);
      const tickIndices = new Set<number>(dayStartIndices);

      if (timeTickBudget > 0 && data.length > dayStartIndices.length) {
        const step = Math.max(1, Math.floor(data.length / timeTickBudget));
        for (let i = 0; i < data.length; i += step) {
          tickIndices.add(i);
        }
      }
      tickIndices.add(data.length - 1);

      return Array.from(tickIndices).sort((a, b) => a - b).map((i) => data[i].date);
    }

    // Daily data: show all ticks when few, sample evenly otherwise
    if (data.length <= 30) return undefined;
    const step = Math.max(1, Math.floor(data.length / 15));
    const ticks: string[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i % step === 0 || i === data.length - 1 || dayStartIndices.includes(i)) {
        ticks.push(data[i].date);
      }
    }
    return ticks;
  }, [data, interval]);

  const lastClose = data.length > 0 ? data[data.length - 1].close : null;
  const lastBar = data.length > 0 ? data[data.length - 1] : null;

  const baselinePrice = data.length > 0 ? data[0].close : 0;
  const yDomainMin = minPrice - priceRange * 0.05;
  const yDomainMax = maxPrice + priceRange * 0.1;
  const baselinePct = priceRange > 0 ? ((yDomainMax - baselinePrice) / (yDomainMax - yDomainMin)) * 100 : 50;

  const isCandleType = chartType === 'candles' || chartType === 'hollowCandles' || chartType === 'ohlcBars' || chartType === 'heikinAshi';

  const isZoomed = viewStart > 0 || viewEnd < transformedData.length - 1;

  // Trade markers
  const tradeMarkers = useMemo(() => {
    if (!trades.length || !fullData.length) return [];
    const allDates = fullData.map((d) => d.date);
    const visibleDates = new Set(data.map((d) => d.date));
    return trades.map((trade) => {
      let matchDate = allDates.find((d) => d === trade.date);
      if (!matchDate) {
        let minDist = Infinity;
        const tradeTime = new Date(trade.date).getTime();
        for (const d of allDates) {
          const dist = Math.abs(new Date(d).getTime() - tradeTime);
          if (dist < minDist) { minDist = dist; matchDate = d; }
        }
      }
      if (!matchDate || !visibleDates.has(matchDate)) return null;
      return { ...trade, date: matchDate, price: trade.price };
    }).filter(Boolean) as TradeMarker[];
  }, [trades, fullData, data]);

  return (
    <div className={`h-full w-full flex flex-col min-h-0 ${chartTheme === 'light' ? 'bg-gray-50' : 'bg-gray-950'}`} data-testid="asset-chart">
      {/* ═══════════ Chart Area (full height, pan/zoom target) ═══════════ */}
      <div
        ref={chartWrapperRef}
        className="flex-1 relative min-h-[200px] w-full"
        style={{ cursor: isDragging ? 'grabbing' : 'crosshair', touchAction: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* TradingView-style floating toolbar - top right */}
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div className="absolute top-3 right-4 z-20 flex items-center gap-1.5 flex-wrap justify-end pointer-events-auto" onMouseDown={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1 rounded-lg border backdrop-blur-sm px-1.5 py-1 shadow-lg" style={{ borderColor: tc.controlBorder, backgroundColor: tc.controlBg }} data-testid="chart-controls">
            {/* Chart type dropdown */}
            <ChartTypeSelector value={chartType} onChange={setChartType} chartTheme={chartTheme} />
            {/* Overlays dropdown — only shown when there is overlay data available */}
            {(Boolean(equityCurve?.length) || benchmarkReturn != null || Boolean(drawdownSeries?.length) || tradeMarkers.length > 0) && (
              <>
                <div className={`h-4 w-px self-center mx-0.5 ${chartTheme === 'light' ? 'bg-gray-200' : 'bg-gray-700/60'}`} aria-hidden />
                <ChartsDropdown
                  hasEquity={Boolean(equityCurve?.length)}
                  hasBenchmark={benchmarkReturn != null}
                  hasDrawdown={Boolean(drawdownSeries?.length)}
                  showEquity={showEquityOverlay} onEquityChange={setShowEquityOverlay}
                  showBenchmark={showBenchmarkOverlay} onBenchmarkChange={setShowBenchmarkOverlay}
                  showDrawdown={showDrawdownOverlay} onDrawdownChange={setShowDrawdownOverlay}
                  hasTrades={tradeMarkers.length > 0}
                  showEntries={showEntrySignals} onEntriesChange={setShowEntrySignals}
                  showExits={showExitSignals} onExitsChange={setShowExitSignals}
                  chartTheme={chartTheme}
                />
              </>
            )}
            {/* Separator */}
            <div className={`h-4 w-px self-center mx-0.5 ${chartTheme === 'light' ? 'bg-gray-200' : 'bg-gray-700/60'}`} aria-hidden />
            {/* Avgs dropdown */}
            <MADropdown activeMAs={activeMAs} onChange={setActiveMAs} chartTheme={chartTheme} />
            {/* Separator */}
            <div className={`h-4 w-px self-center mx-0.5 ${chartTheme === 'light' ? 'bg-gray-200' : 'bg-gray-700/60'}`} aria-hidden />
            {/* Zoom In */}
            <button onClick={zoomIn} title="Zoom In" className={`h-7 w-7 flex items-center justify-center rounded transition-colors ${chartTheme === 'light' ? 'text-gray-500 hover:text-gray-800 hover:bg-gray-100' : 'text-gray-500 hover:text-gray-200 hover:bg-gray-800/60'}`}>
              <ZoomIn size={14} />
            </button>
            {/* Zoom Out */}
            <button onClick={zoomOut} title="Zoom Out" className={`h-7 w-7 flex items-center justify-center rounded transition-colors ${chartTheme === 'light' ? 'text-gray-500 hover:text-gray-800 hover:bg-gray-100' : 'text-gray-500 hover:text-gray-200 hover:bg-gray-800/60'}`}>
              <ZoomOut size={14} />
            </button>
            {isZoomed && (
              <button onClick={resetZoom} title="Reset Zoom" className={`h-7 w-7 flex items-center justify-center rounded transition-colors ${chartTheme === 'light' ? 'text-gray-500 hover:text-gray-800 hover:bg-gray-100' : 'text-gray-500 hover:text-gray-200 hover:bg-gray-800/60'}`}>
                <Maximize2 size={14} />
              </button>
            )}
            {isZoomed && <span className={`text-[10px] px-0.5 ${chartTheme === 'light' ? 'text-gray-600' : 'text-gray-500'}`}>{data.length}/{transformedData.length}</span>}
          </div>
          {dataLoading && <span className={`text-[10px] animate-pulse px-2 py-0.5 rounded ${chartTheme === 'light' ? 'text-gray-600 bg-white/80' : 'text-gray-500 bg-gray-900/80'}`}>Loading…</span>}
          {!realData && !dataLoading && data.length === 0 && <span className={`text-[10px] text-amber-500/90 px-2 py-0.5 rounded ${chartTheme === 'light' ? 'bg-white/80' : 'bg-gray-900/80'}`}>No data</span>}
        </div>

        {/* Placeholder when no real data - never show mock */}
        {!realData && (
          <div className={`absolute inset-0 flex items-center justify-center rounded-lg z-10 ${chartTheme === 'light' ? 'bg-white/70' : 'bg-gray-900/50'}`}>
            <p className={`text-sm ${chartTheme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
              {dataLoading ? 'Loading real market data…' : 'No data available — check symbol and date range'}
            </p>
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%" minHeight={200}>
          <ComposedChart data={chartData} margin={{ top: 20, right: 4, left: 10, bottom: 20 }}>
            <defs>
              <filter id="trade-buy-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor={BUY_GLOW} floodOpacity="0.7" />
              </filter>
              <filter id="trade-sell-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor={SELL_GLOW} floodOpacity="0.7" />
              </filter>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isPositive ? '#10b981' : '#ef4444'} stopOpacity={0.2} />
                <stop offset="100%" stopColor={isPositive ? '#10b981' : '#ef4444'} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="baselineFillGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
                <stop offset={`${baselinePct}%`} stopColor="#10b981" stopOpacity={0.15} />
                <stop offset={`${baselinePct}%`} stopColor="#ef4444" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.15} />
              </linearGradient>
              <linearGradient id="baselineStrokeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset={`${baselinePct}%`} stopColor="#10b981" />
                <stop offset={`${baselinePct}%`} stopColor="#ef4444" />
                <stop offset="100%" stopColor="#ef4444" />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke={tc.grid} vertical={isIntraday(interval)} />

            {sessionBoundaries.map((boundary) => (
              <ReferenceLine key={`session-${boundary}`} x={boundary} stroke={tc.sessionBoundary} strokeWidth={1.5} strokeDasharray="6 4" yAxisId="price" />
            ))}

            <XAxis dataKey="date" stroke={tc.axis} fontSize={10} tickLine={false} axisLine={{ stroke: tc.grid }}
              tickFormatter={smartTickFormatter} ticks={smartTicks} minTickGap={25} tick={{ fill: tc.axisTick }} />
            <YAxis yAxisId="price" stroke={tc.axis} fontSize={10} tickLine={false} axisLine={false}
              domain={[yDomainMin, yDomainMax]}
              tickFormatter={(v: number) => {
                if (v >= 10000) return `${(v / 1000).toFixed(1)}k`;
                if (v >= 1000) return `${(v / 1000).toFixed(2)}k`;
                return v.toFixed(v >= 100 ? 0 : 2);
              }}
              width={55} tick={{ fill: tc.axisTick }} />
            <YAxis yAxisId="volume" orientation="right" domain={[0, maxVolume * 4]} hide width={0} />
            {/* Always-rendered right axes — fixed width keeps plot area stable when toggling overlays */}
            <YAxis yAxisId="perf" orientation="right" fontSize={9} tickLine={false}
              axisLine={hasPerfOverlay ? { stroke: hasDrawdownOverlay ? '#10b98140' : tc.sessionBoundary } : false}
              domain={perfDomain}
              tickFormatter={(v: number) => hasPerfOverlay ? `${v >= 100 ? '+' : ''}${(v - 100).toFixed(0)}%` : ''}
              width={44}
              tick={hasPerfOverlay ? { fill: hasDrawdownOverlay ? '#10b981' : '#6b7280' } : false} />
            <YAxis yAxisId="dd" orientation="right" fontSize={9} tickLine={false}
              axisLine={hasDrawdownOverlay ? { stroke: hasPerfOverlay ? '#f59e0b60' : tc.sessionBoundary } : false}
              domain={ddDomain}
              tickFormatter={(v: number) => hasDrawdownOverlay ? `${v}%` : ''}
              width={44}
              tick={hasDrawdownOverlay ? { fill: '#f59e0b' } : false} />

            <Tooltip content={(props: any) => <TradingViewTooltip {...props} interval={interval} activeMAs={activeMAs} showPerfOverlay={hasPerfOverlay} showDrawdownOverlay={hasDrawdownOverlay} tc={tc} />}
              cursor={<CustomCursor />} isAnimationActive={false} />

            {data.length > 0 && (
              <ReferenceLine yAxisId="price" y={data[0].close} stroke={tc.axis} strokeDasharray="3 3" strokeOpacity={0.3} />
            )}

            {lastClose !== null && (
              <ReferenceLine yAxisId="price" y={lastClose}
                stroke={isPositive ? '#10b981' : '#ef4444'} strokeDasharray="2 2" strokeOpacity={0.7}
                label={{ value: `$${lastClose >= 1000 ? (lastClose / 1000).toFixed(2) + 'k' : lastClose.toFixed(2)}`,
                  position: 'right', fill: isPositive ? '#10b981' : '#ef4444', fontSize: 10, fontWeight: 600 }} />
            )}

            <Bar yAxisId="volume" dataKey="volume" fill={tc.volume} opacity={0.4} isAnimationActive={false}
              shape={(props: any) => {
                const { x, y, width, height, payload } = props;
                if (!isFinite(x) || !isFinite(y) || !isFinite(width) || !isFinite(height)) return null;
                const clr = payload.close >= payload.open ? `${BULL_COLOR}40` : `${BEAR_COLOR}40`;
                return <rect x={x} y={y} width={width} height={height} fill={clr} />;
              }} />

            {chartType === 'area' && (
              <Area yAxisId="price" type="monotone" dataKey="close" stroke={isPositive ? '#10b981' : '#ef4444'}
                strokeWidth={1.5} fill="url(#priceGradient)" isAnimationActive={false} />
            )}
            {chartType === 'line' && (
              <Line yAxisId="price" type="monotone" dataKey="close" stroke={isPositive ? '#10b981' : '#ef4444'}
                strokeWidth={1.5} dot={false} isAnimationActive={false} />
            )}
            {chartType === 'baseline' && (
              <>
                <Area yAxisId="price" type="monotone" dataKey="close" stroke="url(#baselineStrokeGradient)"
                  strokeWidth={1.5} fill="url(#baselineFillGradient)" isAnimationActive={false} />
                <ReferenceLine yAxisId="price" y={baselinePrice} stroke={tc.baseline} strokeDasharray="4 4" strokeOpacity={0.6}
                  label={{ value: `Baseline $${baselinePrice >= 1000 ? (baselinePrice / 1000).toFixed(2) + 'k' : baselinePrice.toFixed(2)}`,
                    position: 'insideTopRight', fill: tc.baseline, fontSize: 9 }} />
              </>
            )}

            {isCandleType && <PriceBarsLayer data={data} chartType={chartType} />}
            {isCandleType && (
              <Area yAxisId="price" type="monotone" dataKey="close" stroke="transparent" fill="transparent"
                activeDot={false} isAnimationActive={false} />
            )}

            {MA_OPTIONS.filter((o) => activeMAs[o.key]).map((o) => (
              <Line key={o.key} yAxisId="price" type="monotone" dataKey={o.key} stroke={o.color} strokeWidth={1.2} dot={false} connectNulls isAnimationActive={false} />
            ))}

            {hasPerfOverlay && (
              <>
                {showEquityOverlay && equityCurve?.length && (
                  <Line yAxisId="perf" type="monotone" dataKey="strategy_idx" stroke="#10b981" strokeWidth={1.5}
                    dot={false} connectNulls isAnimationActive={false} strokeOpacity={0.9} />
                )}
                {showBenchmarkOverlay && benchmarkReturn != null && (
                  <Line yAxisId="perf" type="monotone" dataKey="benchmark_idx" stroke="#6b7280" strokeWidth={1.5}
                    strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={false} strokeOpacity={0.8} />
                )}
              </>
            )}
            {hasDrawdownOverlay && (
              <Line yAxisId="dd" type="monotone" dataKey="drawdown_neg" stroke="#f59e0b" strokeWidth={1.5}
                dot={false} connectNulls isAnimationActive={false} strokeOpacity={0.9} />
            )}

            {tradeMarkers.length > 0 && isCandleType && (showEntrySignals || showExitSignals) && (
              <TradeMarkersLayer
                trades={tradeMarkers.filter((t) =>
                  (t.type === 'buy' && showEntrySignals) || (t.type === 'sell' && showExitSignals)
                )}
                data={data}
                scale={Math.max(1.2, Math.min(2.2, 180 / data.length))}
                style={tradeMarkerStyle}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>

        {/* ═══════════ Top-Left OHLCV Info Bar + Legend ═══════════ */}
        {lastBar && (
          <div className="absolute top-5 left-16 flex flex-col gap-1 pointer-events-none">
            {/* OHLCV row */}
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="text-gray-300 font-sans font-semibold text-xs">{symbol}</span>
              <span className="text-gray-500 font-sans uppercase">
                {effectiveInterval && effectiveInterval !== interval
                  ? (effectiveInterval === '1wk' ? 'Weekly' : effectiveInterval === '1mo' ? 'Monthly' : effectiveInterval)
                  : interval}
              </span>
              {chartType === 'heikinAshi' && <span className="text-amber-500/70 font-sans text-[10px]">HA</span>}
              <span className="text-gray-500">O</span><span className="text-gray-300">{lastBar.open.toFixed(2)}</span>
              <span className="text-gray-500">H</span><span style={{ color: BULL_COLOR }}>{lastBar.high.toFixed(2)}</span>
              <span className="text-gray-500">L</span><span style={{ color: BEAR_COLOR }}>{lastBar.low.toFixed(2)}</span>
              <span className="text-gray-500">C</span>
              <span className="font-semibold" style={{ color: isPositive ? BULL_COLOR : BEAR_COLOR }}>{lastBar.close.toFixed(2)}</span>
              <span className="font-sans text-[10px] px-1.5 py-0.5 rounded"
                style={{ backgroundColor: isPositive ? `${BULL_COLOR}20` : `${BEAR_COLOR}20`, color: isPositive ? BULL_COLOR : BEAR_COLOR }}>
                {isPositive ? '+' : ''}{priceChange.toFixed(2)} ({isPositive ? '+' : ''}{data[0]?.close ? ((priceChange / data[0].close) * 100).toFixed(2) : '0.00'}%)
              </span>
            </div>
            {/* Legend row — only when there's something to show */}
            {(MA_OPTIONS.some((o) => activeMAs[o.key]) || hasPerfOverlay || hasDrawdownOverlay) && (
              <div className="flex items-center gap-3 text-[11px] flex-wrap">
                {MA_OPTIONS.filter((o) => activeMAs[o.key]).map((o) => (
                  <div key={o.key} className="flex items-center gap-1.5">
                    <div className="w-3.5 h-[2px] rounded flex-shrink-0" style={{ background: o.color }} />
                    <span className="font-mono" style={{ color: o.color + 'cc' }}>
                      {o.label}{(lastBar as any)?.[o.key] ? `: ${((lastBar as any)[o.key] as number).toFixed(2)}` : ''}
                    </span>
                  </div>
                ))}
                {hasPerfOverlay && equityCurve?.length && showEquityOverlay && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3.5 h-[2px] bg-emerald-500 rounded flex-shrink-0" />
                    <span className="text-emerald-400/80 font-mono">Equity</span>
                  </div>
                )}
                {showBenchmarkOverlay && benchmarkReturn != null && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3.5 h-0 border-t border-dashed border-gray-500 flex-shrink-0" />
                    <span className="text-gray-400/80 font-mono">Benchmark</span>
                  </div>
                )}
                {hasDrawdownOverlay && drawdownSeries?.length && showDrawdownOverlay && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3.5 h-[2px] bg-amber-500 rounded flex-shrink-0" />
                    <span className="text-amber-400/80 font-mono">DD</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
