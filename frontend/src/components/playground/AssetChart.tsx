'use client';

import { useMemo, useState, useEffect } from 'react';
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
} from 'recharts';
import api from '@/lib/api';

export type Timeframe = '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';

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
  timeframe?: Timeframe;
  onTimeframeChange?: (tf: Timeframe) => void;
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

// ---------------------------------------------------------------------------
// Fallback mock data generator (only used when API fails)
// ---------------------------------------------------------------------------
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
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

function generateMockPriceData(symbol: string, startDate: string, endDate: string): PriceDataPoint[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const seed = hashString(`${symbol}-${startDate}-${endDate}`);
  const random = seededRandom(seed);
  const basePrices: Record<string, number> = {
    'AAPL': 150, 'MSFT': 320, 'GOOGL': 120, 'AMZN': 140, 'TSLA': 180,
    'SPY': 450, 'QQQ': 380, 'BTC-USD': 40000, 'ETH-USD': 2200,
  };
  const basePrice = basePrices[symbol] || 100;
  const volatility = symbol.includes('BTC') || symbol.includes('ETH') ? 0.04 : 0.015;
  const data: PriceDataPoint[] = [];
  let price = basePrice;
  for (let i = 0; i <= days; i++) {
    const date = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
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
  const sampleRate = Math.max(1, Math.floor(data.length / 200));
  return data.filter((_, i) => i % sampleRate === 0 || i === data.length - 1);
}

// ---------------------------------------------------------------------------
// Add moving averages to data
// ---------------------------------------------------------------------------
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

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: '1W', label: '1W' },
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: '1Y', label: '1Y' },
  { value: 'ALL', label: 'All' },
];

export default function AssetChart({ 
  symbol, 
  startDate, 
  endDate,
  interval = '1d',
  timeframe = 'ALL',
  onTimeframeChange,
  showIndicators = { ma20: false, ma50: false },
  onIndicatorsChange,
  trades = [],
}: AssetChartProps) {
  // Default to ALL so the full backtest range is visible with all trade markers
  const [internalTimeframe, setInternalTimeframe] = useState<Timeframe>('ALL');
  const [internalIndicators, setInternalIndicators] = useState(showIndicators);
  const [realData, setRealData] = useState<PriceDataPoint[] | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  
  const activeTimeframe = onTimeframeChange ? timeframe : internalTimeframe;
  const activeIndicators = onIndicatorsChange ? showIndicators : internalIndicators;
  
  const handleTimeframeChange = (tf: Timeframe) => {
    if (onTimeframeChange) onTimeframeChange(tf);
    else setInternalTimeframe(tf);
  };
  
  const handleIndicatorToggle = (indicator: 'ma20' | 'ma50') => {
    const newIndicators = { ...activeIndicators, [indicator]: !activeIndicators[indicator] };
    if (onIndicatorsChange) onIndicatorsChange(newIndicators);
    else setInternalIndicators(newIndicators);
  };

  // Stable key that triggers refetch when any data param changes
  const fetchKey = `${symbol}|${startDate}|${endDate}|${interval}`;

  // Fetch real market data from backend
  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);

    api.getMarketData(symbol, startDate, endDate, interval)
      .then((res) => {
        if (cancelled) return;
        const basePrice = res.data[0]?.close ?? 100;
        const points: PriceDataPoint[] = res.data.map((d) => ({
          date: d.date,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: d.volume,
          return: parseFloat((((d.close - basePrice) / basePrice) * 100).toFixed(2)),
        }));
        setRealData(addMovingAverages(points));
      })
      .catch(() => {
        if (!cancelled) setRealData(null); // will fall back to mock
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey]);
  
  // Calculate effective date range based on timeframe
  const effectiveDateRange = useMemo(() => {
    const end = new Date(endDate);
    let start = new Date(startDate);
    switch (activeTimeframe) {
      case '1W': start = new Date(end.getTime() - 7 * 86400000); break;
      case '1M': start = new Date(end.getTime() - 30 * 86400000); break;
      case '3M': start = new Date(end.getTime() - 90 * 86400000); break;
      case '6M': start = new Date(end.getTime() - 180 * 86400000); break;
      case '1Y': start = new Date(end.getTime() - 365 * 86400000); break;
      case 'ALL': default: start = new Date(startDate);
    }
    const originalStart = new Date(startDate);
    if (start < originalStart) start = originalStart;
    return { start: start.toISOString().split('T')[0], end: endDate };
  }, [activeTimeframe, startDate, endDate]);

  // Use real data if available, otherwise generate mock data
  const fullData = useMemo(() => {
    if (realData) return realData;
    return addMovingAverages(generateMockPriceData(symbol, startDate, endDate));
  }, [realData, symbol, startDate, endDate]);

  // Filter data by timeframe
  const data = useMemo(() => {
    return fullData.filter(
      (d) => d.date >= effectiveDateRange.start && d.date <= effectiveDateRange.end
    );
  }, [fullData, effectiveDateRange]);

  const priceChange = data.length > 1 ? data[data.length - 1].close - data[0].close : 0;
  const isPositive = priceChange >= 0;
  const minPrice = Math.min(...data.map(d => d.low));
  const maxPrice = Math.max(...data.map(d => d.high));
  const priceRange = maxPrice - minPrice;
  const maxVolume = Math.max(...data.map(d => d.volume));
  
  // Map trades to chart — match against FULL data for correct dates,
  // then only show markers that fall within the visible timeframe window.
  const tradeMarkers = useMemo(() => {
    if (!trades.length || !fullData.length) return [];

    // Build lookup from the full (unfiltered) dataset
    const allDates = fullData.map(d => d.date);
    // The visible date window (from timeframe filter)
    const visibleDates = new Set(data.map(d => d.date));

    return trades.map(trade => {
      // Try exact match against the full dataset
      let matchDate = allDates.find(d => d === trade.date);

      // If no exact match, find the nearest date in the full dataset
      if (!matchDate) {
        let minDist = Infinity;
        const tradeTime = new Date(trade.date).getTime();
        for (const d of allDates) {
          const dist = Math.abs(new Date(d).getTime() - tradeTime);
          if (dist < minDist) {
            minDist = dist;
            matchDate = d;
          }
        }
      }

      if (!matchDate) return null;

      // Only show if the matched date is within the visible timeframe window
      if (!visibleDates.has(matchDate)) return null;

      return {
        ...trade,
        date: matchDate, // use the chart's date so ReferenceDot can find the x position
        price: trade.price,
      };
    }).filter(Boolean) as TradeMarker[];
  }, [trades, fullData, data]);

  return (
    <div className="h-full w-full flex flex-col bg-gray-950" data-testid="asset-chart">
      {/* Controls Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-1" data-testid="timeframe-selector">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => handleTimeframeChange(tf.value)}
              className={`px-3 py-1 text-xs font-medium rounded transition ${
                activeTimeframe === tf.value
                  ? 'bg-emerald-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`}
              data-testid={`timeframe-${tf.value}`}
            >
              {tf.label}
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-2" data-testid="indicator-toggles">
          {dataLoading && (
            <span className="text-xs text-gray-500 mr-2 animate-pulse">Loading market data...</span>
          )}
          {!realData && !dataLoading && (
            <span className="text-xs text-amber-500 mr-2">Mock data (API unavailable)</span>
          )}
          <span className="text-xs text-gray-500 mr-1">Indicators:</span>
          <button
            onClick={() => handleIndicatorToggle('ma20')}
            className={`px-2 py-1 text-xs font-medium rounded border transition ${
              activeIndicators.ma20
                ? 'bg-blue-900/50 border-blue-700 text-blue-400'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
            }`}
            data-testid="indicator-ma20"
          >
            MA20
          </button>
          <button
            onClick={() => handleIndicatorToggle('ma50')}
            className={`px-2 py-1 text-xs font-medium rounded border transition ${
              activeIndicators.ma50
                ? 'bg-orange-900/50 border-orange-700 text-orange-400'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
            }`}
            data-testid="indicator-ma50"
          >
            MA50
          </button>
        </div>
      </div>
      
      {/* Chart Area */}
      <div className="flex-1 relative min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart 
            data={data} 
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          >
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop 
                  offset="0%" 
                  stopColor={isPositive ? '#10b981' : '#ef4444'} 
                  stopOpacity={0.3}
                />
                <stop 
                  offset="100%" 
                  stopColor={isPositive ? '#10b981' : '#ef4444'} 
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="#1f2937" 
              vertical={false}
            />
            
            <XAxis 
              dataKey="date" 
              stroke="#6b7280"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#374151' }}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              }}
              interval="preserveStartEnd"
              minTickGap={50}
            />
            
            <YAxis 
              yAxisId="price"
              stroke="#6b7280"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              domain={[minPrice - priceRange * 0.1, maxPrice + priceRange * 0.1]}
              tickFormatter={(value) => {
                if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
                return `$${value.toFixed(0)}`;
              }}
              width={60}
            />
            
            <YAxis 
              yAxisId="volume"
              orientation="right"
              stroke="#6b7280"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              domain={[0, maxVolume * 4]}
              hide
            />
            
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload as PriceDataPoint;
                  return (
                    <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-lg p-3 text-sm">
                      <div className="text-gray-400 text-xs mb-2">
                        {new Date(d.date).toLocaleDateString('en-US', { 
                          weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
                        })}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <div className="text-gray-400">Open</div>
                        <div className="font-medium text-right text-gray-100">${d.open.toLocaleString()}</div>
                        <div className="text-gray-400">High</div>
                        <div className="font-medium text-right text-emerald-400">${d.high.toLocaleString()}</div>
                        <div className="text-gray-400">Low</div>
                        <div className="font-medium text-right text-red-400">${d.low.toLocaleString()}</div>
                        <div className="text-gray-400">Close</div>
                        <div className="font-semibold text-right text-gray-100">${d.close.toLocaleString()}</div>
                        <div className="text-gray-400">Volume</div>
                        <div className="font-medium text-right text-gray-100">{(d.volume / 1000000).toFixed(1)}M</div>
                        {d.ma20 && activeIndicators.ma20 && (
                          <>
                            <div className="text-blue-400">MA20</div>
                            <div className="font-medium text-right text-blue-400">${d.ma20.toLocaleString()}</div>
                          </>
                        )}
                        {d.ma50 && activeIndicators.ma50 && (
                          <>
                            <div className="text-orange-400">MA50</div>
                            <div className="font-medium text-right text-orange-400">${d.ma50.toLocaleString()}</div>
                          </>
                        )}
                      </div>
                      <div className="mt-2 pt-2 border-t border-gray-700 flex justify-between">
                        <span className="text-gray-400">Return</span>
                        <span className={`font-semibold ${d.return >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {d.return >= 0 ? '+' : ''}{d.return}%
                        </span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            
            {data.length > 0 && (
              <ReferenceLine 
                yAxisId="price"
                y={data[0].close} 
                stroke="#9ca3af" 
                strokeDasharray="3 3"
                strokeOpacity={0.5}
              />
            )}
            
            <Bar
              yAxisId="volume"
              dataKey="volume"
              fill="#374151"
              opacity={0.5}
            />
            
            <Area
              yAxisId="price"
              type="monotone"
              dataKey="close"
              stroke={isPositive ? '#10b981' : '#ef4444'}
              strokeWidth={2}
              fill="url(#priceGradient)"
              animationDuration={1000}
            />
            
            {activeIndicators.ma20 && (
              <Line
                yAxisId="price"
                type="monotone"
                dataKey="ma20"
                stroke="#3b82f6"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            )}
            
            {activeIndicators.ma50 && (
              <Line
                yAxisId="price"
                type="monotone"
                dataKey="ma50"
                stroke="#f97316"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            )}
            
            {/* Trade Markers */}
            {tradeMarkers.map((trade, index) => (
              <ReferenceDot
                key={`trade-${index}`}
                yAxisId="price"
                x={trade.date}
                y={trade.price}
                r={6}
                fill={trade.type === 'buy' ? '#10b981' : '#ef4444'}
                stroke="#fff"
                strokeWidth={2}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
        
        {/* Price Stats Overlay */}
        {data.length > 0 && (
          <div className="absolute top-4 right-4 bg-gray-900/90 backdrop-blur-sm rounded-lg border border-gray-700 p-3 text-sm">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <div className="text-gray-400">Open</div>
              <div className="font-medium text-right text-gray-100">${data[0].close.toLocaleString()}</div>
              <div className="text-gray-400">Current</div>
              <div className="font-semibold text-right text-gray-100">${data[data.length - 1].close.toLocaleString()}</div>
              <div className="text-gray-400">High</div>
              <div className="font-medium text-right text-emerald-400">${maxPrice.toLocaleString()}</div>
              <div className="text-gray-400">Low</div>
              <div className="font-medium text-right text-red-400">${minPrice.toLocaleString()}</div>
            </div>
          </div>
        )}
        
        {(activeIndicators.ma20 || activeIndicators.ma50) && (
          <div className="absolute bottom-4 left-4 flex items-center gap-3 bg-gray-900/90 backdrop-blur-sm rounded-lg border border-gray-700 px-3 py-1.5 text-xs">
            {activeIndicators.ma20 && (
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-0.5 bg-blue-500"></div>
                <span className="text-gray-300">MA20</span>
              </div>
            )}
            {activeIndicators.ma50 && (
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-0.5 bg-orange-500"></div>
                <span className="text-gray-300">MA50</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
