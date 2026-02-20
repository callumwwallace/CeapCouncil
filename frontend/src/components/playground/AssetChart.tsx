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
import { ChevronDown, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import api from '@/lib/api';

// ============================================================================
// Type Exports
// ============================================================================

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

export interface AssetChartProps {
  symbol: string;
  startDate: string;
  endDate: string;
  interval?: string;
  showIndicators?: { ma20: boolean; ma50: boolean };
  onIndicatorsChange?: (indicators: { ma20: boolean; ma50: boolean }) => void;
  trades?: TradeMarker[];
}

export interface PriceDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  return: number;
  ma20?: number;
  ma50?: number;
}

// ============================================================================
// Chart Type Definitions & Icons
// ============================================================================

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

// ============================================================================
// Interval & Helpers
// ============================================================================

function isIntraday(interval: string): boolean {
  return interval !== '1d';
}

function isCryptoSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase();
  return s.includes('-USD') || s.includes('BTC') || s.includes('ETH') ||
    s.includes('SOL') || s.includes('DOGE') || s.includes('ADA') ||
    s.includes('XRP') || s.includes('USDT') || s.includes('BNB');
}

function intervalToMinutes(interval: string): number {
  switch (interval) {
    case '1m': return 1;
    case '5m': return 5;
    case '15m': return 15;
    case '1h': return 60;
    default: return 24 * 60;
  }
}

// ============================================================================
// Smart X-Axis Tick Formatter (TradingView-style)
// ============================================================================

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

// ============================================================================
// Session Boundaries (for intraday dividers)
// ============================================================================

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

// ============================================================================
// Heikin-Ashi Data Transformation
// ============================================================================

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

// ============================================================================
// Fallback Mock Data Generator
// ============================================================================

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function generateMockPriceData(symbol: string, startDate: string, endDate: string, interval: string = '1d'): PriceDataPoint[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const seed = hashString(`${symbol}-${startDate}-${endDate}-${interval}`);
  const random = seededRandom(seed);
  const basePrices: Record<string, number> = {
    'AAPL': 150, 'MSFT': 320, 'GOOGL': 120, 'AMZN': 140, 'TSLA': 180,
    'SPY': 450, 'QQQ': 380, 'BTC-USD': 40000, 'ETH-USD': 2200,
  };
  const basePrice = basePrices[symbol] || 100;
  const isDailyInterval = interval === '1d';
  const isCrypto = isCryptoSymbol(symbol);
  const stepMinutes = intervalToMinutes(interval);
  const dailyVol = isCrypto ? 0.04 : 0.015;
  const tradingHoursPerDay = isCrypto ? 24 : 6.5;
  const barsPerDay = isDailyInterval ? 1 : (tradingHoursPerDay * 60) / stepMinutes;
  const volatility = isDailyInterval ? dailyVol : dailyVol / Math.sqrt(barsPerDay);
  const data: PriceDataPoint[] = [];
  let price = basePrice;

  if (isDailyInterval) {
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    for (let i = 0; i <= days; i++) {
      const date = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const dow = date.getDay();
      if (!isCrypto && (dow === 0 || dow === 6)) continue;
      const change = (random() - 0.48) * volatility * price;
      price = Math.max(price * 0.5, price + change);
      const open = price * (1 + (random() - 0.5) * 0.01);
      const high = Math.max(price, open) * (1 + random() * 0.02);
      const low = Math.min(price, open) * (1 - random() * 0.02);
      const volume = Math.floor(random() * 10000000) + 1000000;
      data.push({
        date: date.toISOString().split('T')[0],
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(price.toFixed(2)),
        volume,
        return: parseFloat((((price - basePrice) / basePrice) * 100).toFixed(2)),
      });
    }
  } else {
    const current = new Date(start);
    while (current <= end) {
      const dow = current.getDay();
      if (!isCrypto && (dow === 0 || dow === 6)) { current.setDate(current.getDate() + 1); continue; }

      const dayStart = new Date(current);
      const dayEnd = new Date(current);
      if (isCrypto) {
        dayStart.setHours(0, 0, 0, 0);
        dayEnd.setHours(23, 59, 0, 0);
      } else {
        dayStart.setHours(9, 30, 0, 0);
        dayEnd.setHours(16, 0, 0, 0);
      }

      const bar = new Date(dayStart);
      const intradaySpread = isCrypto ? 0.006 : 0.008;
      const intradayWick = isCrypto ? 0.004 : 0.005;
      while (bar < dayEnd) {
        const change = (random() - 0.48) * volatility * price;
        price = Math.max(price * 0.5, price + change);
        const open = price * (1 + (random() - 0.5) * intradaySpread);
        const high = Math.max(price, open) * (1 + random() * intradayWick);
        const low = Math.min(price, open) * (1 - random() * intradayWick);
        const volume = Math.floor(random() * 2000000) + 100000;
        const hh = bar.getHours().toString().padStart(2, '0');
        const mm = bar.getMinutes().toString().padStart(2, '0');
        data.push({
          date: `${bar.toISOString().split('T')[0]} ${hh}:${mm}`,
          open: parseFloat(open.toFixed(2)), high: parseFloat(high.toFixed(2)),
          low: parseFloat(low.toFixed(2)), close: parseFloat(price.toFixed(2)),
          volume, return: parseFloat((((price - basePrice) / basePrice) * 100).toFixed(2)),
        });
        bar.setMinutes(bar.getMinutes() + stepMinutes);
      }
      current.setDate(current.getDate() + 1);
    }
  }

  return aggregateOHLC(data, 300);
}

// Properly merge N bars into one OHLC candle (preserves true high/low range)
function aggregateOHLC(data: PriceDataPoint[], maxBars: number): PriceDataPoint[] {
  if (data.length <= maxBars) return data;

  const groupSize = Math.ceil(data.length / maxBars);
  const result: PriceDataPoint[] = [];

  for (let i = 0; i < data.length; i += groupSize) {
    const group = data.slice(i, Math.min(i + groupSize, data.length));
    if (group.length === 0) continue;

    const first = group[0];
    const last = group[group.length - 1];

    result.push({
      date: first.date,
      open: first.open,
      high: Math.max(...group.map((d) => d.high)),
      low: Math.min(...group.map((d) => d.low)),
      close: last.close,
      volume: group.reduce((sum, d) => sum + d.volume, 0),
      return: last.return,
    });
  }

  return result;
}

// Exported for tests
export function generatePriceData(symbol: string, startDate: string, endDate: string, interval: string = '1d'): PriceDataPoint[] {
  return addMovingAverages(generateMockPriceData(symbol, startDate, endDate, interval));
}

// ============================================================================
// Moving Averages
// ============================================================================

function addMovingAverages(data: PriceDataPoint[]): PriceDataPoint[] {
  for (let i = 0; i < data.length; i++) {
    if (i >= 19) {
      const sum20 = data.slice(i - 19, i + 1).reduce((acc, d) => acc + d.close, 0);
      data[i].ma20 = parseFloat((sum20 / 20).toFixed(2));
    }
    if (i >= 49) {
      const sum50 = data.slice(i - 49, i + 1).reduce((acc, d) => acc + d.close, 0);
      data[i].ma50 = parseFloat((sum50 / 50).toFixed(2));
    }
  }
  return data;
}

// ============================================================================
// Price Bars Layer (Candlestick / Hollow / OHLC)
// ============================================================================

const BULL_COLOR = '#26a69a';
const BEAR_COLOR = '#ef5350';

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
        const bullish = d.close >= d.open;
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

// ============================================================================
// Crosshair Cursor
// ============================================================================

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

// ============================================================================
// TradingView-Style Tooltip
// ============================================================================

function TradingViewTooltip({ active, payload, interval, activeIndicators }: {
  active?: boolean; payload?: any[]; interval: string; activeIndicators: { ma20: boolean; ma50: boolean };
}) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload as PriceDataPoint;
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
    <div className="bg-gray-900/95 border border-gray-700 rounded-lg shadow-xl p-3 text-xs font-mono backdrop-blur-sm min-w-[200px]">
      <div className="text-gray-400 mb-2 font-sans text-[11px]">{dateStr}</div>
      <div className="flex items-center gap-3 mb-1.5">
        <span className="text-gray-500">O</span><span className="text-gray-100">{fmt(d.open)}</span>
        <span className="text-gray-500">H</span><span className="text-emerald-400">{fmt(d.high)}</span>
        <span className="text-gray-500">L</span><span className="text-red-400">{fmt(d.low)}</span>
        <span className="text-gray-500">C</span>
        <span className={`font-semibold ${barPositive ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(d.close)}</span>
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[11px] font-sans ${barPositive ? 'text-emerald-400' : 'text-red-400'}`}>
          {barPositive ? '+' : ''}{fmt(barChange)} ({barPositive ? '+' : ''}{barChangePct.toFixed(2)}%)
        </span>
      </div>
      <div className="flex items-center gap-2 text-gray-400 font-sans text-[11px]">
        <span>Vol</span>
        <span className="text-gray-200">
          {d.volume >= 1_000_000 ? `${(d.volume / 1_000_000).toFixed(2)}M` : d.volume >= 1_000 ? `${(d.volume / 1_000).toFixed(1)}K` : d.volume.toLocaleString()}
        </span>
      </div>
      {(activeIndicators.ma20 || activeIndicators.ma50) && (
        <div className="mt-1.5 pt-1.5 border-t border-gray-700/50 flex gap-3 font-sans text-[11px]">
          {d.ma20 !== undefined && activeIndicators.ma20 && <span className="text-blue-400">MA20: {fmt(d.ma20)}</span>}
          {d.ma50 !== undefined && activeIndicators.ma50 && <span className="text-orange-400">MA50: {fmt(d.ma50)}</span>}
        </div>
      )}
      <div className="mt-1.5 pt-1.5 border-t border-gray-700/50 flex items-center justify-between font-sans text-[11px]">
        <span className="text-gray-500">Return</span>
        <span className={`font-semibold ${d.return >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {d.return >= 0 ? '+' : ''}{d.return}%
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Chart Type Selector Dropdown
// ============================================================================

function ChartTypeSelector({ value, onChange }: { value: ChartType; onChange: (ct: ChartType) => void }) {
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
        className="flex items-center gap-1.5 px-2 py-1 rounded bg-gray-800 border border-gray-700 hover:border-gray-600 transition-all text-[11px] text-gray-300">
        <span className="text-gray-400">{current.icon}</span>
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown size={12} className={`text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[160px]">
          {CHART_TYPES.map((ct) => (
            <button key={ct.value} onClick={() => { onChange(ct.value); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] transition-colors ${
                value === ct.value ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
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

// ============================================================================
// Main Component
// ============================================================================

export default function AssetChart({
  symbol,
  startDate,
  endDate,
  interval = '1d',
  showIndicators = { ma20: false, ma50: false },
  onIndicatorsChange,
  trades = [],
}: AssetChartProps) {
  const [internalIndicators, setInternalIndicators] = useState(showIndicators);
  const [realData, setRealData] = useState<PriceDataPoint[] | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [chartType, setChartType] = useState<ChartType>('candles');

  // Zoom/pan state : indices into the data array
  const [viewStart, setViewStart] = useState(0);
  const [viewEnd, setViewEnd] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const viewStartRef = useRef(0);
  const viewEndRef = useRef(0);
  const dataLenRef = useRef(0);

  const activeIndicators = onIndicatorsChange ? showIndicators : internalIndicators;

  const handleIndicatorToggle = (indicator: 'ma20' | 'ma50') => {
    const newIndicators = { ...activeIndicators, [indicator]: !activeIndicators[indicator] };
    if (onIndicatorsChange) onIndicatorsChange(newIndicators);
    else setInternalIndicators(newIndicators);
  };

  const fetchKey = `${symbol}|${startDate}|${endDate}|${interval}`;

  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);
    api.getMarketData(symbol, startDate, endDate, interval)
      .then((res) => {
        if (cancelled) return;
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
    if (realData) return realData;
    return addMovingAverages(generateMockPriceData(symbol, startDate, endDate, interval));
  }, [realData, symbol, startDate, endDate, interval]);

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
    <div className="h-full w-full flex flex-col bg-gray-950" data-testid="asset-chart">
      {/* ═══════════ Controls Bar ═══════════ */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800 bg-gray-900/80">
        <div className="flex items-center gap-1" data-testid="timeframe-selector">
          <ChartTypeSelector value={chartType} onChange={setChartType} />

          <div className="w-px h-5 bg-gray-700 mx-1.5" />

          {/* Interval badge */}
          <div className="px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-[10px] text-gray-400 font-medium uppercase tracking-wide">
            {interval}
          </div>

          <div className="w-px h-5 bg-gray-700 mx-1.5" />

          {/* Zoom controls */}
          <button onClick={zoomIn} title="Zoom In"
            className="p-1 rounded text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors">
            <ZoomIn size={14} />
          </button>
          <button onClick={zoomOut} title="Zoom Out"
            className="p-1 rounded text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors">
            <ZoomOut size={14} />
          </button>
          {isZoomed && (
            <button onClick={resetZoom} title="Reset Zoom"
              className="p-1 rounded text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors">
              <Maximize2 size={14} />
            </button>
          )}
          {isZoomed && (
            <span className="text-[10px] text-gray-500 ml-1">
              {data.length}/{transformedData.length} bars
            </span>
          )}
        </div>

        <div className="flex items-center gap-2" data-testid="indicator-toggles">
          {dataLoading && <span className="text-[11px] text-gray-500 mr-2 animate-pulse">Loading...</span>}
          {!realData && !dataLoading && <span className="text-[11px] text-amber-500/80 mr-2">Mock data</span>}
          <button onClick={() => handleIndicatorToggle('ma20')}
            className={`px-2 py-0.5 text-[11px] font-medium rounded border transition-all ${
              activeIndicators.ma20
                ? 'bg-blue-900/40 border-blue-700/60 text-blue-400'
                : 'bg-transparent border-gray-700/50 text-gray-500 hover:border-gray-600 hover:text-gray-400'
            }`} data-testid="indicator-ma20">MA20</button>
          <button onClick={() => handleIndicatorToggle('ma50')}
            className={`px-2 py-0.5 text-[11px] font-medium rounded border transition-all ${
              activeIndicators.ma50
                ? 'bg-orange-900/40 border-orange-700/60 text-orange-400'
                : 'bg-transparent border-gray-700/50 text-gray-500 hover:border-gray-600 hover:text-gray-400'
            }`} data-testid="indicator-ma50">MA50</button>
        </div>
      </div>

      {/* ═══════════ Chart Area (pan/zoom target) ═══════════ */}
      <div
        ref={chartWrapperRef}
        className="flex-1 relative min-h-0"
        style={{ cursor: isDragging ? 'grabbing' : 'crosshair', touchAction: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 20, right: 70, left: 10, bottom: 20 }}>
            <defs>
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

            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={isIntraday(interval)} />

            {sessionBoundaries.map((boundary) => (
              <ReferenceLine key={`session-${boundary}`} x={boundary} stroke="#374151" strokeWidth={1.5} strokeDasharray="6 4" yAxisId="price" />
            ))}

            <XAxis dataKey="date" stroke="#4b5563" fontSize={10} tickLine={false} axisLine={{ stroke: '#1f2937' }}
              tickFormatter={smartTickFormatter} ticks={smartTicks} minTickGap={25} tick={{ fill: '#6b7280' }} />
            <YAxis yAxisId="price" stroke="#4b5563" fontSize={10} tickLine={false} axisLine={false}
              domain={[yDomainMin, yDomainMax]}
              tickFormatter={(v: number) => {
                if (v >= 10000) return `${(v / 1000).toFixed(1)}k`;
                if (v >= 1000) return `${(v / 1000).toFixed(2)}k`;
                return v.toFixed(v >= 100 ? 0 : 2);
              }}
              width={55} tick={{ fill: '#6b7280' }} />
            <YAxis yAxisId="volume" orientation="right" domain={[0, maxVolume * 4]} hide />

            <Tooltip content={(props: any) => <TradingViewTooltip {...props} interval={interval} activeIndicators={activeIndicators} />}
              cursor={<CustomCursor />} isAnimationActive={false} />

            {data.length > 0 && (
              <ReferenceLine yAxisId="price" y={data[0].close} stroke="#9ca3af" strokeDasharray="3 3" strokeOpacity={0.3} />
            )}

            {lastClose !== null && (
              <ReferenceLine yAxisId="price" y={lastClose}
                stroke={isPositive ? '#10b981' : '#ef4444'} strokeDasharray="2 2" strokeOpacity={0.7}
                label={{ value: `$${lastClose >= 1000 ? (lastClose / 1000).toFixed(2) + 'k' : lastClose.toFixed(2)}`,
                  position: 'right', fill: isPositive ? '#10b981' : '#ef4444', fontSize: 10, fontWeight: 600 }} />
            )}

            <Bar yAxisId="volume" dataKey="volume" fill="#374151" opacity={0.4} isAnimationActive={false}
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
                <ReferenceLine yAxisId="price" y={baselinePrice} stroke="#6b7280" strokeDasharray="4 4" strokeOpacity={0.6}
                  label={{ value: `Baseline $${baselinePrice >= 1000 ? (baselinePrice / 1000).toFixed(2) + 'k' : baselinePrice.toFixed(2)}`,
                    position: 'insideTopRight', fill: '#6b7280', fontSize: 9 }} />
              </>
            )}

            {isCandleType && <PriceBarsLayer data={data} chartType={chartType} />}
            {isCandleType && (
              <Area yAxisId="price" type="monotone" dataKey="close" stroke="transparent" fill="transparent"
                activeDot={false} isAnimationActive={false} />
            )}

            {activeIndicators.ma20 && (
              <Line yAxisId="price" type="monotone" dataKey="ma20" stroke="#3b82f6" strokeWidth={1} dot={false} connectNulls isAnimationActive={false} />
            )}
            {activeIndicators.ma50 && (
              <Line yAxisId="price" type="monotone" dataKey="ma50" stroke="#f97316" strokeWidth={1} dot={false} connectNulls isAnimationActive={false} />
            )}

            {tradeMarkers.map((trade, index) => (
              <ReferenceDot key={`trade-${index}`} yAxisId="price" x={trade.date} y={trade.price} r={5}
                fill={trade.type === 'buy' ? '#10b981' : '#ef4444'} stroke={trade.type === 'buy' ? '#065f46' : '#7f1d1d'} strokeWidth={1.5} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>

        {/* ═══════════ Top-Left OHLCV Info Bar ═══════════ */}
        {lastBar && (
          <div className="absolute top-5 left-16 flex items-center gap-3 text-[11px] font-mono pointer-events-none">
            <span className="text-gray-300 font-sans font-semibold text-xs">{symbol}</span>
            <span className="text-gray-500 font-sans uppercase">{interval}</span>
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
        )}

        {(activeIndicators.ma20 || activeIndicators.ma50) && (
          <div className="absolute bottom-10 left-16 flex items-center gap-3 text-[11px] pointer-events-none">
            {activeIndicators.ma20 && (
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-[2px] bg-blue-500 rounded" />
                <span className="text-blue-400/80 font-mono">MA20{lastBar?.ma20 ? `: ${lastBar.ma20.toFixed(2)}` : ''}</span>
              </div>
            )}
            {activeIndicators.ma50 && (
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-[2px] bg-orange-500 rounded" />
                <span className="text-orange-400/80 font-mono">MA50{lastBar?.ma50 ? `: ${lastBar.ma50.toFixed(2)}` : ''}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
