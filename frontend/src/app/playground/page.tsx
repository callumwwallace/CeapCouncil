'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Play, 
  Save, 
  RotateCcw, 
  Loader2, 
  BarChart3, 
  TrendingUp,
  TrendingDown,
  Calendar,
  DollarSign,
  ChevronDown,
  Activity,
  Target,
  FileCode,
  Percent,
  Scale,
  PanelLeftClose,
  PanelRightClose,
} from 'lucide-react';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import CodeEditor from '@/components/playground/CodeEditor';
import AssetChart, { TradeMarker } from '@/components/playground/AssetChart';
import ErrorBoundary from '@/components/ErrorBoundary';
import TradeLog from '@/components/playground/TradeLog';
import StatusBar from '@/components/playground/StatusBar';
import api from '@/lib/api';
import type { BacktestTrade, EquityCurvePoint, DrawdownPoint } from '@/types';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

// Strategy Templates
const STRATEGY_TEMPLATES = {
  sma_crossover: {
    name: 'SMA Crossover',
    description: 'Buy when fast MA crosses above slow MA',
    code: `# SMA Crossover Strategy
import backtrader as bt

class MyStrategy(bt.Strategy):
    """
    Simple Moving Average Crossover
    Buy when fast MA > slow MA, sell when fast MA < slow MA
    """
    params = (('fast', 10), ('slow', 30))

    def __init__(self):
        self.fast_ma = bt.ind.SMA(period=self.p.fast)
        self.slow_ma = bt.ind.SMA(period=self.p.slow)
        self.crossover = bt.ind.CrossOver(self.fast_ma, self.slow_ma)

    def next(self):
        if not self.position and self.crossover > 0:
            self.buy()
        elif self.position and self.crossover < 0:
            self.sell()
`,
  },
  mean_reversion: {
    name: 'Mean Reversion',
    description: 'Buy oversold, sell overbought using Bollinger Bands',
    code: `# Mean Reversion Strategy
import backtrader as bt

class MyStrategy(bt.Strategy):
    """
    Mean Reversion using Bollinger Bands
    Buy when price touches lower band, sell at middle band
    """
    params = (('period', 20), ('devfactor', 2.0))

    def __init__(self):
        self.boll = bt.ind.BollingerBands(period=self.p.period, devfactor=self.p.devfactor)

    def next(self):
        if not self.position:
            if self.data.close[0] < self.boll.lines.bot[0]:
                self.buy()
        else:
            if self.data.close[0] > self.boll.lines.mid[0]:
                self.sell()
`,
  },
  momentum: {
    name: 'Momentum',
    description: 'Follow the trend using Rate of Change',
    code: `# Momentum Strategy
import backtrader as bt

class MyStrategy(bt.Strategy):
    """
    Momentum Strategy using Rate of Change
    Buy when momentum is positive, sell when negative
    """
    params = (('period', 14), ('threshold', 5))

    def __init__(self):
        self.roc = bt.ind.ROC(period=self.p.period)

    def next(self):
        if not self.position:
            if self.roc[0] > self.p.threshold:
                self.buy()
        else:
            if self.roc[0] < -self.p.threshold:
                self.sell()
`,
  },
  rsi_strategy: {
    name: 'RSI Strategy',
    description: 'Buy oversold (RSI<30), sell overbought (RSI>70)',
    code: `# RSI Strategy
import backtrader as bt

class MyStrategy(bt.Strategy):
    """
    RSI Overbought/Oversold Strategy
    Buy when RSI < 30 (oversold), sell when RSI > 70 (overbought)
    """
    params = (('period', 14), ('oversold', 30), ('overbought', 70))

    def __init__(self):
        self.rsi = bt.ind.RSI(period=self.p.period)

    def next(self):
        if not self.position:
            if self.rsi[0] < self.p.oversold:
                self.buy()
        else:
            if self.rsi[0] > self.p.overbought:
                self.sell()
`,
  },
  macd_strategy: {
    name: 'MACD Strategy',
    description: 'Trade MACD crossovers with signal line',
    code: `# MACD Strategy
import backtrader as bt

class MyStrategy(bt.Strategy):
    """
    MACD Crossover Strategy
    Buy when MACD crosses above signal, sell when below
    """
    params = (('fast', 12), ('slow', 26), ('signal', 9))

    def __init__(self):
        self.macd = bt.ind.MACD(
            period_me1=self.p.fast,
            period_me2=self.p.slow,
            period_signal=self.p.signal
        )
        self.crossover = bt.ind.CrossOver(self.macd.macd, self.macd.signal)

    def next(self):
        if not self.position and self.crossover > 0:
            self.buy()
        elif self.position and self.crossover < 0:
            self.sell()
`,
  },
  breakout: {
    name: 'Donchian Breakout',
    description: 'Buy breakout above highest high, sell below lowest low',
    code: `# Donchian Channel Breakout Strategy
import backtrader as bt

class MyStrategy(bt.Strategy):
    """
    Donchian Channel Breakout
    Buy when price breaks above the N-period high
    Sell when price drops below the N-period low
    """
    params = (('period', 20), ('exit_period', 10))

    def __init__(self):
        self.highest = bt.ind.Highest(self.data.high, period=self.p.period)
        self.lowest = bt.ind.Lowest(self.data.low, period=self.p.exit_period)

    def next(self):
        if not self.position:
            if self.data.close[0] > self.highest[-1]:
                self.buy()
        else:
            if self.data.close[0] < self.lowest[-1]:
                self.sell()
`,
  },
  vwap_reversion: {
    name: 'VWAP Reversion',
    description: 'Mean reversion to volume-weighted average price',
    code: `# VWAP Mean Reversion Strategy
import backtrader as bt

class MyStrategy(bt.Strategy):
    """
    VWAP Mean Reversion
    Approximates VWAP using typical price * volume SMA
    Buys when price is N std devs below VWAP, sells at VWAP
    """
    params = (('period', 20), ('num_std', 2.0))

    def __init__(self):
        typical = (self.data.high + self.data.low + self.data.close) / 3
        self.vwap = bt.ind.SMA(typical, period=self.p.period)
        self.std = bt.ind.StdDev(typical, period=self.p.period)

    def next(self):
        if not self.position:
            if self.data.close[0] < self.vwap[0] - self.p.num_std * self.std[0]:
                self.buy()
        else:
            if self.data.close[0] > self.vwap[0]:
                self.sell()
`,
  },
  dual_momentum: {
    name: 'Dual Momentum',
    description: 'Combine absolute and relative momentum signals',
    code: `# Dual Momentum Strategy
import backtrader as bt

class MyStrategy(bt.Strategy):
    """
    Dual Momentum
    Buy when both absolute momentum (ROC > 0) and
    relative momentum (ROC > threshold) are positive
    """
    params = (('lookback', 90), ('threshold', 2.0))

    def __init__(self):
        self.roc = bt.ind.ROC(self.data.close, period=self.p.lookback)
        self.sma = bt.ind.SMA(self.data.close, period=self.p.lookback)

    def next(self):
        abs_mom = self.roc[0] > 0
        rel_mom = self.roc[0] > self.p.threshold
        if not self.position:
            if abs_mom and rel_mom:
                self.buy()
        else:
            if not abs_mom:
                self.sell()
`,
  },
  turtle_trading: {
    name: 'Turtle Trading',
    description: 'Classic turtle system with channel breakouts and ATR sizing',
    code: `# Turtle Trading Strategy
import backtrader as bt

class MyStrategy(bt.Strategy):
    """
    Turtle Trading System
    Entry: N-period high breakout
    Exit: Shorter period low breakout
    Uses ATR for volatility awareness
    """
    params = (('entry_period', 20), ('exit_period', 10), ('atr_period', 14))

    def __init__(self):
        self.highest = bt.ind.Highest(self.data.high, period=self.p.entry_period)
        self.lowest = bt.ind.Lowest(self.data.low, period=self.p.exit_period)
        self.atr = bt.ind.ATR(period=self.p.atr_period)

    def next(self):
        if not self.position:
            if self.data.close[0] > self.highest[-1]:
                # Size based on ATR (risk 1% of equity per ATR)
                risk = self.broker.getvalue() * 0.01
                if self.atr[0] > 0:
                    size = int(risk / self.atr[0])
                    if size > 0:
                        self.buy(size=size)
        else:
            if self.data.close[0] < self.lowest[-1]:
                self.close()
`,
  },
  bollinger_squeeze: {
    name: 'Bollinger Squeeze',
    description: 'Trade volatility contraction breakouts',
    code: `# Bollinger Squeeze Strategy
import backtrader as bt

class MyStrategy(bt.Strategy):
    """
    Bollinger Squeeze (Volatility Breakout)
    Detects when Bollinger Bands narrow inside Keltner Channels
    Enters on the breakout direction
    """
    params = (('bb_period', 20), ('kc_period', 20), ('kc_mult', 1.5))

    def __init__(self):
        self.boll = bt.ind.BollingerBands(period=self.p.bb_period)
        self.atr = bt.ind.ATR(period=self.p.kc_period)
        ema = bt.ind.EMA(period=self.p.kc_period)
        self.kc_upper = ema + self.atr * self.p.kc_mult
        self.kc_lower = ema - self.atr * self.p.kc_mult
        self.mom = bt.ind.ROC(period=12)

    def next(self):
        squeeze = self.boll.bot[0] > self.kc_lower[0] and self.boll.top[0] < self.kc_upper[0]
        if not self.position:
            # Enter when squeeze releases
            if not squeeze and self.mom[0] > 0:
                self.buy()
            elif not squeeze and self.mom[0] < 0:
                self.sell()
        else:
            # Exit on opposite momentum
            if self.position.size > 0 and self.mom[0] < 0:
                self.close()
            elif self.position.size < 0 and self.mom[0] > 0:
                self.close()
`,
  },
  rsi_divergence: {
    name: 'RSI Divergence',
    description: 'Detect bullish/bearish divergence between price and RSI',
    code: `# RSI Divergence Strategy
import backtrader as bt

class MyStrategy(bt.Strategy):
    """
    RSI Divergence
    Bullish divergence: price makes lower low but RSI makes higher low
    Uses lookback window to detect divergence patterns
    """
    params = (('rsi_period', 14), ('lookback', 10), ('oversold', 30))

    def __init__(self):
        self.rsi = bt.ind.RSI(period=self.p.rsi_period)

    def next(self):
        if len(self.data) < self.p.lookback + 1:
            return

        lb = self.p.lookback
        if not self.position:
            # Bullish divergence: price lower low, RSI higher low
            price_ll = self.data.close[0] < min(self.data.close.get(size=lb, ago=1))
            rsi_hl = self.rsi[0] > min(self.rsi.get(size=lb, ago=1))
            if price_ll and rsi_hl and self.rsi[0] < self.p.oversold:
                self.buy()
        else:
            # Exit when RSI recovers above 50
            if self.rsi[0] > 50:
                self.sell()
`,
  },
  ma_ribbon: {
    name: 'MA Ribbon',
    description: 'Multiple moving averages for trend strength',
    code: `# Moving Average Ribbon Strategy
import backtrader as bt

class MyStrategy(bt.Strategy):
    """
    Moving Average Ribbon
    Uses multiple SMAs to gauge trend strength
    Buy when all MAs are aligned bullish, sell when bearish
    """
    params = (('shortest', 10), ('longest', 50), ('count', 5))

    def __init__(self):
        step = max(1, (self.p.longest - self.p.shortest) // max(self.p.count - 1, 1))
        self.mas = []
        for i in range(self.p.count):
            period = self.p.shortest + i * step
            self.mas.append(bt.ind.SMA(period=min(period, self.p.longest)))

    def next(self):
        values = [ma[0] for ma in self.mas]
        # Check if all MAs are in bullish order (short > long)
        bullish = all(values[i] >= values[i+1] for i in range(len(values)-1))
        bearish = all(values[i] <= values[i+1] for i in range(len(values)-1))

        if not self.position:
            if bullish:
                self.buy()
        else:
            if bearish:
                self.sell()
`,
  },
  mean_reversion_z: {
    name: 'Z-Score Mean Reversion',
    description: 'Trade when price deviates N standard deviations from mean',
    code: `# Z-Score Mean Reversion Strategy
import backtrader as bt

class MyStrategy(bt.Strategy):
    """
    Z-Score Mean Reversion
    Buy when z-score < -threshold (oversold)
    Sell when z-score > +threshold (overbought) or reverts to mean
    """
    params = (('period', 30), ('z_threshold', 2.0))

    def __init__(self):
        self.sma = bt.ind.SMA(period=self.p.period)
        self.std = bt.ind.StdDev(period=self.p.period)

    def next(self):
        if self.std[0] == 0:
            return
        z = (self.data.close[0] - self.sma[0]) / self.std[0]

        if not self.position:
            if z < -self.p.z_threshold:
                self.buy()
        else:
            if z > 0:  # Reverted to mean
                self.sell()
`,
  },
  custom: {
    name: 'Custom Strategy',
    description: 'Write your own strategy code',
    code: `# Custom Strategy
import backtrader as bt

class MyStrategy(bt.Strategy):
    """
    Your custom strategy - modify this code!
    Available imports: backtrader (bt), math, numpy (np), pandas (pd)
    """
    params = ()

    def __init__(self):
        # Add your indicators here
        pass

    def next(self):
        # Add your trading logic here
        if not self.position:
            self.buy()  # Example: always buy if no position
`,
  },
};

type StrategyTemplateKey = keyof typeof STRATEGY_TEMPLATES;

const STRATEGY_PARAMS: Record<StrategyTemplateKey, { key: string; label: string; type: 'number'; default: number; min?: number; max?: number; step?: number }[]> = {
  sma_crossover: [
    { key: 'fast', label: 'Fast MA Period', type: 'number', default: 10, min: 2, max: 200, step: 1 },
    { key: 'slow', label: 'Slow MA Period', type: 'number', default: 30, min: 5, max: 500, step: 1 },
  ],
  mean_reversion: [
    { key: 'period', label: 'BB Period', type: 'number', default: 20, min: 5, max: 100, step: 1 },
    { key: 'devfactor', label: 'Std Dev Factor', type: 'number', default: 2.0, min: 0.5, max: 4.0, step: 0.1 },
  ],
  momentum: [
    { key: 'period', label: 'ROC Period', type: 'number', default: 14, min: 2, max: 50, step: 1 },
    { key: 'threshold', label: 'Threshold', type: 'number', default: 5, min: 0, max: 20, step: 0.5 },
  ],
  rsi_strategy: [
    { key: 'period', label: 'RSI Period', type: 'number', default: 14, min: 2, max: 50, step: 1 },
    { key: 'oversold', label: 'Oversold Level', type: 'number', default: 30, min: 10, max: 45, step: 1 },
    { key: 'overbought', label: 'Overbought Level', type: 'number', default: 70, min: 55, max: 90, step: 1 },
  ],
  macd_strategy: [
    { key: 'fast', label: 'Fast EMA', type: 'number', default: 12, min: 2, max: 50, step: 1 },
    { key: 'slow', label: 'Slow EMA', type: 'number', default: 26, min: 10, max: 100, step: 1 },
    { key: 'signal', label: 'Signal Period', type: 'number', default: 9, min: 2, max: 30, step: 1 },
  ],
  breakout: [
    { key: 'period', label: 'Entry Period', type: 'number', default: 20, min: 5, max: 100, step: 1 },
    { key: 'exit_period', label: 'Exit Period', type: 'number', default: 10, min: 3, max: 50, step: 1 },
  ],
  vwap_reversion: [
    { key: 'period', label: 'VWAP Period', type: 'number', default: 20, min: 5, max: 100, step: 1 },
    { key: 'num_std', label: 'Std Deviations', type: 'number', default: 2.0, min: 0.5, max: 4.0, step: 0.1 },
  ],
  dual_momentum: [
    { key: 'lookback', label: 'Lookback Period', type: 'number', default: 90, min: 20, max: 252, step: 1 },
    { key: 'threshold', label: 'ROC Threshold', type: 'number', default: 2.0, min: 0, max: 20, step: 0.5 },
  ],
  turtle_trading: [
    { key: 'entry_period', label: 'Entry Period', type: 'number', default: 20, min: 5, max: 100, step: 1 },
    { key: 'exit_period', label: 'Exit Period', type: 'number', default: 10, min: 3, max: 50, step: 1 },
    { key: 'atr_period', label: 'ATR Period', type: 'number', default: 14, min: 5, max: 50, step: 1 },
  ],
  bollinger_squeeze: [
    { key: 'bb_period', label: 'BB Period', type: 'number', default: 20, min: 5, max: 100, step: 1 },
    { key: 'kc_period', label: 'KC Period', type: 'number', default: 20, min: 5, max: 100, step: 1 },
    { key: 'kc_mult', label: 'KC Multiplier', type: 'number', default: 1.5, min: 0.5, max: 3.0, step: 0.1 },
  ],
  rsi_divergence: [
    { key: 'rsi_period', label: 'RSI Period', type: 'number', default: 14, min: 5, max: 50, step: 1 },
    { key: 'lookback', label: 'Lookback Window', type: 'number', default: 10, min: 3, max: 30, step: 1 },
    { key: 'oversold', label: 'Oversold Level', type: 'number', default: 30, min: 10, max: 45, step: 1 },
  ],
  ma_ribbon: [
    { key: 'shortest', label: 'Shortest MA', type: 'number', default: 10, min: 2, max: 50, step: 1 },
    { key: 'longest', label: 'Longest MA', type: 'number', default: 50, min: 20, max: 200, step: 1 },
    { key: 'count', label: 'Number of MAs', type: 'number', default: 5, min: 2, max: 10, step: 1 },
  ],
  mean_reversion_z: [
    { key: 'period', label: 'Lookback Period', type: 'number', default: 30, min: 5, max: 100, step: 1 },
    { key: 'z_threshold', label: 'Z-Score Threshold', type: 'number', default: 2.0, min: 0.5, max: 4.0, step: 0.1 },
  ],
  custom: [],
};

const DEFAULT_CODE = STRATEGY_TEMPLATES.sma_crossover.code;

const SYMBOLS = [
  { value: 'AAPL', label: 'Apple Inc.' },
  { value: 'MSFT', label: 'Microsoft' },
  { value: 'GOOGL', label: 'Alphabet' },
  { value: 'AMZN', label: 'Amazon' },
  { value: 'TSLA', label: 'Tesla' },
  { value: 'META', label: 'Meta Platforms' },
  { value: 'NVDA', label: 'NVIDIA' },
  { value: 'AMD', label: 'AMD' },
  { value: 'NFLX', label: 'Netflix' },
  { value: 'SPY', label: 'S&P 500 ETF' },
  { value: 'QQQ', label: 'Nasdaq ETF' },
  { value: 'DIS', label: 'Walt Disney' },
  { value: 'BA', label: 'Boeing' },
  { value: 'JPM', label: 'JPMorgan Chase' },
  { value: 'GS', label: 'Goldman Sachs' },
  { value: 'GLD', label: 'Gold ETF' },
  { value: 'SLV', label: 'Silver ETF' },
  { value: 'TLT', label: 'Treasury Bond ETF' },
  { value: 'BTC-USD', label: 'Bitcoin' },
  { value: 'ETH-USD', label: 'Ethereum' },
];

interface BacktestConfig {
  symbol: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  slippage: number; // percentage (e.g. 0.1 = 0.1%)
  commission: number; // percentage (e.g. 0.1 = 0.1%)
  sizingMethod: 'full' | 'percent_equity' | 'fixed_shares' | 'fixed_dollar';
  sizingValue: number | null;
  stopLossPct: number | null;
  takeProfitPct: number | null;
  benchmarkSymbol: string | null;
  interval: '1d' | '1h' | '15m' | '5m';
}

interface BacktestResult {
  total_return: number;
  sharpe_ratio: number;
  max_drawdown: number;
  win_rate: number;
  total_trades: number;
  final_value: number;
  initial_capital: number;
  // Trade-level data from backend
  trades: BacktestTrade[];
  equity_curve: EquityCurvePoint[];
  drawdown_series: DrawdownPoint[];
  // Extended metrics
  sortino_ratio?: number;
  profit_factor?: number;
  avg_trade_duration?: number;
  max_consecutive_losses?: number;
  calmar_ratio?: number;
  exposure_pct?: number;
  benchmark_return?: number;
}

export default function PlaygroundPage() {
  const { isAuthenticated } = useAuthStore();
  
  const [code, setCode] = useState(DEFAULT_CODE);
  const [selectedTemplate, setSelectedTemplate] = useState<StrategyTemplateKey>('sma_crossover');
  const [config, setConfig] = useState<BacktestConfig>({
    symbol: 'AAPL',
    startDate: '2023-01-01',
    endDate: '2024-01-01',
    initialCapital: 10000,
    slippage: 0.1, // 0.1%
    commission: 0.1, // 0.1%
    sizingMethod: 'full',
    sizingValue: null,
    stopLossPct: null,
    takeProfitPct: null,
    benchmarkSymbol: null,
    interval: '1d',
  });
  const [strategyParams, setStrategyParams] = useState<Record<string, number>>(() => {
    const defaultParams: Record<string, number> = {};
    STRATEGY_PARAMS.sma_crossover.forEach(p => { defaultParams[p.key] = p.default; });
    return defaultParams;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [lastRunTime, setLastRunTime] = useState<string | null>(null);
  const [activeResultsTab, setActiveResultsTab] = useState<'summary' | 'trades' | 'charts' | 'compare' | 'optimize' | 'walkforward' | 'montecarlo' | 'risk'>('summary');
  const [showCostsSection, setShowCostsSection] = useState(true);
  const [showSizingSection, setShowSizingSection] = useState(false);
  const [showRiskSection, setShowRiskSection] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState('');
  const [symbolResults, setSymbolResults] = useState<string[]>([]);
  const [showSymbolDropdown, setShowSymbolDropdown] = useState(false);
  const [additionalSymbols, setAdditionalSymbols] = useState<string[]>([]);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [editorMinimized, setEditorMinimized] = useState(false);
  const [editorPosition, setEditorPosition] = useState({ x: 20, y: 300 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Set initial position on mount
  useEffect(() => {
    setEditorPosition({ x: 20, y: window.innerHeight - 470 });
  }, []);
  
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comparisonHistory, setComparisonHistory] = useState<(BacktestResult & { label: string; timestamp: number })[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  // Reuse a single playground strategy to avoid DB pollution
  const [playgroundStrategyId, setPlaygroundStrategyId] = useState<number | null>(null);

  // Advanced analytics state
  const [optimizeResults, setOptimizeResults] = useState<any>(null);
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const [walkForwardResults, setWalkForwardResults] = useState<any>(null);
  const [walkForwardLoading, setWalkForwardLoading] = useState(false);
  const [monteCarloResults, setMonteCarloResults] = useState<any>(null);
  const [monteCarloLoading, setMonteCarloLoading] = useState(false);
  const [lastBacktestId, setLastBacktestId] = useState<number | null>(null);

  const selectedSymbol = SYMBOLS.find(s => s.value === config.symbol);
  
  // Derive trade markers from real backend trades
  const tradeMarkers: TradeMarker[] = useMemo(() => {
    if (!results?.trades) return [];
    const markers: TradeMarker[] = [];
    for (const trade of results.trades) {
      markers.push({ date: trade.entry_date, type: 'buy', price: trade.entry_price });
      markers.push({ date: trade.exit_date, type: 'sell', price: trade.exit_price });
    }
    return markers;
  }, [results?.trades]);

  // Use real equity curve from backend, mapped for drawdown chart compat
  const equityCurveData = useMemo(() => {
    return results?.equity_curve || [];
  }, [results?.equity_curve]);

  const drawdownData = useMemo(() => {
    return results?.drawdown_series || [];
  }, [results?.drawdown_series]);

  const validateConfig = (): string | null => {
    const start = new Date(config.startDate);
    const end = new Date(config.endDate);
    const now = new Date();

    if (end <= start) return 'End date must be after start date';
    if (start > now) return 'Start date cannot be in the future';

    const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff > 3650) return 'Date range cannot exceed 10 years';
    if (daysDiff < 7) return 'Date range must be at least 7 days';

    if (config.initialCapital < 100) return 'Initial capital must be at least $100';
    if (config.initialCapital > 10000000) return 'Initial capital cannot exceed $10,000,000';

    if (config.slippage < 0 || config.slippage > 10) return 'Slippage must be between 0% and 10%';
    if (config.commission < 0 || config.commission > 5) return 'Commission must be between 0% and 5%';

    if (!code.trim()) return 'Strategy code cannot be empty';
    if (!code.includes('class MyStrategy')) return 'Strategy code must define a class named MyStrategy';

    return null;
  };

  const handleRunBacktest = useCallback(async () => {
    if (!isAuthenticated) {
      setError('Please sign in to run backtests');
      return;
    }

    const validationError = validateConfig();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsRunning(true);
    setError(null);
    setResults(null);
    setActiveResultsTab('summary');
    const startTime = Date.now();

    try {
      // Reuse or create a single playground strategy to avoid DB pollution
      let strategyId = playgroundStrategyId;
      if (strategyId) {
        // Update existing strategy with current code/params
        try {
          await api.updateStrategy(strategyId, {
            code: code,
            parameters: strategyParams,
          });
        } catch {
          // If update fails (e.g. deleted), create a new one
          strategyId = null;
        }
      }
      if (!strategyId) {
        const strategy = await api.createStrategy({
          title: 'Playground Strategy',
          description: 'Temporary strategy from playground',
          code: code,
          parameters: strategyParams,
          is_public: false,
        });
        strategyId = strategy.id;
        setPlaygroundStrategyId(strategy.id);
      }

      const backtest = await api.createBacktest({
        strategy_id: strategyId,
        symbol: config.symbol,
        symbols: additionalSymbols.length > 0 ? additionalSymbols : undefined,
        start_date: config.startDate,
        end_date: config.endDate,
        initial_capital: config.initialCapital,
        slippage: config.slippage / 100,     // Convert from percentage to decimal
        commission: config.commission / 100,  // Convert from percentage to decimal
        parameters: strategyParams,
        sizing_method: config.sizingMethod,
        sizing_value: config.sizingValue,
        stop_loss_pct: config.stopLossPct,
        take_profit_pct: config.takeProfitPct,
        benchmark_symbol: config.benchmarkSymbol,
        interval: config.interval,
      });

      let attempts = 0;
      const maxAttempts = 60;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const result = await api.getBacktest(backtest.id);
        
        if (result.status === 'completed') {
          setLastBacktestId(result.id);
          const r = result.results;
          // Use real benchmark from backend (buy & hold over actual market data)
          const benchmarkReturn = r?.benchmark_return ?? undefined;
          const resultsObj: BacktestResult = {
            total_return: result.total_return || 0,
            sharpe_ratio: result.sharpe_ratio || 0,
            max_drawdown: result.max_drawdown || 0,
            win_rate: result.win_rate || 0,
            total_trades: result.total_trades || 0,
            final_value: r?.final_value || config.initialCapital,
            initial_capital: r?.initial_capital || config.initialCapital,
            trades: r?.trades || [],
            equity_curve: r?.equity_curve || [],
            drawdown_series: r?.drawdown_series || [],
            sortino_ratio: result.sortino_ratio ?? r?.sortino_ratio ?? undefined,
            profit_factor: result.profit_factor ?? r?.profit_factor ?? undefined,
            avg_trade_duration: result.avg_trade_duration ?? r?.avg_trade_duration ?? undefined,
            max_consecutive_losses: result.max_consecutive_losses ?? r?.max_consecutive_losses ?? undefined,
            calmar_ratio: result.calmar_ratio ?? r?.calmar_ratio ?? undefined,
            exposure_pct: result.exposure_pct ?? r?.exposure_pct ?? undefined,
            benchmark_return: benchmarkReturn,
          };
          setResults(resultsObj);
          // Add to comparison history
          setComparisonHistory(prev => [
            ...prev.slice(-4), // Keep last 5 total
            {
              ...resultsObj,
              label: `${STRATEGY_TEMPLATES[selectedTemplate].name} - ${config.symbol}`,
              timestamp: Date.now(),
            },
          ]);
          break;
        } else if (result.status === 'failed') {
          setError(result.error_message || 'Backtest failed');
          break;
        }
        attempts++;
      }
      
      if (attempts >= maxAttempts) {
        setError('Backtest timed out. Please try again.');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to run backtest');
    } finally {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      setLastRunTime(`${elapsed}s`);
      setIsRunning(false);
    }
  }, [isAuthenticated, code, config, strategyParams, selectedTemplate, playgroundStrategyId]);

  const handleRunOptimization = useCallback(async () => {
    if (!playgroundStrategyId) return;
    setOptimizeLoading(true);
    setOptimizeResults(null);
    try {
      // Build param grid from current template params
      const paramDefs = STRATEGY_PARAMS[selectedTemplate];
      const grid: Record<string, number[]> = {};
      for (const p of paramDefs) {
        const current = strategyParams[p.key] ?? p.default;
        const step = p.step ?? 1;
        // Generate 5 values around current
        const vals: number[] = [];
        for (let i = -2; i <= 2; i++) {
          const v = +(current + i * step * 2).toFixed(4);
          if (v >= (p.min ?? 0) && v <= (p.max ?? 999)) vals.push(v);
        }
        if (vals.length > 0) grid[p.key] = [...new Set(vals)];
      }
      if (Object.keys(grid).length === 0) return;

      const { task_id } = await api.runOptimization({
        strategy_id: playgroundStrategyId,
        symbol: config.symbol,
        start_date: config.startDate,
        end_date: config.endDate,
        initial_capital: config.initialCapital,
        commission: config.commission / 100,
        slippage: config.slippage / 100,
        param_grid: grid,
        interval: config.interval,
      });

      // Poll for results
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const res = await api.getOptimizationResult(task_id);
        if (res.status === 'completed') {
          setOptimizeResults(res);
          break;
        } else if (res.status === 'failed') {
          setOptimizeResults({ error: res.error });
          break;
        }
      }
    } catch (err: any) {
      setOptimizeResults({ error: err.message });
    } finally {
      setOptimizeLoading(false);
    }
  }, [playgroundStrategyId, selectedTemplate, strategyParams, config]);

  const handleRunWalkForward = useCallback(async () => {
    if (!playgroundStrategyId) return;
    setWalkForwardLoading(true);
    setWalkForwardResults(null);
    try {
      const { task_id } = await api.runWalkForward({
        strategy_id: playgroundStrategyId,
        symbol: config.symbol,
        start_date: config.startDate,
        end_date: config.endDate,
        initial_capital: config.initialCapital,
        commission: config.commission / 100,
        slippage: config.slippage / 100,
        n_splits: 5,
        train_pct: 0.7,
        interval: config.interval,
      });

      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const res = await api.getWalkForwardResult(task_id);
        if (res.status === 'completed') {
          setWalkForwardResults(res);
          break;
        } else if (res.status === 'failed') {
          setWalkForwardResults({ error: res.error });
          break;
        }
      }
    } catch (err: any) {
      setWalkForwardResults({ error: err.message });
    } finally {
      setWalkForwardLoading(false);
    }
  }, [playgroundStrategyId, config]);

  const handleRunMonteCarlo = useCallback(async () => {
    if (!lastBacktestId) return;
    setMonteCarloLoading(true);
    setMonteCarloResults(null);
    try {
      const { task_id } = await api.runMonteCarlo(lastBacktestId, {
        backtest_id: lastBacktestId,
        n_simulations: 1000,
      });

      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const res = await api.getMonteCarloResult(task_id);
        if (res.status === 'completed') {
          setMonteCarloResults(res);
          break;
        } else if (res.status === 'failed') {
          setMonteCarloResults({ error: res.error });
          break;
        }
      }
    } catch (err: any) {
      setMonteCarloResults({ error: err.message });
    } finally {
      setMonteCarloLoading(false);
    }
  }, [lastBacktestId]);

  const handleReset = () => {
    setCode(DEFAULT_CODE);
    setSelectedTemplate('sma_crossover');
    const defaultParams: Record<string, number> = {};
    STRATEGY_PARAMS.sma_crossover.forEach(p => { defaultParams[p.key] = p.default; });
    setStrategyParams(defaultParams);
    setResults(null);
    setError(null);
  };

  const updateCodeWithParams = (templateKey: StrategyTemplateKey, params: Record<string, number>) => {
    let templateCode = STRATEGY_TEMPLATES[templateKey].code;
    const paramDefs = STRATEGY_PARAMS[templateKey];
    if (paramDefs.length > 0) {
      const paramsStr = paramDefs.map(p => `('${p.key}', ${params[p.key] ?? p.default})`).join(', ');
      // Use greedy match (no ?) so we capture full params = ((...), (...))
      templateCode = templateCode.replace(/params\s*=\s*\(.*\)/, `params = (${paramsStr})`);
    }
    return templateCode;
  };

  const handleTemplateChange = (templateKey: StrategyTemplateKey) => {
    setSelectedTemplate(templateKey);
    setCode(STRATEGY_TEMPLATES[templateKey].code);
    // Initialize params from template defaults
    const defaultParams: Record<string, number> = {};
    STRATEGY_PARAMS[templateKey].forEach(p => { defaultParams[p.key] = p.default; });
    setStrategyParams(defaultParams);
  };

  // Export results as CSV
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

  const handleSave = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await api.createStrategy({
        title: `${STRATEGY_TEMPLATES[selectedTemplate].name} - ${config.symbol}`,
        description: `Playground strategy: ${STRATEGY_TEMPLATES[selectedTemplate].description}`,
        code: code,
        parameters: strategyParams,
        is_public: false,
      });
      setSaveMessage('Strategy saved!');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err: any) {
      setSaveMessage('Failed to save');
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setIsSaving(false);
    }
  }, [isAuthenticated, selectedTemplate, config.symbol, code, strategyParams]);

  // Debounced symbol search
  useEffect(() => {
    if (!symbolSearch || symbolSearch.length < 1) {
      setSymbolResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await api.searchSymbols(symbolSearch);
        setSymbolResults(res.results);
      } catch {
        // Fallback to local filter
        const q = symbolSearch.toUpperCase();
        setSymbolResults(SYMBOLS.filter(s => s.value.includes(q)).map(s => s.value));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [symbolSearch]);

  // Keyboard shortcut: Cmd/Ctrl + Enter to run backtest
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!isRunning && isAuthenticated) {
          handleRunBacktest();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRunning, isAuthenticated, handleRunBacktest]);

  // Dragging handlers for floating editor
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - editorPosition.x,
      y: e.clientY - editorPosition.y,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setEditorPosition({
        x: Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - 300)),
        y: Math.max(0, Math.min(e.clientY - dragOffset.y, window.innerHeight - 50)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const daysOfData = Math.round((new Date(config.endDate).getTime() - new Date(config.startDate).getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="h-full flex flex-col bg-gray-900 text-gray-100">
      {/* Top Bar */}
      <div className="h-12 bg-gray-800 border-b border-gray-700 px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-bold text-gray-100">Strategy Playground</h1>
          
          {/* Symbol & Price */}
          <div className="flex items-center gap-2 pl-4 border-l border-gray-700 relative">
            <div className="relative">
              <input
                type="text"
                value={symbolSearch || config.symbol}
                onChange={(e) => {
                  setSymbolSearch(e.target.value.toUpperCase());
                  setShowSymbolDropdown(true);
                }}
                onFocus={() => {
                  setSymbolSearch('');
                  setShowSymbolDropdown(true);
                }}
                onBlur={() => setTimeout(() => setShowSymbolDropdown(false), 200)}
                placeholder="Search symbol..."
                className="bg-gray-700 border border-gray-600 text-gray-100 text-sm font-medium rounded px-2 py-1 w-28 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
              />
              {showSymbolDropdown && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                  {(symbolResults.length > 0 ? symbolResults : SYMBOLS.map(s => s.value)).map((sym) => {
                    const label = SYMBOLS.find(s => s.value === sym)?.label;
                    return (
                      <button
                        key={sym}
                        onMouseDown={(e) => { e.preventDefault(); }}
                        onClick={() => {
                          setConfig({ ...config, symbol: sym });
                          setSymbolSearch('');
                          setShowSymbolDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700 transition ${config.symbol === sym ? 'text-emerald-400' : 'text-gray-200'}`}
                      >
                        <span className="font-medium">{sym}</span>
                        {label && <span className="text-gray-500 ml-2 text-xs">{label}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {selectedSymbol && (
              <span className="text-sm font-medium text-gray-400">
                {selectedSymbol.label}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition"
            title="Reset"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          {isAuthenticated && (
            <div className="relative">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition"
                title="Save Strategy"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              </button>
              {saveMessage && (
                <div className="absolute top-full right-0 mt-1 px-2 py-1 bg-gray-700 text-xs text-gray-200 rounded whitespace-nowrap">
                  {saveMessage}
                </div>
              )}
            </div>
          )}
          <button
            onClick={handleRunBacktest}
            disabled={isRunning}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition"
          >
            {isRunning ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Running...</>
            ) : (
              <><Play className="h-4 w-4" /> Run <kbd className="ml-1 px-1 py-0.5 text-[10px] bg-emerald-500 rounded">⌘↵</kbd></>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Configuration */}
        <div className={`flex flex-col bg-gray-800 border-r border-gray-700 transition-all duration-200 ${leftSidebarCollapsed ? 'w-10' : 'w-60'}`}>
          <div className="h-10 px-3 flex items-center justify-between border-b border-gray-700">
            {!leftSidebarCollapsed && <span className="text-xs font-semibold text-gray-400 uppercase">Configuration</span>}
            <button
              onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
              className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded"
            >
              <PanelLeftClose className={`h-4 w-4 transition-transform ${leftSidebarCollapsed ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {!leftSidebarCollapsed && (
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {/* Strategy Template */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Strategy Template</label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => handleTemplateChange(e.target.value as StrategyTemplateKey)}
                  className="w-full bg-gray-700 border border-gray-600 text-gray-100 text-sm rounded px-2 py-1.5"
                >
                  {Object.entries(STRATEGY_TEMPLATES).map(([key, t]) => (
                    <option key={key} value={key}>{t.name}</option>
                  ))}
                </select>
              </div>
              
              {/* Strategy Parameters */}
              {STRATEGY_PARAMS[selectedTemplate].length > 0 && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Strategy Parameters</label>
                  <div className="space-y-2">
                    {STRATEGY_PARAMS[selectedTemplate].map(param => (
                      <div key={param.key}>
                        <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                          <span>{param.label}</span>
                          <span className="text-gray-400 font-mono">{strategyParams[param.key] ?? param.default}</span>
                        </div>
                        <input
                          type="range"
                          min={param.min}
                          max={param.max}
                          step={param.step}
                          value={strategyParams[param.key] ?? param.default}
                          onChange={(e) => {
                            const newParams = { ...strategyParams, [param.key]: parseFloat(e.target.value) };
                            setStrategyParams(newParams);
                            setCode(updateCodeWithParams(selectedTemplate, newParams));
                          }}
                          className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Date Range */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Date Range</label>
                <div className="space-y-2">
                  <input
                    type="date"
                    value={config.startDate}
                    onChange={(e) => setConfig({ ...config, startDate: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 text-gray-100 text-sm rounded px-2 py-1.5"
                  />
                  <input
                    type="date"
                    value={config.endDate}
                    onChange={(e) => setConfig({ ...config, endDate: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 text-gray-100 text-sm rounded px-2 py-1.5"
                  />
                </div>
                <div className="text-xs text-gray-500 mt-1">{daysOfData} days</div>
              </div>
              
              {/* Initial Capital */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Initial Capital</label>
                <div className="relative">
                  <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <input
                    type="number"
                    value={config.initialCapital}
                    onChange={(e) => setConfig({ ...config, initialCapital: parseFloat(e.target.value) || 10000 })}
                    className="w-full bg-gray-700 border border-gray-600 text-gray-100 text-sm rounded pl-7 pr-2 py-1.5"
                  />
                </div>
              </div>
              
              {/* Data Interval */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Interval</label>
                <select
                  value={config.interval}
                  onChange={(e) => setConfig({ ...config, interval: e.target.value as BacktestConfig['interval'] })}
                  className="w-full bg-gray-700 border border-gray-600 text-gray-100 text-sm rounded px-2 py-1.5"
                >
                  <option value="1d">Daily</option>
                  <option value="1h">Hourly</option>
                  <option value="15m">15 Minutes</option>
                  <option value="5m">5 Minutes</option>
                </select>
                {config.interval !== '1d' && (
                  <div className="text-xs text-amber-400 mt-1">
                    {config.interval === '1h' ? 'Max ~730 days' : config.interval === '15m' ? 'Max ~60 days' : 'Max ~60 days'}
                  </div>
                )}
              </div>

              {/* Benchmark */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Benchmark</label>
                <select
                  value={config.benchmarkSymbol || ''}
                  onChange={(e) => setConfig({ ...config, benchmarkSymbol: e.target.value || null })}
                  className="w-full bg-gray-700 border border-gray-600 text-gray-100 text-sm rounded px-2 py-1.5"
                >
                  <option value="">Same Symbol (Buy & Hold)</option>
                  <option value="SPY">SPY - S&P 500</option>
                  <option value="QQQ">QQQ - Nasdaq 100</option>
                  {config.symbol !== 'SPY' && config.symbol !== 'QQQ' && (
                    <option value={config.symbol}>{config.symbol} - Buy & Hold</option>
                  )}
                </select>
              </div>

              {/* Additional Symbols (Multi-Asset) */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Additional Symbols</label>
                <div className="flex flex-wrap gap-1 mb-1">
                  {additionalSymbols.map(s => (
                    <span key={s} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-700 rounded text-xs text-gray-300">
                      {s}
                      <button
                        onClick={() => setAdditionalSymbols(additionalSymbols.filter(x => x !== s))}
                        className="text-gray-500 hover:text-red-400"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                {additionalSymbols.length < 4 && (
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value && !additionalSymbols.includes(e.target.value) && e.target.value !== config.symbol) {
                        setAdditionalSymbols([...additionalSymbols, e.target.value]);
                      }
                    }}
                    className="w-full bg-gray-700 border border-gray-600 text-gray-100 text-sm rounded px-2 py-1.5"
                  >
                    <option value="">Add symbol...</option>
                    {SYMBOLS.filter(s => s.value !== config.symbol && !additionalSymbols.includes(s.value)).map(s => (
                      <option key={s.value} value={s.value}>{s.value} - {s.label}</option>
                    ))}
                  </select>
                )}
                <div className="text-xs text-gray-500 mt-1">For multi-asset strategies (max 4)</div>
              </div>

              {/* Costs Section */}
              <div>
                <button
                  onClick={() => setShowCostsSection(!showCostsSection)}
                  className="flex items-center justify-between w-full text-xs text-gray-400 hover:text-gray-200"
                >
                  <span className="font-medium">Trading Costs</span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${showCostsSection ? '' : '-rotate-90'}`} />
                </button>
                {showCostsSection && (
                  <div className="mt-2 space-y-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Slippage (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={config.slippage}
                        onChange={(e) => setConfig({ ...config, slippage: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-gray-700 border border-gray-600 text-gray-100 text-sm rounded px-2 py-1"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Commission (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={config.commission}
                        onChange={(e) => setConfig({ ...config, commission: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-gray-700 border border-gray-600 text-gray-100 text-sm rounded px-2 py-1"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Position Sizing */}
              <div>
                <button
                  onClick={() => setShowSizingSection(!showSizingSection)}
                  className="flex items-center justify-between w-full text-xs text-gray-400 hover:text-gray-200"
                >
                  <span className="font-medium">Position Sizing</span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${showSizingSection ? '' : '-rotate-90'}`} />
                </button>
                {showSizingSection && (
                  <div className="mt-2 space-y-2">
                    <select
                      value={config.sizingMethod}
                      onChange={(e) => setConfig({ ...config, sizingMethod: e.target.value as BacktestConfig['sizingMethod'], sizingValue: null })}
                      className="w-full bg-gray-700 border border-gray-600 text-gray-100 text-sm rounded px-2 py-1"
                    >
                      <option value="full">Full Position</option>
                      <option value="percent_equity">% of Equity</option>
                      <option value="fixed_shares">Fixed Shares</option>
                      <option value="fixed_dollar">Fixed Dollar</option>
                    </select>
                    {config.sizingMethod !== 'full' && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          {config.sizingMethod === 'percent_equity' ? 'Percent (%)' :
                           config.sizingMethod === 'fixed_shares' ? 'Shares' : 'Dollar Amount ($)'}
                        </label>
                        <input
                          type="number"
                          step={config.sizingMethod === 'percent_equity' ? '1' : '1'}
                          value={config.sizingValue ?? ''}
                          onChange={(e) => setConfig({ ...config, sizingValue: parseFloat(e.target.value) || null })}
                          placeholder={config.sizingMethod === 'percent_equity' ? '10' : config.sizingMethod === 'fixed_shares' ? '100' : '1000'}
                          className="w-full bg-gray-700 border border-gray-600 text-gray-100 text-sm rounded px-2 py-1"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Risk Management */}
              <div>
                <button
                  onClick={() => setShowRiskSection(!showRiskSection)}
                  className="flex items-center justify-between w-full text-xs text-gray-400 hover:text-gray-200"
                >
                  <span className="font-medium">Risk Management</span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${showRiskSection ? '' : '-rotate-90'}`} />
                </button>
                {showRiskSection && (
                  <div className="mt-2 space-y-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Stop Loss (%)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={config.stopLossPct ?? ''}
                        onChange={(e) => setConfig({ ...config, stopLossPct: parseFloat(e.target.value) || null })}
                        placeholder="e.g. 5"
                        className="w-full bg-gray-700 border border-gray-600 text-gray-100 text-sm rounded px-2 py-1"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Take Profit (%)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={config.takeProfitPct ?? ''}
                        onChange={(e) => setConfig({ ...config, takeProfitPct: parseFloat(e.target.value) || null })}
                        placeholder="e.g. 10"
                        className="w-full bg-gray-700 border border-gray-600 text-gray-100 text-sm rounded px-2 py-1"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Main Content - Chart */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chart Area - Always full height */}
          <div className="h-full bg-gray-950 relative">
            <ErrorBoundary label="Chart">
              <AssetChart 
                symbol={config.symbol} 
                startDate={config.startDate} 
                endDate={config.endDate}
                interval={config.interval}
                trades={tradeMarkers}
              />
            </ErrorBoundary>
            
            {/* Edit Code Button */}
            {!showCodeEditor && (
              <button
                onClick={() => setShowCodeEditor(true)}
                className="absolute bottom-4 left-4 inline-flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-200 text-sm font-medium rounded-lg shadow-lg transition"
              >
                <FileCode className="h-4 w-4" />
                Edit Code
              </button>
            )}
          </div>
        </div>

        {/* Right Sidebar - Results */}
        <div className={`flex flex-col bg-gray-800 border-l border-gray-700 transition-all duration-200 ${rightSidebarCollapsed ? 'w-10' : 'w-80'}`}>
          <div className="h-10 px-3 flex items-center justify-between border-b border-gray-700">
            <button
              onClick={() => setRightSidebarCollapsed(!rightSidebarCollapsed)}
              className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded"
            >
              <PanelRightClose className={`h-4 w-4 transition-transform ${rightSidebarCollapsed ? 'rotate-180' : ''}`} />
            </button>
            {!rightSidebarCollapsed && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-400 uppercase">Results</span>
                {results && (
                  <span className={`text-sm font-bold ${results.total_return >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {results.total_return >= 0 ? '+' : ''}{results.total_return.toFixed(2)}%
                  </span>
                )}
              </div>
            )}
          </div>
          {!rightSidebarCollapsed && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Tabs - two rows for better readability */}
              <div className="border-b border-gray-700">
                <div className="flex">
                  {(['summary', 'trades', 'charts', 'compare'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveResultsTab(tab)}
                      className={`flex-1 px-2 py-1.5 text-[10px] font-medium transition ${
                        activeResultsTab === tab
                          ? 'text-emerald-400 border-b-2 border-emerald-400'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="flex">
                  {([['optimize', 'Optimize'], ['walkforward', 'Walk-Fwd'], ['montecarlo', 'Monte Carlo'], ['risk', 'Risk']] as const).map(([tab, label]) => (
                    <button
                      key={tab}
                      onClick={() => setActiveResultsTab(tab)}
                      className={`flex-1 px-2 py-1.5 text-[10px] font-medium transition ${
                        activeResultsTab === tab
                          ? 'text-emerald-400 border-b-2 border-emerald-400'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto">
                <ErrorBoundary label="Results">
                {!isAuthenticated ? (
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                    <BarChart3 className="h-10 w-10 text-gray-600 mb-3" />
                    <h3 className="font-semibold text-gray-200 mb-1">Sign in to run backtests</h3>
                    <p className="text-xs text-gray-500 mb-3">Create a free account to test strategies</p>
                    <Link href="/register" className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded transition">
                      Get Started
                    </Link>
                  </div>
                ) : isRunning ? (
                  <div className="h-full flex flex-col items-center justify-center">
                    <Loader2 className="h-8 w-8 text-emerald-500 animate-spin mb-3" />
                    <p className="text-sm text-gray-300">Running backtest...</p>
                  </div>
                ) : error ? (
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                    <TrendingDown className="h-10 w-10 text-red-500 mb-3" />
                    <h3 className="font-semibold text-gray-200 mb-1">Backtest Failed</h3>
                    <pre className="text-xs text-gray-400 whitespace-pre-wrap text-left bg-gray-900/50 rounded p-2 max-h-40 overflow-y-auto w-full mt-1">{error}</pre>
                  </div>
                ) : results ? (
                  activeResultsTab === 'summary' ? (
                    <div className="p-3 space-y-3">
                      {/* Main Return */}
                      <div className={`p-3 rounded-lg ${results.total_return >= 0 ? 'bg-emerald-900/30 border border-emerald-800' : 'bg-red-900/30 border border-red-800'}`}>
                        <div className="text-xs text-gray-400">Total Return</div>
                        <div className={`text-2xl font-bold ${results.total_return >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {results.total_return >= 0 ? '+' : ''}{results.total_return.toFixed(2)}%
                        </div>
                        <div className="text-xs text-gray-500">
                          ${results.final_value.toLocaleString(undefined, { maximumFractionDigits: 0 })} final
                        </div>
                      </div>
                      
                      {/* Benchmark */}
                      {results.benchmark_return !== undefined && (
                        <div className="p-3 rounded-lg bg-gray-700/50 border border-gray-700">
                          <div className="flex justify-between text-xs mb-2">
                            <span className="text-gray-400">vs Buy & Hold</span>
                            <span className={results.total_return > results.benchmark_return ? 'text-emerald-400' : 'text-amber-400'}>
                              Alpha: {(results.total_return - results.benchmark_return).toFixed(2)}%
                            </span>
                          </div>
                          <div className="flex gap-4 text-sm">
                            <div>
                              <div className="text-gray-500 text-xs">Strategy</div>
                              <div className={results.total_return >= 0 ? 'text-emerald-400' : 'text-red-400'}>{results.total_return.toFixed(1)}%</div>
                            </div>
                            <div>
                              <div className="text-gray-500 text-xs">Benchmark</div>
                              <div className="text-blue-400">{results.benchmark_return.toFixed(1)}%</div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Metrics Grid */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 rounded bg-gray-700/50">
                          <div className="flex items-center gap-1 text-gray-500 text-xs mb-0.5">
                            <Activity className="h-3 w-3" /> Sharpe
                          </div>
                          <div className={`text-sm font-semibold ${results.sharpe_ratio > 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {results.sharpe_ratio.toFixed(2)}
                          </div>
                        </div>
                        <div className="p-2 rounded bg-gray-700/50">
                          <div className="flex items-center gap-1 text-gray-500 text-xs mb-0.5">
                            <TrendingDown className="h-3 w-3" /> Drawdown
                          </div>
                          <div className={`text-sm font-semibold ${results.max_drawdown > -20 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {results.max_drawdown.toFixed(1)}%
                          </div>
                        </div>
                        <div className="p-2 rounded bg-gray-700/50">
                          <div className="flex items-center gap-1 text-gray-500 text-xs mb-0.5">
                            <Target className="h-3 w-3" /> Win Rate
                          </div>
                          <div className={`text-sm font-semibold ${results.win_rate > 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {results.win_rate.toFixed(0)}%
                          </div>
                        </div>
                        <div className="p-2 rounded bg-gray-700/50">
                          <div className="flex items-center gap-1 text-gray-500 text-xs mb-0.5">
                            <BarChart3 className="h-3 w-3" /> Trades
                          </div>
                          <div className="text-sm font-semibold text-gray-200">
                            {results.total_trades}
                          </div>
                        </div>
                      </div>
                      
                      {/* Extended Metrics */}
                      {(results.sortino_ratio !== undefined || results.profit_factor !== undefined || results.calmar_ratio !== undefined) && (
                        <div className="grid grid-cols-2 gap-2">
                          {results.sortino_ratio !== undefined && results.sortino_ratio !== null && (
                            <div className="p-2 rounded bg-gray-700/50">
                              <div className="flex items-center gap-1 text-gray-500 text-xs mb-0.5">
                                <Scale className="h-3 w-3" /> Sortino
                              </div>
                              <div className={`text-sm font-semibold ${results.sortino_ratio > 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                {results.sortino_ratio.toFixed(2)}
                              </div>
                            </div>
                          )}
                          {results.profit_factor !== undefined && results.profit_factor !== null && (
                            <div className="p-2 rounded bg-gray-700/50">
                              <div className="flex items-center gap-1 text-gray-500 text-xs mb-0.5">
                                <Percent className="h-3 w-3" /> Profit Factor
                              </div>
                              <div className={`text-sm font-semibold ${results.profit_factor > 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                {results.profit_factor.toFixed(2)}
                              </div>
                            </div>
                          )}
                          {results.calmar_ratio !== undefined && results.calmar_ratio !== null && (
                            <div className="p-2 rounded bg-gray-700/50">
                              <div className="flex items-center gap-1 text-gray-500 text-xs mb-0.5">
                                <Activity className="h-3 w-3" /> Calmar
                              </div>
                              <div className={`text-sm font-semibold ${results.calmar_ratio > 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                {results.calmar_ratio.toFixed(2)}
                              </div>
                            </div>
                          )}
                          {results.exposure_pct !== undefined && results.exposure_pct !== null && (
                            <div className="p-2 rounded bg-gray-700/50">
                              <div className="flex items-center gap-1 text-gray-500 text-xs mb-0.5">
                                <BarChart3 className="h-3 w-3" /> Exposure
                              </div>
                              <div className="text-sm font-semibold text-gray-200">
                                {results.exposure_pct.toFixed(1)}%
                              </div>
                            </div>
                          )}
                          {results.avg_trade_duration !== undefined && results.avg_trade_duration !== null && (
                            <div className="p-2 rounded bg-gray-700/50">
                              <div className="flex items-center gap-1 text-gray-500 text-xs mb-0.5">
                                <Calendar className="h-3 w-3" /> Avg Duration
                              </div>
                              <div className="text-sm font-semibold text-gray-200">
                                {results.avg_trade_duration.toFixed(1)}d
                              </div>
                            </div>
                          )}
                          {results.max_consecutive_losses !== undefined && results.max_consecutive_losses !== null && (
                            <div className="p-2 rounded bg-gray-700/50">
                              <div className="flex items-center gap-1 text-gray-500 text-xs mb-0.5">
                                <TrendingDown className="h-3 w-3" /> Max Consec. Losses
                              </div>
                              <div className={`text-sm font-semibold ${results.max_consecutive_losses <= 3 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {results.max_consecutive_losses}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : activeResultsTab === 'trades' ? (
                    <TradeLog
                      trades={results.trades}
                    />
                  ) : activeResultsTab === 'charts' ? (
                    <div className="p-3 space-y-3">
                      {/* Equity Curve */}
                      {equityCurveData.length > 0 && (
                        <div className="rounded-lg bg-gray-700/50 p-3">
                          <div className="text-xs text-gray-400 mb-2">Equity Curve</div>
                          <div className="h-24">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={equityCurveData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                                <defs>
                                  <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <XAxis dataKey="date" hide />
                                <YAxis hide domain={['dataMin - 100', 'dataMax + 100']} />
                                <Tooltip
                                  content={({ active, payload }) => {
                                    if (active && payload?.[0]) {
                                      const d = payload[0].payload;
                                      return (
                                        <div className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs">
                                          <div className="text-emerald-400">${d.equity.toLocaleString()}</div>
                                          <div className="text-gray-500">{d.date}</div>
                                        </div>
                                      );
                                    }
                                    return null;
                                  }}
                                />
                                <Area type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={1.5} fill="url(#eqGrad)" />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}
                      
                      {/* Drawdown Chart */}
                      {drawdownData.length > 0 && (
                        <div className="rounded-lg bg-gray-700/50 p-3">
                          <div className="text-xs text-gray-400 mb-2">Drawdown</div>
                          <div className="h-20">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart
                                data={drawdownData.map(d => ({ ...d, drawdown_neg: -d.drawdown_pct }))}
                                margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                              >
                                <defs>
                                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0} />
                                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.4} />
                                  </linearGradient>
                                </defs>
                                <XAxis dataKey="date" hide />
                                <YAxis hide domain={['dataMin - 1', 0]} />
                                <Tooltip
                                  content={({ active, payload }) => {
                                    if (active && payload?.[0]) {
                                      const d = payload[0].payload;
                                      return (
                                        <div className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs">
                                          <div className="text-red-400">-{d.drawdown_pct.toFixed(2)}%</div>
                                          <div className="text-gray-500">{d.date}</div>
                                        </div>
                                      );
                                    }
                                    return null;
                                  }}
                                />
                                <Area type="monotone" dataKey="drawdown_neg" stroke="#ef4444" strokeWidth={1.5} fill="url(#ddGrad)" />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : activeResultsTab === 'optimize' ? (
                    <div className="p-3 space-y-3">
                      <button
                        onClick={handleRunOptimization}
                        disabled={optimizeLoading || !playgroundStrategyId || STRATEGY_PARAMS[selectedTemplate].length === 0}
                        className="w-full py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition"
                      >
                        {optimizeLoading ? 'Optimizing...' : 'Run Grid Search'}
                      </button>
                      {!playgroundStrategyId && (
                        <p className="text-xs text-gray-500">Run a backtest first, then optimize</p>
                      )}
                      {STRATEGY_PARAMS[selectedTemplate].length === 0 && (
                        <p className="text-xs text-gray-500">Custom strategies cannot be optimized via grid search</p>
                      )}
                      {optimizeResults?.error && (
                        <p className="text-xs text-red-400">{optimizeResults.error}</p>
                      )}
                      {optimizeResults?.results && (
                        <>
                          <div className="text-xs text-gray-400">
                            {optimizeResults.total_combinations} combinations tested
                          </div>
                          {optimizeResults.best && (
                            <div className="p-2 rounded bg-emerald-900/30 border border-emerald-800">
                              <div className="text-xs text-gray-400 mb-1">Best Combination</div>
                              <div className="text-sm font-semibold text-emerald-400">
                                {optimizeResults.best.total_return?.toFixed(2)}% return | Sharpe: {optimizeResults.best.sharpe_ratio?.toFixed(2) ?? 'N/A'}
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {Object.entries(optimizeResults.best.params).map(([k, v]) => `${k}=${v}`).join(', ')}
                              </div>
                            </div>
                          )}
                          <div className="rounded bg-gray-700/50 overflow-hidden">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-500 border-b border-gray-600">
                                  <th className="text-left p-1.5">Params</th>
                                  <th className="text-right p-1.5">Return</th>
                                  <th className="text-right p-1.5">Sharpe</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-700">
                                {optimizeResults.results.slice(0, 15).map((r: any, i: number) => (
                                  <tr key={i} className={i === 0 ? 'bg-emerald-900/20' : ''}>
                                    <td className="p-1.5 text-gray-400 truncate max-w-[120px]">
                                      {r.params ? Object.entries(r.params).map(([k, v]) => `${k}=${v}`).join(', ') : ''}
                                    </td>
                                    <td className={`p-1.5 text-right ${(r.total_return ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {r.error ? <span className="text-gray-500">err</span> : `${r.total_return?.toFixed(1)}%`}
                                    </td>
                                    <td className="p-1.5 text-right text-gray-300">
                                      {r.sharpe_ratio?.toFixed(2) ?? '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  ) : activeResultsTab === 'walkforward' ? (
                    <div className="p-3 space-y-3">
                      <button
                        onClick={handleRunWalkForward}
                        disabled={walkForwardLoading || !playgroundStrategyId}
                        className="w-full py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition"
                      >
                        {walkForwardLoading ? 'Analyzing...' : 'Run Walk-Forward Analysis'}
                      </button>
                      {!playgroundStrategyId && (
                        <p className="text-xs text-gray-500">Run a backtest first</p>
                      )}
                      {walkForwardResults?.error && (
                        <p className="text-xs text-red-400">{walkForwardResults.error}</p>
                      )}
                      {walkForwardResults?.windows && (
                        <>
                          {walkForwardResults.avg_oos_return != null ? (
                            <div className="p-2 rounded bg-gray-700/50 border border-gray-600">
                              <div className="text-xs text-gray-400">Avg Out-of-Sample Return</div>
                              <div className={`text-lg font-bold ${walkForwardResults.avg_oos_return >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {walkForwardResults.avg_oos_return.toFixed(2)}%
                              </div>
                            </div>
                          ) : (
                            <div className="p-2 rounded bg-amber-900/30 border border-amber-800">
                              <p className="text-xs text-amber-400">
                                Not enough data in test windows. Try a longer date range (2+ years) for more meaningful walk-forward results.
                              </p>
                            </div>
                          )}
                          <div className="rounded bg-gray-700/50 overflow-hidden">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-500 border-b border-gray-600">
                                  <th className="text-left p-1.5">Window</th>
                                  <th className="text-right p-1.5">Train</th>
                                  <th className="text-right p-1.5">Test</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-700">
                                {walkForwardResults.windows.map((w: any) => (
                                  <tr key={w.window}>
                                    <td className="p-1.5 text-gray-400">#{w.window}</td>
                                    <td className={`p-1.5 text-right ${w.train_error ? 'text-gray-500' : (w.train_return ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {w.train_error ? 'err' : w.train_return != null ? `${w.train_return.toFixed(1)}%` : 'N/A'}
                                    </td>
                                    <td className={`p-1.5 text-right font-medium ${w.test_error ? 'text-gray-500' : (w.test_return ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {w.test_error ? 'err' : w.test_return != null ? `${w.test_return.toFixed(1)}%` : 'N/A'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  ) : activeResultsTab === 'montecarlo' ? (
                    <div className="p-3 space-y-3">
                      <button
                        onClick={handleRunMonteCarlo}
                        disabled={monteCarloLoading || !lastBacktestId}
                        className="w-full py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition"
                      >
                        {monteCarloLoading ? 'Simulating...' : 'Run Monte Carlo (1000 sims)'}
                      </button>
                      {!lastBacktestId && (
                        <p className="text-xs text-gray-500">Run a backtest first</p>
                      )}
                      {monteCarloResults?.error && (
                        <p className="text-xs text-red-400">{monteCarloResults.error}</p>
                      )}
                      {monteCarloResults?.percentiles && monteCarloResults?.std_final === 0 && (
                        <div className="p-2 rounded bg-amber-900/30 border border-amber-800">
                          <p className="text-xs text-amber-400">
                            Too few trades for meaningful Monte Carlo analysis. All simulations converge to the same final value.
                            Try a longer date range or a more active strategy to generate more trades.
                          </p>
                        </div>
                      )}
                      {monteCarloResults?.percentiles && (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="p-2 rounded bg-gray-700/50">
                              <div className="text-xs text-gray-500">Median Final Value</div>
                              <div className="text-sm font-semibold text-gray-200">
                                ${monteCarloResults.percentiles.p50.toLocaleString()}
                              </div>
                            </div>
                            <div className="p-2 rounded bg-gray-700/50">
                              <div className="text-xs text-gray-500">Prob. of Loss</div>
                              <div className={`text-sm font-semibold ${monteCarloResults.probability_of_loss > 50 ? 'text-red-400' : 'text-emerald-400'}`}>
                                {monteCarloResults.probability_of_loss.toFixed(1)}%
                              </div>
                            </div>
                          </div>
                          <div className="rounded bg-gray-700/50 p-3">
                            <div className="text-xs text-gray-400 mb-2">Confidence Intervals</div>
                            <div className="space-y-1.5">
                              {[
                                { label: '95th', value: monteCarloResults.percentiles.p95, color: 'text-emerald-400' },
                                { label: '75th', value: monteCarloResults.percentiles.p75, color: 'text-emerald-300' },
                                { label: '50th', value: monteCarloResults.percentiles.p50, color: 'text-gray-200' },
                                { label: '25th', value: monteCarloResults.percentiles.p25, color: 'text-amber-400' },
                                { label: '5th', value: monteCarloResults.percentiles.p5, color: 'text-red-400' },
                              ].map(p => (
                                <div key={p.label} className="flex justify-between text-xs">
                                  <span className="text-gray-500">{p.label} percentile</span>
                                  <span className={p.color}>${p.value.toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="rounded bg-gray-700/50 p-3">
                            <div className="text-xs text-gray-400 mb-1">Statistics</div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-500">Mean</span>
                              <span className="text-gray-200">${monteCarloResults.mean_final.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-500">Std Dev</span>
                              <span className="text-gray-200">${monteCarloResults.std_final.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-500">Simulations</span>
                              <span className="text-gray-200">{monteCarloResults.n_simulations.toLocaleString()}</span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ) : activeResultsTab === 'risk' ? (
                    <div className="p-3 space-y-3">
                      {results ? (
                        (() => {
                          // Compute risk metrics from equity curve
                          const ec = results.equity_curve;
                          if (!ec || ec.length < 2) return <p className="text-xs text-gray-500">Not enough data for risk analysis</p>;
                          
                          const returns: number[] = [];
                          for (let i = 1; i < ec.length; i++) {
                            returns.push((ec[i].equity - ec[i-1].equity) / ec[i-1].equity);
                          }
                          
                          const sortedReturns = [...returns].sort((a, b) => a - b);
                          const var95 = sortedReturns[Math.floor(sortedReturns.length * 0.05)] * 100;
                          const var99 = sortedReturns[Math.floor(sortedReturns.length * 0.01)] * 100;
                          
                          // CVaR (Expected Shortfall)
                          const var95Idx = Math.floor(sortedReturns.length * 0.05);
                          const tailReturns = sortedReturns.slice(0, Math.max(var95Idx, 1));
                          const cvar95 = (tailReturns.reduce((a, b) => a + b, 0) / tailReturns.length) * 100;
                          
                          // Return distribution buckets
                          const buckets: Record<string, number> = { '< -3%': 0, '-3 to -1%': 0, '-1 to 0%': 0, '0 to 1%': 0, '1 to 3%': 0, '> 3%': 0 };
                          for (const r of returns) {
                            const pct = r * 100;
                            if (pct < -3) buckets['< -3%']++;
                            else if (pct < -1) buckets['-3 to -1%']++;
                            else if (pct < 0) buckets['-1 to 0%']++;
                            else if (pct < 1) buckets['0 to 1%']++;
                            else if (pct < 3) buckets['1 to 3%']++;
                            else buckets['> 3%']++;
                          }
                          
                          const maxBucket = Math.max(...Object.values(buckets));
                          
                          return (
                            <>
                              {/* VaR / CVaR */}
                              <div className="grid grid-cols-2 gap-2">
                                <div className="p-2 rounded bg-gray-700/50">
                                  <div className="text-xs text-gray-500 mb-0.5">VaR (95%)</div>
                                  <div className="text-sm font-semibold text-red-400">{var95.toFixed(2)}%</div>
                                </div>
                                <div className="p-2 rounded bg-gray-700/50">
                                  <div className="text-xs text-gray-500 mb-0.5">VaR (99%)</div>
                                  <div className="text-sm font-semibold text-red-400">{var99.toFixed(2)}%</div>
                                </div>
                                <div className="p-2 rounded bg-gray-700/50">
                                  <div className="text-xs text-gray-500 mb-0.5">CVaR (95%)</div>
                                  <div className="text-sm font-semibold text-red-400">{cvar95.toFixed(2)}%</div>
                                </div>
                                <div className="p-2 rounded bg-gray-700/50">
                                  <div className="text-xs text-gray-500 mb-0.5">Avg Daily Return</div>
                                  <div className={`text-sm font-semibold ${returns.reduce((a, b) => a + b, 0) / returns.length >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {(returns.reduce((a, b) => a + b, 0) / returns.length * 100).toFixed(3)}%
                                  </div>
                                </div>
                              </div>
                              
                              {/* Return Distribution */}
                              <div className="rounded bg-gray-700/50 p-3">
                                <div className="text-xs text-gray-400 mb-2">Return Distribution</div>
                                <div className="space-y-1">
                                  {Object.entries(buckets).map(([label, count]) => (
                                    <div key={label} className="flex items-center gap-2 text-xs">
                                      <span className="text-gray-500 w-20 text-right">{label}</span>
                                      <div className="flex-1 bg-gray-800 rounded-full h-3 overflow-hidden">
                                        <div
                                          className={`h-full rounded-full ${label.includes('-') ? 'bg-red-500/60' : 'bg-emerald-500/60'}`}
                                          style={{ width: `${maxBucket > 0 ? (count / maxBucket) * 100 : 0}%` }}
                                        />
                                      </div>
                                      <span className="text-gray-400 w-8">{count}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Underwater Chart */}
                              {drawdownData.length > 0 && (
                                <div className="rounded bg-gray-700/50 p-3">
                                  <div className="text-xs text-gray-400 mb-2">Underwater (Time in Drawdown)</div>
                                  <div className="h-20">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <AreaChart
                                        data={drawdownData.map(d => ({ ...d, dd: -d.drawdown_pct }))}
                                        margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                                      >
                                        <XAxis dataKey="date" hide />
                                        <YAxis hide domain={['dataMin - 1', 0]} />
                                        <Tooltip
                                          content={({ active, payload }) => {
                                            if (active && payload?.[0]) {
                                              const d = payload[0].payload;
                                              return (
                                                <div className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs">
                                                  <div className="text-red-400">-{d.drawdown_pct.toFixed(2)}%</div>
                                                  <div className="text-gray-500">{d.date}</div>
                                                </div>
                                              );
                                            }
                                            return null;
                                          }}
                                        />
                                        <Area type="monotone" dataKey="dd" stroke="#ef4444" strokeWidth={1} fill="#ef444440" />
                                      </AreaChart>
                                    </ResponsiveContainer>
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()
                      ) : (
                        <div className="text-center p-6">
                          <p className="text-sm text-gray-400">Run a backtest to see risk metrics</p>
                        </div>
                      )}
                    </div>
                  ) : activeResultsTab === 'compare' ? (
                    <div className="p-3 space-y-3">
                      {comparisonHistory.length < 2 ? (
                        <div className="text-center p-6">
                          <BarChart3 className="h-8 w-8 text-gray-600 mx-auto mb-2" />
                          <p className="text-sm text-gray-400">Run at least 2 backtests to compare</p>
                          <p className="text-xs text-gray-500 mt-1">Results are saved automatically</p>
                        </div>
                      ) : (
                        <>
                          {/* Metric Comparison Table */}
                          <div className="rounded-lg bg-gray-700/50 p-3">
                            <div className="text-xs text-gray-400 mb-2">Metric Comparison</div>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-500 border-b border-gray-600">
                                  <th className="text-left py-1.5 font-medium">Metric</th>
                                  {comparisonHistory.slice(-3).map((r, i) => (
                                    <th key={i} className="text-right py-1.5 font-medium truncate max-w-[80px]">
                                      {r.label.length > 12 ? r.label.slice(0, 12) + '...' : r.label}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-700">
                                {[
                                  { key: 'total_return', label: 'Return', fmt: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, color: (v: number) => v >= 0 ? 'text-emerald-400' : 'text-red-400' },
                                  { key: 'sharpe_ratio', label: 'Sharpe', fmt: (v: number) => v.toFixed(2), color: (v: number) => v > 1 ? 'text-emerald-400' : 'text-amber-400' },
                                  { key: 'max_drawdown', label: 'Drawdown', fmt: (v: number) => `${v.toFixed(1)}%`, color: (v: number) => v > -20 ? 'text-emerald-400' : 'text-red-400' },
                                  { key: 'win_rate', label: 'Win Rate', fmt: (v: number) => `${v.toFixed(0)}%`, color: (v: number) => v > 50 ? 'text-emerald-400' : 'text-amber-400' },
                                  { key: 'total_trades', label: 'Trades', fmt: (v: number) => v.toString(), color: () => 'text-gray-200' },
                                ].map(metric => (
                                  <tr key={metric.key}>
                                    <td className="py-1.5 text-gray-400">{metric.label}</td>
                                    {comparisonHistory.slice(-3).map((r, i) => {
                                      const val = (r as any)[metric.key] ?? 0;
                                      return (
                                        <td key={i} className={`py-1.5 text-right font-medium ${metric.color(val)}`}>
                                          {metric.fmt(val)}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Overlaid Equity Curves */}
                          {comparisonHistory.some(r => r.equity_curve?.length > 0) && (
                            <div className="rounded-lg bg-gray-700/50 p-3">
                              <div className="text-xs text-gray-400 mb-2">Equity Curves (Normalized)</div>
                              <div className="h-32">
                                <ResponsiveContainer width="100%" height="100%">
                                  <AreaChart margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                                    <XAxis dataKey="date" hide />
                                    <YAxis hide />
                                    <Tooltip
                                      content={({ active, payload }) => {
                                        if (active && payload?.length) {
                                          return (
                                            <div className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs">
                                              {payload.map((p: any, i: number) => (
                                                <div key={i} style={{ color: p.color }}>
                                                  ${Number(p.value).toLocaleString()}
                                                </div>
                                              ))}
                                            </div>
                                          );
                                        }
                                        return null;
                                      }}
                                    />
                                    {comparisonHistory.slice(-3).map((r, i) => {
                                      const colors = ['#10b981', '#3b82f6', '#f59e0b'];
                                      return (
                                        <Area
                                          key={i}
                                          data={r.equity_curve}
                                          type="monotone"
                                          dataKey="equity"
                                          stroke={colors[i % colors.length]}
                                          strokeWidth={1.5}
                                          fill="none"
                                          name={r.label}
                                        />
                                      );
                                    })}
                                  </AreaChart>
                                </ResponsiveContainer>
                              </div>
                              {/* Legend */}
                              <div className="flex flex-wrap gap-3 mt-2">
                                {comparisonHistory.slice(-3).map((r, i) => {
                                  const colors = ['#10b981', '#3b82f6', '#f59e0b'];
                                  return (
                                    <div key={i} className="flex items-center gap-1.5 text-xs">
                                      <div className="w-3 h-0.5 rounded" style={{ backgroundColor: colors[i % colors.length] }} />
                                      <span className="text-gray-400 truncate max-w-[100px]">{r.label}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Clear History Button */}
                          <button
                            onClick={() => setComparisonHistory([])}
                            className="w-full py-1.5 text-xs text-gray-500 hover:text-gray-300 transition"
                          >
                            Clear comparison history
                          </button>
                        </>
                      )}
                    </div>
                  ) : null
                ) : (
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                    <Play className="h-10 w-10 text-gray-600 mb-3" />
                    <h3 className="font-semibold text-gray-300 mb-1">Ready to backtest</h3>
                    <p className="text-xs text-gray-500">Click Run to simulate your strategy</p>
                  </div>
                )}
                </ErrorBoundary>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar
        isRunning={isRunning}
        results={results ? {
          total_return: results.total_return,
          sharpe_ratio: results.sharpe_ratio,
          max_drawdown: results.max_drawdown,
          total_trades: results.total_trades,
        } : null}
        lastRunTime={lastRunTime || undefined}
        onExport={results ? handleExportResults : undefined}
      />

      {/* Floating Code Editor Panel - Draggable */}
      {showCodeEditor && (
        <div 
          className="fixed z-50 bg-[#1e1e1e] border border-gray-700 rounded-lg shadow-2xl"
          style={{
            left: editorPosition.x,
            top: editorPosition.y,
            width: editorMinimized ? '200px' : '700px',
            height: editorMinimized ? '36px' : '450px',
            transition: isDragging ? 'none' : 'width 0.2s, height 0.2s',
          }}
        >
          {/* Editor Header - Draggable */}
          <div 
            className={`h-9 bg-gray-800 ${editorMinimized ? 'rounded-lg' : 'rounded-t-lg'} px-3 flex items-center justify-between border-b border-gray-700 cursor-move select-none`}
            onMouseDown={handleMouseDown}
          >
            <div className="flex items-center gap-2 pointer-events-none">
              <FileCode className="h-4 w-4 text-emerald-500" />
              <span className="text-sm text-gray-200 font-medium">strategy.py</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); setEditorMinimized(!editorMinimized); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition"
                title={editorMinimized ? 'Expand' : 'Minimize'}
              >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${editorMinimized ? 'rotate-180' : ''}`} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowCodeEditor(false); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition"
                title="Close"
              >
                <span className="text-sm leading-none">×</span>
              </button>
            </div>
          </div>
          
          {/* Editor Content */}
          {!editorMinimized && (
            <div style={{ height: '414px' }} className="rounded-b-lg overflow-hidden">
              <ErrorBoundary label="Code Editor">
                <CodeEditor value={code} onChange={setCode} />
              </ErrorBoundary>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
