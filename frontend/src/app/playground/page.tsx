'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  Play, 
  Save, 
  Check,
  RotateCcw, 
  Loader2, 
  BarChart3, 
  TrendingUp,
  TrendingDown,
  Calendar,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Activity,
  Target,
  FileCode,
  Percent,
  Scale,
  PanelLeftClose,
  PanelRightClose,
  Copy,
  Pencil,
  Trash2,
  RefreshCw,
  Plus,
  GitBranch,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import CodeEditor from '@/components/playground/CodeEditor';
import AssetChart, { TradeMarker } from '@/components/playground/AssetChart';
import ErrorBoundary from '@/components/ErrorBoundary';
import TradeLog from '@/components/playground/TradeLog';
import StatusBar from '@/components/playground/StatusBar';
import AssetSelector from '@/components/playground/AssetSelector';
import ConfigSelect from '@/components/playground/ConfigSelect';
import api from '@/lib/api';
import type { BacktestTrade, EquityCurvePoint, DrawdownPoint, Strategy } from '@/types';
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

function formatRelativeTime(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// Strategy Templates
const STRATEGY_TEMPLATES = {
  sma_crossover: {
    name: 'SMA Crossover',
    description: 'Buy when fast MA crosses above slow MA',
    code: `# SMA Crossover Strategy

class MyStrategy(StrategyBase):
    """
    Simple Moving Average Crossover
    Buy when fast SMA crosses above slow SMA, sell when it crosses below
    """
    def on_init(self):
        self.params.setdefault('fast', 10)
        self.params.setdefault('slow', 30)

    def _sma(self, closes, period):
        if len(closes) < period:
            return None
        return sum(closes[-period:]) / period

    def on_data(self, bar):
        fast = self.params['fast']
        slow = self.params['slow']
        hist = self.history(bar.symbol, slow + 1)
        if len(hist) < slow + 1:
            return
        closes = [b.close for b in hist]

        fast_now = self._sma(closes, fast)
        slow_now = self._sma(closes, slow)
        fast_prev = self._sma(closes[:-1], fast)
        slow_prev = self._sma(closes[:-1], slow)

        if None in (fast_now, slow_now, fast_prev, slow_prev):
            return

        if self.is_flat(bar.symbol):
            if fast_prev <= slow_prev and fast_now > slow_now:
                qty = max(1, int(self.portfolio.cash * 0.95 / bar.close))
                self.market_order(bar.symbol, qty)
        elif self.is_long(bar.symbol):
            if fast_prev >= slow_prev and fast_now < slow_now:
                self.close_position(bar.symbol)
`,
  },
  mean_reversion: {
    name: 'Mean Reversion',
    description: 'Buy oversold, sell overbought using Bollinger Bands',
    code: `# Mean Reversion Strategy
import statistics

class MyStrategy(StrategyBase):
    """
    Mean Reversion using Bollinger Bands
    Buy when price touches lower band, sell at middle band
    """
    def on_init(self):
        self.params.setdefault('period', 20)
        self.params.setdefault('devfactor', 2.0)

    def on_data(self, bar):
        period = self.params['period']
        devfactor = self.params['devfactor']
        hist = self.history(bar.symbol, period)
        if len(hist) < period:
            return
        closes = [b.close for b in hist]

        mid = sum(closes) / period
        std = statistics.stdev(closes) if period > 1 else 0
        lower = mid - devfactor * std

        if self.is_flat(bar.symbol):
            if bar.close < lower:
                qty = max(1, int(self.portfolio.cash * 0.95 / bar.close))
                self.market_order(bar.symbol, qty)
        elif self.is_long(bar.symbol):
            if bar.close > mid:
                self.close_position(bar.symbol)
`,
  },
  momentum: {
    name: 'Momentum',
    description: 'Follow the trend using Rate of Change',
    code: `# Momentum Strategy

class MyStrategy(StrategyBase):
    """
    Momentum Strategy using Rate of Change
    Buy when ROC > threshold, sell when ROC < -threshold
    """
    def on_init(self):
        self.params.setdefault('period', 14)
        self.params.setdefault('threshold', 5)

    def on_data(self, bar):
        period = self.params['period']
        threshold = self.params['threshold']
        hist = self.history(bar.symbol, period + 1)
        if len(hist) < period + 1:
            return

        close_now = hist[-1].close
        close_ago = hist[0].close
        if close_ago == 0:
            return
        roc = (close_now - close_ago) / close_ago * 100

        if self.is_flat(bar.symbol):
            if roc > threshold:
                qty = max(1, int(self.portfolio.cash * 0.95 / bar.close))
                self.market_order(bar.symbol, qty)
        elif self.is_long(bar.symbol):
            if roc < -threshold:
                self.close_position(bar.symbol)
`,
  },
  rsi_strategy: {
    name: 'RSI Strategy',
    description: 'Buy oversold (RSI<30), sell overbought (RSI>70)',
    code: `# RSI Strategy

class MyStrategy(StrategyBase):
    """
    RSI Overbought/Oversold Strategy
    Buy when RSI < oversold, sell when RSI > overbought
    Uses Wilder's smoothing for RSI calculation
    """
    def on_init(self):
        self.params.setdefault('period', 14)
        self.params.setdefault('oversold', 30)
        self.params.setdefault('overbought', 70)

    def _rsi(self, closes, period):
        if len(closes) < period + 1:
            return None
        deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
        gains = [d if d > 0 else 0 for d in deltas]
        losses = [-d if d < 0 else 0 for d in deltas]
        avg_gain = sum(gains[:period]) / period
        avg_loss = sum(losses[:period]) / period
        for i in range(period, len(deltas)):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        if avg_loss == 0:
            return 100
        rs = avg_gain / avg_loss
        return 100 - (100 / (1 + rs))

    def on_data(self, bar):
        period = self.params['period']
        hist = self.history(bar.symbol, period * 3)
        if len(hist) < period * 3:
            return
        closes = [b.close for b in hist]
        rsi = self._rsi(closes, period)
        if rsi is None:
            return

        if self.is_flat(bar.symbol):
            if rsi < self.params['oversold']:
                qty = max(1, int(self.portfolio.cash * 0.95 / bar.close))
                self.market_order(bar.symbol, qty)
        elif self.is_long(bar.symbol):
            if rsi > self.params['overbought']:
                self.close_position(bar.symbol)
`,
  },
  macd_strategy: {
    name: 'MACD Strategy',
    description: 'Trade MACD crossovers with signal line',
    code: `# MACD Strategy

class MyStrategy(StrategyBase):
    """
    MACD Crossover Strategy
    Buy when MACD crosses above signal line, sell when below
    """
    def on_init(self):
        self.params.setdefault('fast', 12)
        self.params.setdefault('slow', 26)
        self.params.setdefault('signal', 9)

    def _ema_series(self, values, period):
        if len(values) < period:
            return []
        k = 2 / (period + 1)
        emas = [sum(values[:period]) / period]
        for v in values[period:]:
            emas.append(v * k + emas[-1] * (1 - k))
        return emas

    def on_data(self, bar):
        fast = self.params['fast']
        slow = self.params['slow']
        signal_p = self.params['signal']
        need = slow + signal_p + 1
        hist = self.history(bar.symbol, need)
        if len(hist) < need:
            return
        closes = [b.close for b in hist]

        fast_ema = self._ema_series(closes, fast)
        slow_ema = self._ema_series(closes, slow)
        if len(slow_ema) < 2:
            return

        macd_vals = [fast_ema[slow - fast + i] - slow_ema[i]
                     for i in range(len(slow_ema))]
        signal_ema = self._ema_series(macd_vals, signal_p)
        if len(signal_ema) < 2:
            return

        macd_now = macd_vals[-1]
        macd_prev = macd_vals[-2]
        sig_now = signal_ema[-1]
        sig_prev = signal_ema[-2]

        if self.is_flat(bar.symbol):
            if macd_prev <= sig_prev and macd_now > sig_now:
                qty = max(1, int(self.portfolio.cash * 0.95 / bar.close))
                self.market_order(bar.symbol, qty)
        elif self.is_long(bar.symbol):
            if macd_prev >= sig_prev and macd_now < sig_now:
                self.close_position(bar.symbol)
`,
  },
  breakout: {
    name: 'Donchian Breakout',
    description: 'Buy breakout above highest high, sell below lowest low',
    code: `# Donchian Channel Breakout Strategy

class MyStrategy(StrategyBase):
    """
    Donchian Channel Breakout
    Buy when price breaks above the N-period high
    Sell when price drops below the exit-period low
    """
    def on_init(self):
        self.params.setdefault('period', 20)
        self.params.setdefault('exit_period', 10)

    def on_data(self, bar):
        period = self.params['period']
        exit_period = self.params['exit_period']
        need = max(period, exit_period) + 1
        hist = self.history(bar.symbol, need)
        if len(hist) < need:
            return

        entry_highs = [b.high for b in hist[-(period + 1):-1]]
        highest = max(entry_highs)
        exit_lows = [b.low for b in hist[-(exit_period + 1):-1]]
        lowest = min(exit_lows)

        if self.is_flat(bar.symbol):
            if bar.close > highest:
                qty = max(1, int(self.portfolio.cash * 0.95 / bar.close))
                self.market_order(bar.symbol, qty)
        elif self.is_long(bar.symbol):
            if bar.close < lowest:
                self.close_position(bar.symbol)
`,
  },
  vwap_reversion: {
    name: 'VWAP Reversion',
    description: 'Mean reversion to volume-weighted average price',
    code: `# VWAP Mean Reversion Strategy
import statistics

class MyStrategy(StrategyBase):
    """
    VWAP Mean Reversion
    Approximates VWAP using typical price weighted by volume
    Buys when price is N std devs below VWAP, sells at VWAP
    """
    def on_init(self):
        self.params.setdefault('period', 20)
        self.params.setdefault('num_std', 2.0)

    def on_data(self, bar):
        period = self.params['period']
        num_std = self.params['num_std']
        hist = self.history(bar.symbol, period)
        if len(hist) < period:
            return

        tp_vol = sum((b.high + b.low + b.close) / 3 * b.volume for b in hist)
        total_vol = sum(b.volume for b in hist)
        if total_vol == 0:
            return
        vwap = tp_vol / total_vol

        typicals = [(b.high + b.low + b.close) / 3 for b in hist]
        std = statistics.stdev(typicals) if len(typicals) > 1 else 0

        if self.is_flat(bar.symbol):
            if bar.close < vwap - num_std * std:
                qty = max(1, int(self.portfolio.cash * 0.95 / bar.close))
                self.market_order(bar.symbol, qty)
        elif self.is_long(bar.symbol):
            if bar.close > vwap:
                self.close_position(bar.symbol)
`,
  },
  dual_momentum: {
    name: 'Dual Momentum',
    description: 'Combine absolute and relative momentum signals',
    code: `# Dual Momentum Strategy

class MyStrategy(StrategyBase):
    """
    Dual Momentum
    Buy when both absolute momentum (ROC > 0) and
    relative momentum (ROC > threshold) are positive
    """
    def on_init(self):
        self.params.setdefault('lookback', 90)
        self.params.setdefault('threshold', 2.0)

    def on_data(self, bar):
        lookback = self.params['lookback']
        threshold = self.params['threshold']
        hist = self.history(bar.symbol, lookback + 1)
        if len(hist) < lookback + 1:
            return

        close_now = hist[-1].close
        close_ago = hist[0].close
        if close_ago == 0:
            return
        roc = (close_now - close_ago) / close_ago * 100

        abs_mom = roc > 0
        rel_mom = roc > threshold

        if self.is_flat(bar.symbol):
            if abs_mom and rel_mom:
                qty = max(1, int(self.portfolio.cash * 0.95 / bar.close))
                self.market_order(bar.symbol, qty)
        elif self.is_long(bar.symbol):
            if not abs_mom:
                self.close_position(bar.symbol)
`,
  },
  turtle_trading: {
    name: 'Turtle Trading',
    description: 'Classic turtle system with channel breakouts and ATR sizing',
    code: `# Turtle Trading Strategy

class MyStrategy(StrategyBase):
    """
    Turtle Trading System
    Entry: N-period high breakout with ATR-based sizing
    Exit: Shorter period low breakout
    """
    def on_init(self):
        self.params.setdefault('entry_period', 20)
        self.params.setdefault('exit_period', 10)
        self.params.setdefault('atr_period', 14)

    def _atr(self, hist, period):
        if len(hist) < period + 1:
            return None
        trs = []
        for i in range(1, len(hist)):
            h, l, pc = hist[i].high, hist[i].low, hist[i - 1].close
            trs.append(max(h - l, abs(h - pc), abs(l - pc)))
        return sum(trs[-period:]) / period

    def on_data(self, bar):
        entry_p = self.params['entry_period']
        exit_p = self.params['exit_period']
        atr_p = self.params['atr_period']
        need = max(entry_p, exit_p, atr_p) + 1
        hist = self.history(bar.symbol, need)
        if len(hist) < need:
            return

        entry_highs = [b.high for b in hist[-(entry_p + 1):-1]]
        highest = max(entry_highs)
        exit_lows = [b.low for b in hist[-(exit_p + 1):-1]]
        lowest = min(exit_lows)
        atr = self._atr(hist, atr_p)

        if self.is_flat(bar.symbol):
            if bar.close > highest:
                if atr and atr > 0:
                    risk = self.portfolio.equity * 0.01
                    qty = max(1, int(risk / atr))
                else:
                    qty = max(1, int(self.portfolio.cash * 0.95 / bar.close))
                self.market_order(bar.symbol, qty)
        elif self.is_long(bar.symbol):
            if bar.close < lowest:
                self.close_position(bar.symbol)
`,
  },
  bollinger_squeeze: {
    name: 'Bollinger Squeeze',
    description: 'Trade volatility contraction breakouts',
    code: `# Bollinger Squeeze Strategy
import statistics

class MyStrategy(StrategyBase):
    """
    Bollinger Squeeze (Volatility Breakout)
    Detects when Bollinger Bands narrow inside Keltner Channels
    Enters long on squeeze release when momentum is positive
    """
    def on_init(self):
        self.params.setdefault('bb_period', 20)
        self.params.setdefault('kc_period', 20)
        self.params.setdefault('kc_mult', 1.5)

    def _ema(self, values, period):
        if len(values) < period:
            return None
        k = 2 / (period + 1)
        ema = sum(values[:period]) / period
        for v in values[period:]:
            ema = v * k + ema * (1 - k)
        return ema

    def _atr(self, hist, period):
        if len(hist) < period + 1:
            return None
        trs = []
        for i in range(1, len(hist)):
            h, l, pc = hist[i].high, hist[i].low, hist[i - 1].close
            trs.append(max(h - l, abs(h - pc), abs(l - pc)))
        return sum(trs[-period:]) / period

    def on_data(self, bar):
        bb_p = self.params['bb_period']
        kc_p = self.params['kc_period']
        kc_mult = self.params['kc_mult']
        need = max(bb_p, kc_p, 13) + 1
        hist = self.history(bar.symbol, need)
        if len(hist) < need:
            return
        closes = [b.close for b in hist]

        bb_closes = closes[-bb_p:]
        bb_mid = sum(bb_closes) / bb_p
        bb_std = statistics.stdev(bb_closes) if bb_p > 1 else 0
        bb_upper = bb_mid + 2 * bb_std
        bb_lower = bb_mid - 2 * bb_std

        kc_ema = self._ema(closes, kc_p)
        atr = self._atr(hist, kc_p)
        if kc_ema is None or atr is None:
            return
        kc_upper = kc_ema + kc_mult * atr
        kc_lower = kc_ema - kc_mult * atr

        mom = (closes[-1] - closes[-13]) / closes[-13] * 100 if closes[-13] != 0 else 0

        squeeze = bb_lower > kc_lower and bb_upper < kc_upper

        if self.is_flat(bar.symbol):
            if not squeeze and mom > 0:
                qty = max(1, int(self.portfolio.cash * 0.95 / bar.close))
                self.market_order(bar.symbol, qty)
        elif self.is_long(bar.symbol):
            if mom < 0:
                self.close_position(bar.symbol)
`,
  },
  rsi_divergence: {
    name: 'RSI Divergence',
    description: 'Detect bullish/bearish divergence between price and RSI',
    code: `# RSI Divergence Strategy

class MyStrategy(StrategyBase):
    """
    RSI Divergence
    Bullish divergence: price makes lower low but RSI makes higher low
    Buys on bullish divergence when RSI is oversold
    """
    def on_init(self):
        self.params.setdefault('rsi_period', 14)
        self.params.setdefault('lookback', 10)
        self.params.setdefault('oversold', 30)

    def _rsi_series(self, closes, period):
        if len(closes) < period + 1:
            return []
        deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
        gains = [d if d > 0 else 0 for d in deltas]
        losses = [-d if d < 0 else 0 for d in deltas]
        avg_gain = sum(gains[:period]) / period
        avg_loss = sum(losses[:period]) / period
        rsi_vals = []
        if avg_loss == 0:
            rsi_vals.append(100.0)
        else:
            rsi_vals.append(100 - 100 / (1 + avg_gain / avg_loss))
        for i in range(period, len(deltas)):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period
            if avg_loss == 0:
                rsi_vals.append(100.0)
            else:
                rsi_vals.append(100 - 100 / (1 + avg_gain / avg_loss))
        return rsi_vals

    def on_data(self, bar):
        rsi_p = self.params['rsi_period']
        lookback = self.params['lookback']
        oversold = self.params['oversold']
        need = rsi_p + lookback + 1
        hist = self.history(bar.symbol, need)
        if len(hist) < need:
            return
        closes = [b.close for b in hist]

        rsi_vals = self._rsi_series(closes, rsi_p)
        if len(rsi_vals) < lookback + 1:
            return

        rsi_now = rsi_vals[-1]
        rsi_window = rsi_vals[-(lookback + 1):-1]
        price_window = [b.close for b in hist[-(lookback + 1):-1]]

        if self.is_flat(bar.symbol):
            price_ll = bar.close < min(price_window)
            rsi_hl = rsi_now > min(rsi_window)
            if price_ll and rsi_hl and rsi_now < oversold:
                qty = max(1, int(self.portfolio.cash * 0.95 / bar.close))
                self.market_order(bar.symbol, qty)
        elif self.is_long(bar.symbol):
            if rsi_now > 50:
                self.close_position(bar.symbol)
`,
  },
  ma_ribbon: {
    name: 'MA Ribbon',
    description: 'Multiple moving averages for trend strength',
    code: `# Moving Average Ribbon Strategy

class MyStrategy(StrategyBase):
    """
    Moving Average Ribbon
    Uses multiple SMAs to gauge trend strength
    Buy when all MAs are aligned bullish, sell when bearish
    """
    def on_init(self):
        self.params.setdefault('shortest', 10)
        self.params.setdefault('longest', 50)
        self.params.setdefault('count', 5)

    def _sma(self, closes, period):
        if len(closes) < period:
            return None
        return sum(closes[-period:]) / period

    def on_data(self, bar):
        shortest = self.params['shortest']
        longest = self.params['longest']
        count = self.params['count']
        hist = self.history(bar.symbol, longest)
        if len(hist) < longest:
            return
        closes = [b.close for b in hist]

        step = max(1, (longest - shortest) // max(count - 1, 1))
        ma_values = []
        for i in range(count):
            period = min(shortest + i * step, longest)
            sma = self._sma(closes, period)
            if sma is None:
                return
            ma_values.append(sma)

        bullish = all(ma_values[i] >= ma_values[i + 1] for i in range(len(ma_values) - 1))
        bearish = all(ma_values[i] <= ma_values[i + 1] for i in range(len(ma_values) - 1))

        if self.is_flat(bar.symbol):
            if bullish:
                qty = max(1, int(self.portfolio.cash * 0.95 / bar.close))
                self.market_order(bar.symbol, qty)
        elif self.is_long(bar.symbol):
            if bearish:
                self.close_position(bar.symbol)
`,
  },
  mean_reversion_z: {
    name: 'Z-Score Mean Reversion',
    description: 'Trade when price deviates N standard deviations from mean',
    code: `# Z-Score Mean Reversion Strategy
import statistics

class MyStrategy(StrategyBase):
    """
    Z-Score Mean Reversion
    Buy when z-score < -threshold (oversold)
    Sell when z-score reverts to mean (z > 0)
    """
    def on_init(self):
        self.params.setdefault('period', 30)
        self.params.setdefault('z_threshold', 2.0)

    def on_data(self, bar):
        period = self.params['period']
        z_thresh = self.params['z_threshold']
        hist = self.history(bar.symbol, period)
        if len(hist) < period:
            return
        closes = [b.close for b in hist]

        sma = sum(closes) / period
        std = statistics.stdev(closes) if period > 1 else 0
        if std == 0:
            return
        z = (bar.close - sma) / std

        if self.is_flat(bar.symbol):
            if z < -z_thresh:
                qty = max(1, int(self.portfolio.cash * 0.95 / bar.close))
                self.market_order(bar.symbol, qty)
        elif self.is_long(bar.symbol):
            if z > 0:
                self.close_position(bar.symbol)
`,
  },
  orb: {
    name: 'Opening Range Breakout',
    description: 'Trade breakouts above/below the opening range (first N bars)',
    code: `# Opening Range Breakout (ORB) Strategy

class MyStrategy(StrategyBase):
    """
    Opening Range Breakout (ORB)
    Defines the opening range as the high/low of the first N bars of each session.
    Goes long when price breaks above the opening range high.
    Exits when price breaks below the opening range low.
    Best used with intraday intervals.
    """
    def on_init(self):
        self.params.setdefault('orb_bars', 5)
        self.params.setdefault('use_atr_filter', 1)
        self.params.setdefault('atr_period', 14)
        self.params.setdefault('atr_mult', 0.5)
        self.bar_count = 0
        self.session_date = None
        self.orb_high = None
        self.orb_low = None
        self.traded_today = False

    def _atr(self, hist, period):
        if len(hist) < period + 1:
            return None
        trs = []
        for i in range(1, len(hist)):
            h, l, pc = hist[i].high, hist[i].low, hist[i - 1].close
            trs.append(max(h - l, abs(h - pc), abs(l - pc)))
        return sum(trs[-period:]) / period

    def on_data(self, bar):
        orb_bars = self.params['orb_bars']
        use_atr = self.params['use_atr_filter']
        atr_p = self.params['atr_period']
        atr_mult = self.params['atr_mult']

        current_date = str(bar.timestamp)[:10]
        if current_date != self.session_date:
            self.session_date = current_date
            self.bar_count = 0
            self.orb_high = None
            self.orb_low = None
            self.traded_today = False

        self.bar_count += 1

        if self.bar_count <= orb_bars:
            if self.orb_high is None or bar.high > self.orb_high:
                self.orb_high = bar.high
            if self.orb_low is None or bar.low < self.orb_low:
                self.orb_low = bar.low
            return

        if self.orb_high is None or self.orb_low is None:
            return

        orb_range = self.orb_high - self.orb_low

        if use_atr:
            hist = self.history(bar.symbol, atr_p + 1)
            atr = self._atr(hist, atr_p)
            if atr and atr > 0 and orb_range < atr_mult * atr:
                return

        if self.is_flat(bar.symbol) and not self.traded_today:
            if bar.close > self.orb_high:
                qty = max(1, int(self.portfolio.cash * 0.95 / bar.close))
                self.market_order(bar.symbol, qty)
                self.traded_today = True

        if self.is_long(bar.symbol):
            if bar.close < self.orb_low:
                self.close_position(bar.symbol)
`,
  },
  custom: {
    name: 'Custom Strategy',
    description: 'Write your own strategy code',
    code: `# Custom Strategy
import math
import numpy as np
import statistics

class MyStrategy(StrategyBase):
    """
    Your custom strategy - modify this code!
    Available: self.history(), self.market_order(), self.close_position(),
    self.is_flat(), self.is_long(), self.portfolio.cash, self.portfolio.equity,
    self.limit_order(), self.stop_order(), self.trailing_stop(), self.cancel_all_orders()
    Bar: bar.symbol, bar.open, bar.high, bar.low, bar.close, bar.volume, bar.timestamp
    """
    def on_init(self):
        pass

    def on_data(self, bar):
        if self.is_flat(bar.symbol):
            qty = max(1, int(self.portfolio.cash * 0.95 / bar.close))
            self.market_order(bar.symbol, qty)
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
  orb: [
    { key: 'orb_bars', label: 'Opening Range Bars', type: 'number', default: 5, min: 1, max: 30, step: 1 },
    { key: 'use_atr_filter', label: 'ATR Filter (0=off, 1=on)', type: 'number', default: 1, min: 0, max: 1, step: 1 },
    { key: 'atr_period', label: 'ATR Period', type: 'number', default: 14, min: 5, max: 50, step: 1 },
    { key: 'atr_mult', label: 'Min Range (ATR Multiple)', type: 'number', default: 0.5, min: 0.1, max: 3.0, step: 0.1 },
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
  interval: '1d' | '1h' | '15m' | '5m' | '1m';
  // Advanced engine settings
  spreadModel: 'auto' | 'none' | 'volatility' | 'fixed_bps';
  slippageModel: 'percentage' | 'volume_aware' | 'none';
  marginEnabled: boolean;
  leverage: number;
  maxDrawdownPct: number;
  maxPositionPct: number;
  warmupBars: number;
  pdtEnabled: boolean;
}

function MetricItem({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  const color = positive === undefined ? 'text-gray-200' : positive ? 'text-emerald-400' : 'text-red-400';
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-[10px] text-gray-500 uppercase">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  );
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
  orders?: Array<{
    order_id: string; symbol: string; side: string; order_type: string;
    quantity: number; filled_quantity: number; avg_fill_price: number;
    commission: number; status: string; created_at: string | null; filled_at: string | null;
  }>;
  expectancy?: number;
  volatility_annual?: number;
  information_ratio?: number;
  beta?: number;
  alpha?: number;
  total_commission?: number;
  total_slippage?: number;
  total_spread_cost?: number;
  cost_as_pct_of_pnl?: number;
  rolling_sharpe?: Array<{date: string; value: number}>;
  rolling_sortino?: Array<{date: string; value: number}>;
  deflated_sharpe_ratio?: number;
  robustness_score?: number;
  risk_violations?: Array<{timestamp: string; rule: string; description: string; action: string}>;
  custom_charts?: Record<string, Array<{date: string; series: string; value: number}>>;
  alerts?: Array<{timestamp: string; level: string; message: string; data?: unknown}>;
}

export default function PlaygroundPage() {
  const { isAuthenticated } = useAuthStore();
  
  const [code, setCode] = useState(DEFAULT_CODE);
  const [selectedTemplate, setSelectedTemplate] = useState<StrategyTemplateKey>('sma_crossover');
  const [strategyMode, setStrategyMode] = useState<'templates' | 'custom'>('templates');
  const [customStrategies, setCustomStrategies] = useState<Strategy[]>([]);
  const [customStrategiesLoading, setCustomStrategiesLoading] = useState(false);
  const [strategyBoxMinimised, setStrategyBoxMinimised] = useState(false);
  const [editingRenameId, setEditingRenameId] = useState<number | null>(null);
  const [renameInputValue, setRenameInputValue] = useState('');

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
    spreadModel: 'auto',
    slippageModel: 'percentage',
    marginEnabled: false,
    leverage: 1,
    maxDrawdownPct: 50,
    maxPositionPct: 100,
    warmupBars: 0,
    pdtEnabled: false,
  });
  const [strategyParams, setStrategyParams] = useState<Record<string, number>>(() => {
    const defaultParams: Record<string, number> = {};
    STRATEGY_PARAMS.sma_crossover.forEach(p => { defaultParams[p.key] = p.default; });
    return defaultParams;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [lastRunTime, setLastRunTime] = useState<string | null>(null);
  const [activeResultsTab, setActiveResultsTab] = useState<'summary' | 'trades' | 'orders' | 'charts' | 'compare' | 'optimize' | 'walkforward' | 'montecarlo' | 'risk' | 'tca' | 'heatmap' | 'distribution'>('summary');
  const [showCostsSection, setShowCostsSection] = useState(true);
  const [showSizingSection, setShowSizingSection] = useState(false);
  const [showRiskSection, setShowRiskSection] = useState(false);
  const [showEngineSection, setShowEngineSection] = useState(false);
  const [additionalSymbols, setAdditionalSymbols] = useState<string[]>([]);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [resultsPanelWidth, setResultsPanelWidth] = useState(320);
  const [isResizingResults, setIsResizingResults] = useState(false);
  const resizeStartRef = useRef<{ x: number; w: number }>({ x: 0, w: 320 });
  const [uiScale, setUiScale] = useState(1); // 0.75–1.25, applied to sidebars only (not chart)
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [editorTab, setEditorTab] = useState<'code' | 'version-control'>('code');
  const [editorMinimized, setEditorMinimized] = useState(false);
  const [editorPosition, setEditorPosition] = useState({ x: 20, y: 300 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Set initial position on mount
  useEffect(() => {
    setEditorPosition({ x: 20, y: window.innerHeight - 470 });
  }, []);
  
  const [isRunning, setIsRunning] = useState(false);
  const runCancelledRef = useRef(false);
  const [results, setResults] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comparisonHistory, setComparisonHistory] = useState<(BacktestResult & { label: string; timestamp: number })[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  // Reuse a single playground strategy to avoid DB pollution
  const [playgroundStrategyId, setPlaygroundStrategyId] = useState<number | null>(null);

  // Advanced analytics state
  const [optimizeResults, setOptimizeResults] = useState<any>(null);
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const [optimizeMethod, setOptimizeMethod] = useState<'grid' | 'bayesian' | 'genetic' | 'multiobjective' | 'heatmap'>('grid');
  const [walkForwardResults, setWalkForwardResults] = useState<any>(null);
  const [walkForwardLoading, setWalkForwardLoading] = useState(false);
  const [monteCarloResults, setMonteCarloResults] = useState<any>(null);
  const [monteCarloLoading, setMonteCarloLoading] = useState(false);
  const [lastBacktestId, setLastBacktestId] = useState<number | null>(null);
  // Optimization constraints
  const [optConstraints, setOptConstraints] = useState<{max_drawdown?: number; min_trades?: number; min_win_rate?: number}>({});
  const [showConstraints, setShowConstraints] = useState(false);
  // Heatmap-specific state
  const [heatmapParamX, setHeatmapParamX] = useState('');
  const [heatmapParamY, setHeatmapParamY] = useState('');
  // Multi-objective state
  const [multiObjMetrics, setMultiObjMetrics] = useState<[string, string]>(['sharpe_ratio', 'max_drawdown']);
  // Version history state
  const [versionList, setVersionList] = useState<Array<{id: number; version: number; commit_message: string | null; created_at: string | null; code_preview: string}>>([]);
  const [versionLoading, setVersionLoading] = useState(false);
  const [versionListHasMore, setVersionListHasMore] = useState(false);
  const [commitMessageInput, setCommitMessageInput] = useState('');
  const [lastEditorSaveTime, setLastEditorSaveTime] = useState<number | null>(null);
  const [editorSaveStatus, setEditorSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [selectedChart, setSelectedChart] = useState<'strategy_equity' | 'drawdown' | 'exposure' | 'benchmark' | 'asset_price'>('asset_price');

  // Clear "saved" feedback after a few seconds
  useEffect(() => {
    if (editorSaveStatus !== 'saved') return;
    const t = setTimeout(() => setEditorSaveStatus('idle'), 2500);
    return () => clearTimeout(t);
  }, [editorSaveStatus]);

  // Load version history when editor opens for a custom strategy
  useEffect(() => {
    if (showCodeEditor && strategyMode === 'custom' && playgroundStrategyId) {
      setVersionLoading(true);
      api.listVersions(playgroundStrategyId, 0, 10)
        .then((versions) => {
          setVersionList(versions);
          setVersionListHasMore(versions.length >= 10);
        })
        .catch(() => { setVersionList([]); setVersionListHasMore(false); })
        .finally(() => setVersionLoading(false));
    }
  }, [showCodeEditor, strategyMode, playgroundStrategyId]);
  
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

    if (strategyMode === 'custom' && !playgroundStrategyId) {
      setError('Select a strategy to run');
      return;
    }

    setIsRunning(true);
    setError(null);
    setResults(null);
    setActiveResultsTab('summary');
    runCancelledRef.current = false;
    const startTime = Date.now();

    try {
      // Pass code inline when using templates; strategy_id only when custom strategy selected
      const useCustomStrategy = strategyMode === 'custom' && playgroundStrategyId;

      const backtestConfig = {
        symbol: config.symbol,
        symbols: additionalSymbols.length > 0 ? additionalSymbols : undefined,
        start_date: config.startDate,
        end_date: config.endDate,
        initial_capital: config.initialCapital,
        slippage: config.slippage / 100,
        commission: config.commission / 100,
        parameters: {
          ...strategyParams,
          spread_model: config.spreadModel,
          slippage_model: config.slippageModel,
          margin_enabled: config.marginEnabled,
          leverage: config.leverage,
          max_drawdown_pct: config.maxDrawdownPct,
          max_position_pct: config.maxPositionPct,
          warmup_bars: config.warmupBars,
          pdt_enabled: config.pdtEnabled,
        },
        sizing_method: config.sizingMethod,
        sizing_value: config.sizingValue,
        stop_loss_pct: config.stopLossPct,
        take_profit_pct: config.takeProfitPct,
        benchmark_symbol: config.benchmarkSymbol,
        interval: config.interval,
      };

      // Timeout createBacktest to prevent infinite hang (e.g. network/server issues)
      const CREATE_TIMEOUT_MS = 30000; // 30 seconds
      const createPromise = useCustomStrategy
        ? api.createBacktest({ ...backtestConfig, strategy_id: playgroundStrategyId! })
        : api.createBacktestWithCode({ ...backtestConfig, code });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out. Check your connection and try again.')), CREATE_TIMEOUT_MS)
      );
      const backtest = await Promise.race([createPromise, timeoutPromise]);

      let attempts = 0;
      const maxAttempts = 120; // 2 minutes polling
      
      while (attempts < maxAttempts) {
        if (runCancelledRef.current) {
          setError('Cancelled');
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        let result;
        try {
          result = await api.getBacktest(backtest.id);
        } catch (pollErr: unknown) {
          const msg = pollErr instanceof Error ? pollErr.message : 'Failed to fetch backtest status';
          setError(`Network error: ${msg}. You can retry.`);
          break;
        }
        
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
            orders: r?.orders ?? undefined,
            expectancy: r?.expectancy ?? undefined,
            volatility_annual: r?.volatility_annual ?? undefined,
            information_ratio: r?.information_ratio ?? undefined,
            beta: r?.beta ?? undefined,
            alpha: r?.alpha ?? undefined,
            total_commission: r?.total_commission ?? undefined,
            total_slippage: r?.total_slippage ?? undefined,
            total_spread_cost: r?.total_spread_cost ?? undefined,
            cost_as_pct_of_pnl: r?.cost_as_pct_of_pnl ?? undefined,
            rolling_sharpe: r?.rolling_sharpe ?? undefined,
            rolling_sortino: r?.rolling_sortino ?? undefined,
            deflated_sharpe_ratio: r?.deflated_sharpe_ratio ?? undefined,
            robustness_score: r?.robustness_score ?? undefined,
            risk_violations: r?.risk_violations ?? undefined,
            custom_charts: r?.custom_charts ?? undefined,
            alerts: r?.alerts ?? undefined,
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
      
      if (attempts >= maxAttempts && !runCancelledRef.current) {
        setError('Backtest timed out (2 min). The server may be slow. You can retry.');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to run backtest');
    } finally {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      setLastRunTime(`${elapsed}s`);
      setIsRunning(false);
    }
  }, [isAuthenticated, code, config, strategyParams, selectedTemplate, playgroundStrategyId, strategyMode]);

  const handleCancelBacktest = useCallback(() => {
    runCancelledRef.current = true;
  }, []);

  const handleRetryBacktest = useCallback(() => {
    setError(null);
    handleRunBacktest();
  }, [handleRunBacktest]);

  const handleRunOptimization = useCallback(async () => {
    const paramDefs = STRATEGY_PARAMS[selectedTemplate];
    if (paramDefs.length === 0) return;
    setOptimizeLoading(true);
    setOptimizeResults(null);
    try {
      const activeConstraints = showConstraints && Object.keys(optConstraints).length > 0 ? optConstraints : undefined;
      const basePayload = {
        ...(playgroundStrategyId ? { strategy_id: playgroundStrategyId } : { code }),
        symbol: config.symbol,
        start_date: config.startDate,
        end_date: config.endDate,
        initial_capital: config.initialCapital,
        commission: config.commission / 100,
        slippage: config.slippage / 100,
        interval: config.interval,
      };

      const buildRanges = () => {
        const ranges: Record<string, {low: number; high: number; step?: number; type?: string}> = {};
        for (const p of paramDefs) {
          ranges[p.key] = {
            low: p.min ?? 0,
            high: p.max ?? 999,
            step: p.step,
            type: (p.step ?? 1) % 1 === 0 ? 'int' : 'float',
          };
        }
        return ranges;
      };

      const pollResult = async (task_id: string) => {
        for (let i = 0; i < 120; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const res = await api.getOptimizationResult(task_id);
          if (res.status === 'completed') { setOptimizeResults(res); return; }
          else if (res.status === 'failed') { setOptimizeResults({ error: res.error }); return; }
        }
      };

      if (optimizeMethod === 'bayesian') {
        const ranges = buildRanges();
        if (Object.keys(ranges).length === 0) return;
        const { task_id } = await api.runBayesianOptimization({
          ...basePayload,
          param_ranges: ranges, n_trials: 50, objective_metric: 'sharpe_ratio',
          constraints: activeConstraints,
        });
        await pollResult(task_id);

      } else if (optimizeMethod === 'genetic') {
        const ranges = buildRanges();
        if (Object.keys(ranges).length === 0) return;
        const { task_id } = await api.runGeneticOptimization({
          ...basePayload,
          param_ranges: ranges, population_size: 50, n_generations: 20,
          objective_metric: 'sharpe_ratio',
          constraints: activeConstraints,
        });
        await pollResult(task_id);

      } else if (optimizeMethod === 'multiobjective') {
        const ranges = buildRanges();
        if (Object.keys(ranges).length === 0) return;
        const { task_id } = await api.runMultiObjectiveOptimization({
          ...basePayload,
          param_ranges: ranges, n_trials: 50,
          objective_metrics: [multiObjMetrics[0], multiObjMetrics[1]],
          directions: [multiObjMetrics[0] === 'max_drawdown' ? 'minimize' : 'maximize', multiObjMetrics[1] === 'max_drawdown' ? 'minimize' : 'maximize'],
          constraints: activeConstraints,
        });
        await pollResult(task_id);

      } else if (optimizeMethod === 'heatmap') {
        if (!heatmapParamX || !heatmapParamY || heatmapParamX === heatmapParamY) {
          setOptimizeResults({ error: 'Select two different parameters for the heatmap' });
          return;
        }
        const px = paramDefs.find(p => p.key === heatmapParamX);
        const py = paramDefs.find(p => p.key === heatmapParamY);
        if (!px || !py) return;
        const { task_id } = await api.runHeatmap({
          ...basePayload,
          param_x: heatmapParamX, param_y: heatmapParamY,
          x_range: { low: px.min ?? 0, high: px.max ?? 100, steps: 15 },
          y_range: { low: py.min ?? 0, high: py.max ?? 100, steps: 15 },
          metric: 'sharpe_ratio',
          constraints: activeConstraints,
        });
        await pollResult(task_id);

      } else {
        // Grid search
        const grid: Record<string, number[]> = {};
        for (const p of paramDefs) {
          const current = strategyParams[p.key] ?? p.default;
          const step = p.step ?? 1;
          const vals: number[] = [];
          for (let i = -2; i <= 2; i++) {
            const v = +(current + i * step * 2).toFixed(4);
            if (v >= (p.min ?? 0) && v <= (p.max ?? 999)) vals.push(v);
          }
          if (vals.length > 0) grid[p.key] = [...new Set(vals)];
        }
        if (Object.keys(grid).length === 0) return;
        const { task_id } = await api.runOptimization({
          ...basePayload,
          param_grid: grid, constraints: activeConstraints,
        });
        await pollResult(task_id);
      }
    } catch (err: any) {
      setOptimizeResults({ error: err.message });
    } finally {
      setOptimizeLoading(false);
    }
  }, [playgroundStrategyId, selectedTemplate, strategyParams, config, code, optimizeMethod, optConstraints, showConstraints, heatmapParamX, heatmapParamY, multiObjMetrics]);

  const handleRunWalkForward = useCallback(async () => {
    const useCode = strategyMode === 'templates';
    if (!playgroundStrategyId && !useCode) return;
    setWalkForwardLoading(true);
    setWalkForwardResults(null);
    try {
      const { task_id } = await api.runWalkForward({
        ...(playgroundStrategyId ? { strategy_id: playgroundStrategyId } : { code }),
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
  }, [playgroundStrategyId, strategyMode, code, config]);

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
    for (const p of paramDefs) {
      const val = params[p.key] ?? p.default;
      const regex = new RegExp(`self\\.params\\.setdefault\\('${p.key}',\\s*[^)]+\\)`, 'g');
      templateCode = templateCode.replace(regex, `self.params.setdefault('${p.key}', ${val})`);
    }
    return templateCode;
  };

  const handleTemplateChange = (templateKey: StrategyTemplateKey) => {
    setSelectedTemplate(templateKey);
    setCode(STRATEGY_TEMPLATES[templateKey].code);
    const defaultParams: Record<string, number> = {};
    STRATEGY_PARAMS[templateKey].forEach(p => { defaultParams[p.key] = p.default; });
    setStrategyParams(defaultParams);
  };

  const handleCustomStrategySelect = async (value: string) => {
    setSelectedTemplate('custom');
    const id = parseInt(value, 10);
    if (isNaN(id)) return;
    try {
      const strategy = await api.getStrategy(id);
      setCode(strategy.code);
      setPlaygroundStrategyId(strategy.id);
      setStrategyParams((strategy.parameters as Record<string, number>) || {});
    } catch {
      setCode(STRATEGY_TEMPLATES.custom.code);
      setPlaygroundStrategyId(null);
    }
  };

  const handleCreateNewStrategy = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const strat = await api.createStrategy({
        title: 'New Strategy',
        code: STRATEGY_TEMPLATES.custom.code,
        parameters: {},
        is_public: false,
      });
      setCustomStrategies(prev => [strat, ...prev]);
      setPlaygroundStrategyId(strat.id);
      setCode(strat.code);
      setStrategyParams({});
      setSelectedTemplate('custom');
    } catch {
      setError('Failed to create strategy');
    }
  }, [isAuthenticated]);

  const refetchCustomStrategies = useCallback(async () => {
    if (!isAuthenticated) return;
    setCustomStrategiesLoading(true);
    try {
      const list = await api.getMyStrategies();
      setCustomStrategies(list);
      setDeletedStrategyIds(prev => new Set([...prev].filter(id => list.some(s => s.id === id))));
    } catch {
      setCustomStrategies([]);
    } finally {
      setCustomStrategiesLoading(false);
    }
  }, [isAuthenticated]);

  const [deletedStrategyIds, setDeletedStrategyIds] = useState<Set<number>>(new Set());
  const displayedCustomStrategies = useMemo(
    () => customStrategies.filter(s => !deletedStrategyIds.has(s.id)),
    [customStrategies, deletedStrategyIds]
  );

  const prevStrategyModeRef = useRef<'templates' | 'custom'>('templates');
  useEffect(() => {
    if (strategyMode === 'custom' && isAuthenticated && prevStrategyModeRef.current !== 'custom') {
      refetchCustomStrategies();
      prevStrategyModeRef.current = 'custom';
    } else if (strategyMode !== 'custom') {
      prevStrategyModeRef.current = strategyMode;
    }
  }, [strategyMode, isAuthenticated, refetchCustomStrategies]);

  const handleDuplicateStrategy = useCallback(async () => {
    if (!playgroundStrategyId || !isAuthenticated) return;
    const current = displayedCustomStrategies.find(s => s.id === playgroundStrategyId);
    try {
      const strat = await api.createStrategy({
        title: `Copy of ${current?.title ?? 'Strategy'}`,
        code,
        parameters: strategyParams,
        is_public: false,
      });
      setPlaygroundStrategyId(strat.id);
      setCustomStrategies(prev => [strat, ...prev]);
    } catch {}
  }, [playgroundStrategyId, code, strategyParams, displayedCustomStrategies, isAuthenticated]);

  const handleDeleteStrategy = useCallback(async () => {
    if (!playgroundStrategyId) return;
    if (!confirm('Delete this strategy? This cannot be undone.')) return;
    const idToDelete = playgroundStrategyId;
    setPlaygroundStrategyId(null);
    setCode(STRATEGY_TEMPLATES.custom.code);
    setResults(null);
    setCustomStrategies(prev => prev.filter(s => s.id !== idToDelete));
    try {
      await api.deleteStrategy(idToDelete);
    } catch {
      setError('Failed to delete strategy');
    }
  }, [playgroundStrategyId]);

  const startRenameStrategy = useCallback(() => {
    if (!playgroundStrategyId) return;
    const current = displayedCustomStrategies.find(s => s.id === playgroundStrategyId);
    setEditingRenameId(playgroundStrategyId);
    setRenameInputValue(current?.title ?? '');
  }, [playgroundStrategyId, displayedCustomStrategies]);

  const saveRenameStrategy = useCallback(async () => {
    if (!editingRenameId || !renameInputValue.trim()) {
      setEditingRenameId(null);
      return;
    }
    const trimmed = renameInputValue.trim();
    try {
      await api.updateStrategy(editingRenameId, { title: trimmed });
      setCustomStrategies(prev => prev.map(s => s.id === editingRenameId ? { ...s, title: trimmed } : s));
      setEditingRenameId(null);
    } catch {}
  }, [editingRenameId, renameInputValue]);

  const cancelRenameStrategy = useCallback(() => {
    setEditingRenameId(null);
    setRenameInputValue('');
  }, []);

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

  const generateLocalTearsheet = useCallback((r: any) => {
    const ec = JSON.stringify(r.equity_curve || []);
    const dd = JSON.stringify(r.drawdown_series || []);
    const trades = r.trades || [];
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

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tear Sheet</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;background:#0a0a0f;color:#e0e0e0;padding:24px}.c{max-width:1200px;margin:0 auto}h1{font-size:24px;color:#fff;margin-bottom:8px}h2{font-size:18px;color:#a0a0b0;margin:24px 0 12px;border-bottom:1px solid #1a1a2e;padding-bottom:8px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:24px}.m{background:#12121a;border:1px solid #1a1a2e;border-radius:8px;padding:14px}.ml{font-size:11px;color:#666;text-transform:uppercase}.mv{font-size:20px;font-weight:600;margin-top:4px}.pos{color:#10b981}.neg{color:#ef4444}.cc{background:#12121a;border:1px solid #1a1a2e;border-radius:8px;padding:16px;margin-bottom:16px}canvas{width:100%;height:200px}</style></head>
<body><div class="c"><h1>Backtest Report: ${config.symbol}</h1><p style="color:#666;font-size:13px;margin-bottom:24px">${new Date().toISOString().split('T')[0]} · QuantGuild Engine v2</p>
<h2>Performance</h2><div class="g">
<div class="m"><div class="ml">Return</div><div class="mv ${(r.total_return||0)>=0?'pos':'neg'}">${(r.total_return||0).toFixed(2)}%</div></div>
<div class="m"><div class="ml">Sharpe</div><div class="mv">${(r.sharpe_ratio||0).toFixed(4)}</div></div>
<div class="m"><div class="ml">Sortino</div><div class="mv">${(r.sortino_ratio||0).toFixed(4)}</div></div>
<div class="m"><div class="ml">Max Drawdown</div><div class="mv neg">${(r.max_drawdown||0).toFixed(2)}%</div></div>
<div class="m"><div class="ml">Win Rate</div><div class="mv">${(r.win_rate||0).toFixed(1)}%</div></div>
<div class="m"><div class="ml">Trades</div><div class="mv">${r.total_trades||0}</div></div>
<div class="m"><div class="ml">Profit Factor</div><div class="mv">${(r.profit_factor||0).toFixed(2)}</div></div>
<div class="m"><div class="ml">Final Value</div><div class="mv">$${(r.final_value||0).toLocaleString()}</div></div>
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

  // Keyboard shortcut: Cmd/Ctrl + Enter to run backtest
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!isRunning && isAuthenticated && !(strategyMode === 'custom' && !playgroundStrategyId)) {
          handleRunBacktest();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRunning, isAuthenticated, handleRunBacktest, strategyMode, playgroundStrategyId]);

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

  // Resize handle for results panel
  const handleResultsResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingResults(true);
    resizeStartRef.current = { x: e.clientX, w: resultsPanelWidth };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingResults) return;
      const delta = resizeStartRef.current.x - e.clientX; // drag left = positive delta = wider
      const newW = Math.min(600, Math.max(260, resizeStartRef.current.w + delta));
      setResultsPanelWidth(newW);
    };
    const handleMouseUp = () => setIsResizingResults(false);
    if (isResizingResults) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingResults]);

  const daysOfData = Math.round((new Date(config.endDate).getTime() - new Date(config.startDate).getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="h-full flex flex-col bg-gray-900 text-gray-100">
      {/* Top Bar - Title + Run Controls */}
      <div className="h-12 bg-gray-800 border-b border-gray-700 px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-bold text-gray-100">Strategy Playground</h1>
          <span className="text-xs text-gray-500 border-l border-gray-700 pl-4">{config.symbol}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="pg-btn pg-btn-ghost"
            title="Reset"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          {isAuthenticated && (
            <div className="relative">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="pg-btn pg-btn-ghost"
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
          <div className="flex gap-2">
            <button
              onClick={handleRunBacktest}
              disabled={isRunning || (strategyMode === 'custom' && !playgroundStrategyId)}
              className="pg-btn pg-btn-primary"
              title={strategyMode === 'custom' && !playgroundStrategyId ? 'Select a strategy to run' : undefined}
            >
              {isRunning ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Running...</>
              ) : (
                <><Play className="h-4 w-4" /> Run <kbd className="ml-1 px-1 py-0.5 text-[10px] bg-emerald-500 rounded">⌘↵</kbd></>
              )}
            </button>
            {isRunning && (
              <button
                onClick={handleCancelBacktest}
                className="p-2 rounded-md text-gray-400 hover:text-amber-400 hover:bg-amber-900/30 transition-colors"
                title="Cancel backtest"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* QuantConnect-style Metrics Bar (shown when results exist) */}
      {results && (
        <div className="flex-shrink-0 h-10 bg-gray-800/80 border-b border-gray-700 px-4 flex items-center gap-6 overflow-x-auto">
          <MetricItem label="Equity" value={`$${results.final_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} positive />
          <MetricItem label="Return" value={`${results.total_return >= 0 ? '+' : ''}${results.total_return.toFixed(2)}%`} positive={results.total_return >= 0} />
          <MetricItem label="Fees" value={`-$${((results.total_commission ?? 0) + (results.total_slippage ?? 0) + (results.total_spread_cost ?? 0)).toFixed(2)}`} positive={false} />
          <MetricItem label="Holdings" value={`$${results.final_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} positive />
          <MetricItem label="Net Profit" value={`${(results.final_value - results.initial_capital) >= 0 ? '+' : ''}$${(results.final_value - results.initial_capital).toFixed(2)}`} positive={(results.final_value - results.initial_capital) >= 0} />
          <MetricItem label="Sharpe" value={results.sharpe_ratio.toFixed(2)} positive={results.sharpe_ratio > 1} />
          <MetricItem label="Drawdown" value={`${results.max_drawdown.toFixed(1)}%`} positive={results.max_drawdown > -20} />
          <MetricItem label="Trades" value={String(results.total_trades)} />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Configuration */}
        <div
          className="flex flex-col bg-gray-800/95 border-r border-gray-700 transition-all duration-200 flex-shrink-0"
          style={{ width: leftSidebarCollapsed ? 40 : 240, zoom: leftSidebarCollapsed ? 1 : uiScale }}
        >
          <div className="h-11 px-3 flex items-center justify-between border-b border-gray-700 bg-gray-800">
            {!leftSidebarCollapsed && <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Configuration</span>}
              <button
                onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
                className="pg-btn pg-btn-ghost"
              >
              <PanelLeftClose className={`h-4 w-4 transition-transform ${leftSidebarCollapsed ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {!leftSidebarCollapsed && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* Asset Selector - Type then Symbol (QuantConnect style) */}
              <div className="pg-card">
                <div className="pg-section-header">Asset</div>
                <AssetSelector
                  value={config.symbol}
                  onChange={(symbol) => setConfig({ ...config, symbol })}
                />
              </div>

              {/* Strategy Template */}
              <div className="pg-card">
                <div className="flex items-center justify-between mb-2">
                  <div className="pg-section-header mb-0">Strategy Template</div>
                  <div className="flex items-center gap-1">
                    {strategyMode === 'custom' && playgroundStrategyId && (
                      <button
                        type="button"
                        onClick={() => setStrategyBoxMinimised(!strategyBoxMinimised)}
                        className="text-[10px] text-gray-500 hover:text-gray-300 flex items-center gap-0.5"
                        title={strategyBoxMinimised ? 'Expand' : 'Minimise'}
                      >
                        {strategyBoxMinimised ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                      </button>
                    )}
                  </div>
                </div>
                {/* Templates vs Custom switch */}
                <div className="flex rounded-lg bg-gray-700/50 p-0.5 mb-2">
                  <button
                    type="button"
                    onClick={() => { setStrategyMode('templates'); handleTemplateChange('sma_crossover'); }}
                    className={`flex-1 py-1.5 text-[11px] font-medium rounded-md transition-all ${strategyMode === 'templates' ? 'bg-gray-700 text-emerald-400' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    Templates
                  </button>
                  <button
                    type="button"
                    onClick={() => setStrategyMode('custom')}
                    className={`flex-1 py-1.5 text-[11px] font-medium rounded-md transition-all ${strategyMode === 'custom' ? 'bg-gray-700 text-emerald-400' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    Custom
                  </button>
                </div>
                {strategyBoxMinimised && strategyMode === 'custom' && playgroundStrategyId ? (
                  <div className="flex flex-col gap-2">
                    <div className="text-xs text-emerald-400 truncate px-1">
                      {displayedCustomStrategies.find(s => s.id === playgroundStrategyId)?.title ?? 'Strategy'}
                    </div>
                    <button
                      onClick={() => setShowCodeEditor(true)}
                      className="w-full pg-btn pg-btn-secondary justify-center text-xs py-2"
                      title="Open editor"
                    >
                      <FileCode className="h-3.5 w-3.5" />
                      Editor
                    </button>
                  </div>
                ) : strategyMode === 'templates' ? (
                  <ConfigSelect
                    value={selectedTemplate}
                    onChange={(v) => handleTemplateChange(v as StrategyTemplateKey)}
                    options={Object.entries(STRATEGY_TEMPLATES)
                      .filter(([k]) => k !== 'custom')
                      .map(([key, t]) => ({ value: key, label: t.name }))}
                  />
                ) : (
                  <div className="space-y-2">
                    {customStrategiesLoading ? (
                      <div className="text-[10px] text-gray-500 py-1">Loading...</div>
                    ) : displayedCustomStrategies.length > 0 ? (
                      <>
                        <div className="overflow-y-auto overflow-x-hidden space-y-0.5 pr-0.5 shrink-0" style={{ height: 120, maxHeight: 120 }}>
                          {displayedCustomStrategies.map(s => (
                            <div
                              key={s.id}
                              className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors group ${playgroundStrategyId === s.id ? 'bg-gray-700 text-emerald-400' : 'text-gray-300 hover:bg-gray-700/60'}`}
                              onClick={() => handleCustomStrategySelect(String(s.id))}
                            >
                              <span className="flex-1 truncate">{s.title}</span>
                            </div>
                          ))}
                        </div>
                        {displayedCustomStrategies.length > 3 && (
                          <div className="text-[10px] text-gray-500 py-0.5">
                            {displayedCustomStrategies.length} strategies
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-[10px] text-gray-500 py-1">No strategies yet</div>
                    )}
                    <div className="flex items-center gap-2 pt-2 border-t border-gray-700/80">
                      <button
                        type="button"
                        onClick={handleCreateNewStrategy}
                        disabled={!isAuthenticated || customStrategiesLoading}
                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-[11px] font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors"
                        title="Create new strategy"
                      >
                        <Plus className="h-4 w-4 shrink-0" />
                        New strategy
                      </button>
                      <button
                        type="button"
                        onClick={() => refetchCustomStrategies()}
                        disabled={customStrategiesLoading}
                        className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-md text-[11px] text-gray-400 hover:text-gray-200 hover:bg-gray-700/80 border border-gray-600/60 hover:border-gray-500 transition-colors disabled:opacity-50"
                        title="Refresh strategy list"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${customStrategiesLoading ? 'animate-spin' : ''}`} />
                        Refresh
                      </button>
                    </div>
                  </div>
                )}
                {/* Actions - when a custom strategy is selected (hidden when minimised) */}
                {(selectedTemplate === 'custom' || strategyMode === 'custom') && !(strategyBoxMinimised && strategyMode === 'custom' && playgroundStrategyId) && (
                  <div className="mt-2 space-y-1.5">
                    {playgroundStrategyId ? (
                      <>
                        <button
                          onClick={() => setShowCodeEditor(true)}
                          className="w-full pg-btn pg-btn-secondary justify-center text-xs py-2"
                          title="Open editor"
                        >
                          <FileCode className="h-3.5 w-3.5" />
                          Editor
                        </button>
                        <div className="flex gap-1">
                          <button
                            onClick={handleDuplicateStrategy}
                            className="flex-1 pg-btn pg-btn-ghost justify-center py-1.5 text-[10px]"
                            title="Duplicate"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          <button
                            onClick={startRenameStrategy}
                            className="flex-1 pg-btn pg-btn-ghost justify-center py-1.5 text-[10px]"
                            title="Rename"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={handleDeleteStrategy}
                            className="flex-1 pg-btn pg-btn-ghost justify-center py-1.5 text-[10px] text-red-400 hover:text-red-300"
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="text-[10px] text-gray-500 py-1.5 text-center">
                        Select a strategy or click New below
                      </div>
                    )}
                    {editingRenameId && (
                      <div className="mt-2 p-2 rounded-md bg-gray-700/50 space-y-1.5">
                        <div className="text-[10px] text-gray-500">Rename strategy</div>
                        <input
                          type="text"
                          value={renameInputValue}
                          onChange={(e) => setRenameInputValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveRenameStrategy(); if (e.key === 'Escape') cancelRenameStrategy(); }}
                          className="w-full pg-input text-xs py-1.5"
                          placeholder="Strategy name"
                          autoFocus
                        />
                        <div className="flex gap-1">
                          <button onClick={saveRenameStrategy} className="flex-1 pg-btn pg-btn-primary py-1 text-[10px]">Save</button>
                          <button onClick={cancelRenameStrategy} className="flex-1 pg-btn pg-btn-ghost py-1 text-[10px]">Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Strategy Parameters - hidden for custom (user codes params in strategy) */}
              {strategyMode !== 'custom' && STRATEGY_PARAMS[selectedTemplate].length > 0 && (
                <div className="pg-card">
                  <div className="pg-section-header">Strategy Parameters</div>
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
                          className="pg-slider"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Date Range */}
              <div className="pg-card">
                <div className="pg-section-header">Date Range</div>
                <div className="space-y-2">
                  <input
                    type="date"
                    value={config.startDate}
                    onChange={(e) => setConfig({ ...config, startDate: e.target.value })}
                    className="pg-input"
                  />
                  <input
                    type="date"
                    value={config.endDate}
                    onChange={(e) => setConfig({ ...config, endDate: e.target.value })}
                    className="pg-input"
                  />
                </div>
                <div className="text-[11px] text-gray-500 mt-2">{daysOfData} days</div>
              </div>

              {/* Initial Capital */}
              <div className="pg-card">
                <div className="pg-section-header">Initial Capital</div>
                <div className="relative">
                  <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <input
                    type="number"
                    value={config.initialCapital}
                    onChange={(e) => setConfig({ ...config, initialCapital: parseFloat(e.target.value) || 10000 })}
                    className="pg-input pl-8"
                  />
                </div>
              </div>

              {/* Interval */}
              <div className="pg-card">
                <div className="pg-section-header">Interval</div>
                <ConfigSelect
                  value={config.interval}
                  onChange={(v) => setConfig({ ...config, interval: v as BacktestConfig['interval'] })}
                  options={[
                    { value: '1d', label: 'Daily' },
                    { value: '1h', label: 'Hourly' },
                    { value: '15m', label: '15 Minutes' },
                    { value: '5m', label: '5 Minutes' },
                    { value: '1m', label: '1 Minute' },
                  ]}
                />
                {config.interval !== '1d' && (
                  <div className="text-[11px] text-amber-400 mt-1">
                    {config.interval === '1h' ? 'Max ~730 days' : config.interval === '1m' ? 'Max ~7 days' : 'Max ~60 days'}
                  </div>
                )}
              </div>

              {/* Benchmark */}
              <div className="pg-card">
                <div className="pg-section-header">Benchmark</div>
                <ConfigSelect
                  value={config.benchmarkSymbol || ''}
                  onChange={(v) => setConfig({ ...config, benchmarkSymbol: v || null })}
                  options={[
                    { value: '', label: 'Same Symbol (Buy & Hold)' },
                    { value: 'SPY', label: 'SPY - S&P 500' },
                    { value: 'QQQ', label: 'QQQ - Nasdaq 100' },
                    ...(config.symbol !== 'SPY' && config.symbol !== 'QQQ'
                      ? [{ value: config.symbol, label: `${config.symbol} - Buy & Hold` }]
                      : []),
                  ]}
                />
              </div>

              {/* Additional Symbols (Multi-Asset) */}
              <div className="pg-card">
                <div className="pg-section-header">Additional Symbols</div>
                <div className="flex flex-wrap gap-1 mb-1">
                  {additionalSymbols.map(s => (
                    <span key={s} className="pg-chip">
                      {s}
                      <button
                        onClick={() => setAdditionalSymbols(additionalSymbols.filter(x => x !== s))}
                        className="text-gray-500 hover:text-red-400 transition-colors"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                {additionalSymbols.length < 4 && (
                  <ConfigSelect
                    value=""
                    onChange={(v) => {
                      if (v && !additionalSymbols.includes(v) && v !== config.symbol) {
                        setAdditionalSymbols([...additionalSymbols, v]);
                      }
                    }}
                    placeholder="Add symbol..."
                    options={SYMBOLS.filter(s => s.value !== config.symbol && !additionalSymbols.includes(s.value)).map(s => ({
                      value: s.value,
                      label: `${s.value} - ${s.label}`,
                    }))}
                  />
                )}
                <div className="text-[11px] text-gray-500 mt-2">For multi-asset strategies (max 4)</div>
              </div>

              {/* Costs Section */}
              <div className="pg-collapse-card">
                <button
                  onClick={() => setShowCostsSection(!showCostsSection)}
                  className="pg-collapse-card-header"
                >
                  <span>Trading Costs</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showCostsSection ? '' : '-rotate-90'}`} />
                </button>
                {showCostsSection && (
                  <div className="pg-collapse-card-body">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Slippage (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={config.slippage}
                        onChange={(e) => setConfig({ ...config, slippage: parseFloat(e.target.value) || 0 })}
                        className="pg-input pg-input-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Commission (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={config.commission}
                        onChange={(e) => setConfig({ ...config, commission: parseFloat(e.target.value) || 0 })}
                        className="pg-input pg-input-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Position Sizing - hidden for custom strategy (user codes sizing in strategy) */}
              {strategyMode !== 'custom' && (
              <div className="pg-collapse-card">
                <button
                  onClick={() => setShowSizingSection(!showSizingSection)}
                  className="pg-collapse-card-header"
                >
                  <span>Position Sizing</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showSizingSection ? '' : '-rotate-90'}`} />
                </button>
                {showSizingSection && (
                  <div className="pg-collapse-card-body">
                    <ConfigSelect
                      value={config.sizingMethod}
                      onChange={(v) => setConfig({ ...config, sizingMethod: v as BacktestConfig['sizingMethod'], sizingValue: null })}
                      small
                      options={[
                        { value: 'full', label: 'Full Position' },
                        { value: 'percent_equity', label: '% of Equity' },
                        { value: 'fixed_shares', label: 'Fixed Shares' },
                        { value: 'fixed_dollar', label: 'Fixed Dollar' },
                      ]}
                    />
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
                          className="pg-input pg-input-sm"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}

              {/* Risk Management - hidden for custom strategy (user codes risk in strategy) */}
              {strategyMode !== 'custom' && (
              <div className="pg-collapse-card">
                <button
                  onClick={() => setShowRiskSection(!showRiskSection)}
                  className="pg-collapse-card-header"
                >
                  <span>Risk Management</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showRiskSection ? '' : '-rotate-90'}`} />
                </button>
                {showRiskSection && (
                  <div className="pg-collapse-card-body">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Stop Loss (%)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={config.stopLossPct ?? ''}
                        onChange={(e) => setConfig({ ...config, stopLossPct: parseFloat(e.target.value) || null })}
                        placeholder="e.g. 5"
                        className="pg-input pg-input-sm"
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
                        className="pg-input pg-input-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
              )}

              {/* Engine Settings - hidden for custom strategy (user codes engine needs in strategy) */}
              {strategyMode !== 'custom' && (
              <div className="pg-collapse-card">
                <button
                  onClick={() => setShowEngineSection(!showEngineSection)}
                  className="pg-collapse-card-header"
                >
                  <span>Engine Settings</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showEngineSection ? '' : '-rotate-90'}`} />
                </button>
                {showEngineSection && (
                  <div className="pg-collapse-card-body space-y-3">
                    {/* Spread Model */}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Spread Model</label>
                      <ConfigSelect
                        value={config.spreadModel}
                        onChange={(v) => setConfig({ ...config, spreadModel: v as BacktestConfig['spreadModel'] })}
                        small
                        options={[
                          { value: 'auto', label: 'Auto (crypto = volatility)' },
                          { value: 'none', label: 'None (zero spread)' },
                          { value: 'volatility', label: 'Volatility-based' },
                          { value: 'fixed_bps', label: 'Fixed (basis points)' },
                        ]}
                      />
                      <p className="text-[10px] text-gray-600 mt-0.5">Simulates bid/ask spread on fills</p>
                    </div>

                    {/* Slippage Model */}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Slippage Model</label>
                      <ConfigSelect
                        value={config.slippageModel}
                        onChange={(v) => setConfig({ ...config, slippageModel: v as BacktestConfig['slippageModel'] })}
                        small
                        options={[
                          { value: 'percentage', label: 'Percentage (fixed %)' },
                          { value: 'volume_aware', label: 'Volume-Aware (realistic)' },
                          { value: 'none', label: 'None (zero slippage)' },
                        ]}
                      />
                      <p className="text-[10px] text-gray-600 mt-0.5">Volume-aware scales with order size vs bar volume</p>
                    </div>

                    {/* Warm-up Bars */}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Warm-up Bars</label>
                      <input
                        type="number"
                        min={0}
                        value={config.warmupBars}
                        onChange={(e) => setConfig({ ...config, warmupBars: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                        placeholder="0"
                        className="pg-input pg-input-sm"
                      />
                      <p className="text-[10px] text-gray-600 mt-0.5">Bars before strategy trades (indicator warm-up)</p>
                    </div>

                    {/* PDT (Pattern Day Trading) */}
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-gray-500">PDT Rules (US equities)</label>
                      <button
                        onClick={() => setConfig({ ...config, pdtEnabled: !config.pdtEnabled })}
                        className={`pg-toggle ${config.pdtEnabled ? 'pg-toggle-on' : 'pg-toggle-off'}`}
                      >
                        <span className={`pg-toggle-thumb ${config.pdtEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-600">Enforce 3 day-trades / 5 days when equity &lt; $25k</p>

                    {/* Max Drawdown Limit */}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Max Drawdown Limit (%)</label>
                      <input
                        type="number"
                        step="5"
                        min="5"
                        max="100"
                        value={config.maxDrawdownPct}
                        onChange={(e) => setConfig({ ...config, maxDrawdownPct: parseFloat(e.target.value) || 50 })}
                        className="pg-input pg-input-sm"
                      />
                      <p className="text-[10px] text-gray-600 mt-0.5">Auto-liquidates when portfolio drawdown hits this level</p>
                    </div>

                    {/* Max Position Size */}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Max Position Size (%)</label>
                      <input
                        type="number"
                        step="5"
                        min="5"
                        max="100"
                        value={config.maxPositionPct}
                        onChange={(e) => setConfig({ ...config, maxPositionPct: parseFloat(e.target.value) || 100 })}
                        className="pg-input pg-input-sm"
                      />
                      <p className="text-[10px] text-gray-600 mt-0.5">Limits a single position to this % of portfolio</p>
                    </div>

                    {/* Margin / Leverage */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs text-gray-500">Margin Trading</label>
                        <button
                          onClick={() => setConfig({ ...config, marginEnabled: !config.marginEnabled, leverage: config.marginEnabled ? 1 : 2 })}
                          className={`relative inline-flex h-4 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2 focus:ring-offset-gray-900 ${config.marginEnabled ? 'bg-emerald-600' : 'bg-gray-600'}`}
                        >
                          <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transform transition translate-x-0.5 ${config.marginEnabled ? 'translate-x-4' : ''}`} />
                        </button>
                      </div>
                      {config.marginEnabled && (
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Leverage ({config.leverage}x)</label>
                          <input
                            type="range"
                            min="1"
                            max="10"
                            step="0.5"
                            value={config.leverage}
                            onChange={(e) => setConfig({ ...config, leverage: parseFloat(e.target.value) })}
                            className="pg-slider"
                          />
                          <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
                            <span>1x</span>
                            <span>5x</span>
                            <span>10x</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              )}
            </div>
          )}
        </div>

        {/* Main Content - Chart */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="h-full bg-gray-950 relative">
            <ErrorBoundary label="Chart">
              {selectedChart === 'asset_price' ? (
                <AssetChart 
                  symbol={config.symbol} 
                  startDate={config.startDate} 
                  endDate={config.endDate}
                  interval={config.interval}
                  trades={tradeMarkers}
                />
              ) : (selectedChart === 'strategy_equity' || selectedChart === 'drawdown' || selectedChart === 'benchmark') && results ? (
                <div className="h-full w-full p-4">
                  {selectedChart === 'strategy_equity' && equityCurveData.length > 0 && (
                    <div className="h-full min-h-[200px] rounded-lg bg-gray-800/50 border border-gray-700 p-4">
                      <div className="text-xs text-gray-400 mb-2">Strategy Equity</div>
                      <div className="h-[calc(100%-28px)]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={equityCurveData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                            <defs>
                              <linearGradient id="mainEqGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="date" stroke="#6b7280" fontSize={10} />
                            <YAxis stroke="#6b7280" fontSize={10} domain={['dataMin - 100', 'dataMax + 100']} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (active && payload?.[0]) {
                                  const d = payload[0].payload;
                                  return (
                                    <div className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs">
                                      <div className="text-emerald-400">${Number(d.equity).toLocaleString()}</div>
                                      <div className="text-gray-500">{d.date}</div>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Area type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={2} fill="url(#mainEqGrad)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                  {selectedChart === 'drawdown' && drawdownData.length > 0 && (
                    <div className="h-full min-h-[200px] rounded-lg bg-gray-800/50 border border-gray-700 p-4">
                      <div className="text-xs text-gray-400 mb-2">Drawdown</div>
                      <div className="h-[calc(100%-28px)]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={drawdownData.map(d => ({ ...d, dd: -d.drawdown_pct }))} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                            <defs>
                              <linearGradient id="mainDdGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#ef4444" stopOpacity={0} />
                                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.4} />
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="date" stroke="#6b7280" fontSize={10} />
                            <YAxis stroke="#6b7280" fontSize={10} domain={['dataMin - 1', 0]} tickFormatter={(v) => `${v}%`} />
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
                            <Area type="monotone" dataKey="dd" stroke="#ef4444" strokeWidth={2} fill="url(#mainDdGrad)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                  {selectedChart === 'benchmark' && equityCurveData.length > 0 && (
                    <div className="h-full min-h-[200px] rounded-lg bg-gray-800/50 border border-gray-700 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs text-gray-400">Strategy vs Benchmark</div>
                        {results.benchmark_return != null && (
                          <span className="text-[10px] text-gray-500">Benchmark: {results.benchmark_return >= 0 ? '+' : ''}{results.benchmark_return.toFixed(1)}%</span>
                        )}
                      </div>
                      <div className="h-[calc(100%-28px)]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={equityCurveData.map((d, i) => ({
                              ...d,
                              benchmark: equityCurveData[0]?.equity
                                ? equityCurveData[0].equity * (1 + (i / Math.max(equityCurveData.length - 1, 1)) * ((results?.benchmark_return ?? 0) / 100))
                                : d.equity,
                            }))}
                            margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
                          >
                            <defs>
                              <linearGradient id="mainBenchEqGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="date" stroke="#6b7280" fontSize={10} />
                            <YAxis stroke="#6b7280" fontSize={10} domain={['dataMin - 100', 'dataMax + 100']} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (active && payload?.length) {
                                  const d = payload[0]?.payload;
                                  if (!d) return null;
                                  return (
                                    <div className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs">
                                      <div className="text-emerald-400">Strategy: ${Number(d.equity).toLocaleString()}</div>
                                      <div className="text-gray-500">Benchmark: ${Number(d.benchmark).toLocaleString()}</div>
                                      <div className="text-gray-600">{d.date}</div>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Area type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={2} fill="url(#mainBenchEqGrad)" />
                            <Line type="monotone" dataKey="benchmark" stroke="#6b7280" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                  {((selectedChart === 'strategy_equity' && (!results || equityCurveData.length === 0)) ||
                    (selectedChart === 'drawdown' && (!results || drawdownData.length === 0)) ||
                    (selectedChart === 'benchmark' && (!results || equityCurveData.length === 0))) && (
                    <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                      Run a backtest to see {selectedChart === 'strategy_equity' ? 'Strategy Equity' : selectedChart === 'drawdown' ? 'Drawdown' : 'Benchmark'} chart
                    </div>
                  )}
                </div>
              ) : (
                <AssetChart 
                  symbol={config.symbol} 
                  startDate={config.startDate} 
                  endDate={config.endDate}
                  interval={config.interval}
                  trades={tradeMarkers}
                />
              )}
            </ErrorBoundary>
          </div>
        </div>

        {/* Right Sidebar - Results */}
        <div
          className="relative flex flex-col bg-gray-800/95 border-l border-gray-700 flex-shrink-0"
          style={{
            width: rightSidebarCollapsed ? 40 : resultsPanelWidth,
            zoom: rightSidebarCollapsed ? 1 : uiScale,
          }}
        >
          {!rightSidebarCollapsed && (
            <div
              role="separator"
              aria-label="Resize results panel"
              onMouseDown={handleResultsResizeStart}
              className="absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 cursor-col-resize z-10 group flex items-center justify-center"
            >
              <span className="w-0.5 h-8 rounded-full bg-gray-600 group-hover:bg-emerald-400 group-active:bg-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </div>
          )}
          <div className="h-11 px-3 flex items-center justify-between border-b border-gray-700 bg-gray-800">
            <button
              onClick={() => setRightSidebarCollapsed(!rightSidebarCollapsed)}
              className="pg-btn pg-btn-ghost"
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
              {/* Chart selector - segmented buttons */}
              <div className="p-2 border-b border-gray-700">
                <div className="text-[10px] text-gray-500 mb-1.5 font-medium">Chart</div>
                <div className="flex rounded-lg bg-gray-700/50 p-0.5 gap-0.5">
                  {[
                    { value: 'asset_price' as const, label: 'Price', icon: Activity },
                    { value: 'strategy_equity' as const, label: 'Equity', icon: TrendingUp },
                    { value: 'drawdown' as const, label: 'DD', icon: TrendingDown },
                    { value: 'benchmark' as const, label: 'Bench', icon: BarChart3 },
                  ].map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => setSelectedChart(value)}
                      className={`flex-1 min-w-0 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                        selectedChart === value
                          ? 'bg-gray-700 text-emerald-400 shadow'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-600/50'
                      }`}
                    >
                      <Icon className="h-3 w-3 shrink-0" />
                      <span className="truncate">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Results tabs - single segmented container */}
              <div className="p-2 border-b border-gray-700">
                <div className="text-[10px] text-gray-500 font-medium mb-1.5">Results</div>
                <div className="rounded-lg bg-gray-700/50 p-1 space-y-1">
                  <div className="flex gap-0.5">
                    {(['summary', 'trades', 'orders', 'charts'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveResultsTab(tab)}
                        className={`flex-1 min-w-0 px-2 py-1.5 text-[11px] font-medium rounded-md transition-all ${
                          activeResultsTab === tab ? 'bg-gray-700 text-emerald-400 shadow' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-600/50'
                        }`}
                      >
                        {tab === 'summary' ? 'Summary' : tab === 'trades' ? 'Trades' : tab === 'orders' ? 'Orders' : 'Charts'}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-0.5 flex-wrap">
                    {(['tca', 'optimize', 'walkforward', 'montecarlo', 'risk', 'heatmap', 'distribution', 'compare'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveResultsTab(tab)}
                        className={`px-2 py-1.5 text-[11px] font-medium rounded-md transition-all ${
                          activeResultsTab === tab ? 'bg-gray-700 text-emerald-400 shadow' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-600/50'
                        }`}
                      >
                        {({ tca: 'TCA', optimize: 'Optimize', walkforward: 'Walk-Fwd', montecarlo: 'Monte Carlo', risk: 'Risk', heatmap: 'Monthly', distribution: 'Dist.', compare: 'Compare' } as const)[tab]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Ranking & Research Guide (when results exist) */}
              {results && (
                <div className="p-2 border-b border-gray-700">
                  <div className="flex gap-2">
                    <div className="flex-1 pg-card py-2 px-2 min-w-0">
                      <div className="text-[10px] text-gray-500 mb-1">Sharpe</div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold shrink-0 ${results.sharpe_ratio > 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {results.sharpe_ratio.toFixed(2)}
                        </span>
                        <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden min-w-0">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${Math.min(100, Math.max(0, (results.sharpe_ratio + 2) * 25))}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 pg-card py-2 px-2 min-w-0">
                      <div className="text-[10px] text-gray-500 mb-1">Guide</div>
                      <div className="text-[10px] space-y-0.5">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400 truncate">Backtest</span>
                          <span className="text-emerald-400 shrink-0">OK</span>
                        </div>
                        {results.total_trades < 30 && (
                          <div className="flex justify-between items-center">
                            <span className="text-gray-400 truncate">Sample</span>
                            <span className="text-amber-400 shrink-0">Low</span>
                          </div>
                        )}
                        {results.sharpe_ratio > 2 && (
                          <div className="flex justify-between items-center">
                            <span className="text-gray-400 truncate">Sharpe</span>
                            <span className="text-amber-400 shrink-0">High</span>
                          </div>
                        )}
                        {(!results.total_trades || results.sharpe_ratio <= 2) && results.total_trades >= 30 && (
                          <div className="flex justify-between items-center">
                            <span className="text-gray-400 truncate">Stats</span>
                            <span className="text-emerald-400 shrink-0">OK</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto">
                <ErrorBoundary label="Results">
                {!isAuthenticated ? (
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                    <BarChart3 className="h-10 w-10 text-gray-600 mb-3" />
                    <h3 className="font-semibold text-gray-200 mb-1">Sign in to run backtests</h3>
                    <p className="text-xs text-gray-500 mb-3">Create a free account to test strategies</p>
                    <Link href="/register" className="pg-btn pg-btn-primary">
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
                    <pre className="text-xs text-gray-400 whitespace-pre-wrap text-left bg-gray-900/50 rounded p-2 max-h-40 overflow-y-auto w-full mt-1 mb-4">{error}</pre>
                    <button
                      onClick={handleRetryBacktest}
                      className="pg-btn pg-btn-primary"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Retry
                    </button>
                  </div>
                ) : results ? (
                  activeResultsTab === 'summary' ? (
                    <div className="p-3 space-y-3">
                      {/* Main Return */}
                      <div className={`p-4 rounded-lg border ${results.total_return >= 0 ? 'bg-emerald-900/20 border-emerald-700/60' : 'bg-red-900/20 border-red-700/60'}`}>
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
                        <div className="pg-card">
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
                        <div className="pg-metric-card">
                          <div className="pg-metric-label">
                            <Activity className="h-3 w-3" /> Sharpe
                          </div>
                          <div className={`pg-metric-value ${results.sharpe_ratio > 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {results.sharpe_ratio.toFixed(2)}
                          </div>
                        </div>
                        <div className="pg-metric-card">
                          <div className="pg-metric-label">
                            <TrendingDown className="h-3 w-3" /> Drawdown
                          </div>
                          <div className={`pg-metric-value ${results.max_drawdown > -20 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {results.max_drawdown.toFixed(1)}%
                          </div>
                        </div>
                        <div className="pg-metric-card">
                          <div className="pg-metric-label">
                            <Target className="h-3 w-3" /> Win Rate
                          </div>
                          <div className={`pg-metric-value ${results.win_rate > 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {results.win_rate.toFixed(0)}%
                          </div>
                        </div>
                        <div className="pg-metric-card">
                          <div className="pg-metric-label">
                            <BarChart3 className="h-3 w-3" /> Trades
                          </div>
                          <div className="pg-metric-value text-gray-200">
                            {results.total_trades}
                          </div>
                        </div>
                      </div>
                      
                      {/* Extended Metrics */}
                      {(results.sortino_ratio !== undefined || results.profit_factor !== undefined || results.calmar_ratio !== undefined) && (
                        <div className="grid grid-cols-2 gap-2">
                          {results.sortino_ratio !== undefined && results.sortino_ratio !== null && (
                            <div className="pg-metric-card">
                              <div className="pg-metric-label"><Scale className="h-3 w-3" /> Sortino</div>
                              <div className={`pg-metric-value ${results.sortino_ratio > 1 ? 'text-emerald-400' : 'text-amber-400'}`}>{results.sortino_ratio.toFixed(2)}</div>
                            </div>
                          )}
                          {results.profit_factor !== undefined && results.profit_factor !== null && (
                            <div className="pg-metric-card">
                              <div className="pg-metric-label"><Percent className="h-3 w-3" /> Profit Factor</div>
                              <div className={`pg-metric-value ${results.profit_factor > 1 ? 'text-emerald-400' : 'text-amber-400'}`}>{results.profit_factor.toFixed(2)}</div>
                            </div>
                          )}
                          {results.calmar_ratio !== undefined && results.calmar_ratio !== null && (
                            <div className="pg-metric-card">
                              <div className="pg-metric-label"><Activity className="h-3 w-3" /> Calmar</div>
                              <div className={`pg-metric-value ${results.calmar_ratio > 1 ? 'text-emerald-400' : 'text-amber-400'}`}>{results.calmar_ratio.toFixed(2)}</div>
                            </div>
                          )}
                          {results.exposure_pct !== undefined && results.exposure_pct !== null && (
                            <div className="pg-metric-card">
                              <div className="pg-metric-label"><BarChart3 className="h-3 w-3" /> Exposure</div>
                              <div className="pg-metric-value text-gray-200">{results.exposure_pct.toFixed(1)}%</div>
                            </div>
                          )}
                          {results.avg_trade_duration !== undefined && results.avg_trade_duration !== null && (
                            <div className="pg-metric-card">
                              <div className="pg-metric-label"><Calendar className="h-3 w-3" /> Avg Duration</div>
                              <div className="pg-metric-value text-gray-200">{results.avg_trade_duration.toFixed(1)}d</div>
                            </div>
                          )}
                          {results.max_consecutive_losses !== undefined && results.max_consecutive_losses !== null && (
                            <div className="pg-metric-card">
                              <div className="pg-metric-label"><TrendingDown className="h-3 w-3" /> Max Consec. Losses</div>
                              <div className={`pg-metric-value ${results.max_consecutive_losses <= 3 ? 'text-emerald-400' : 'text-red-400'}`}>{results.max_consecutive_losses}</div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Additional Metrics */}
                      <div className="space-y-2">
                          {/* Robustness Badge */}
                          {results.robustness_score != null && (
                            <div className={`p-3 rounded-lg border ${
                              results.robustness_score >= 70 ? 'bg-emerald-900/20 border-emerald-800' :
                              results.robustness_score >= 40 ? 'bg-amber-900/20 border-amber-800' :
                              'bg-red-900/20 border-red-800'
                            }`}>
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="text-xs text-gray-400">Robustness Score</div>
                                  <div className={`text-xl font-bold ${
                                    results.robustness_score >= 70 ? 'text-emerald-400' :
                                    results.robustness_score >= 40 ? 'text-amber-400' :
                                    'text-red-400'
                                  }`}>
                                    {results.robustness_score.toFixed(0)}/100
                                  </div>
                                </div>
                                <div className={`text-[10px] px-2 py-1 rounded-full font-medium ${
                                  results.robustness_score >= 70 ? 'bg-emerald-900/50 text-emerald-400' :
                                  results.robustness_score >= 40 ? 'bg-amber-900/50 text-amber-400' :
                                  'bg-red-900/50 text-red-400'
                                }`}>
                                  {results.robustness_score >= 70 ? 'Robust' : results.robustness_score >= 40 ? 'Moderate' : 'Fragile'}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Additional Metrics */}
                          <div className="grid grid-cols-2 gap-2">
                            {results.expectancy != null && (
                              <div className="pg-metric-card">
                                <div className="pg-metric-label">Expectancy</div>
                                <div className={`pg-metric-value ${(results.expectancy ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  ${(results.expectancy ?? 0).toFixed(2)}
                                </div>
                              </div>
                            )}
                            {results.volatility_annual != null && (
                              <div className="pg-metric-card">
                                <div className="pg-metric-label">Annual Vol</div>
                                <div className="pg-metric-value text-gray-200">{(results.volatility_annual ?? 0).toFixed(1)}%</div>
                              </div>
                            )}
                            {results.beta != null && (
                              <div className="pg-metric-card">
                                <div className="pg-metric-label">Beta</div>
                                <div className="pg-metric-value text-gray-200">{(results.beta ?? 0).toFixed(2)}</div>
                              </div>
                            )}
                            {results.alpha != null && (
                              <div className="pg-metric-card">
                                <div className="pg-metric-label">Alpha</div>
                                <div className={`pg-metric-value ${(results.alpha ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {(results.alpha ?? 0).toFixed(2)}%
                                </div>
                              </div>
                            )}
                            {results.deflated_sharpe_ratio != null && (
                              <div className="pg-metric-card">
                                <div className="pg-metric-label">Deflated Sharpe</div>
                                <div className="pg-metric-value text-gray-200">{(results.deflated_sharpe_ratio ?? 0).toFixed(2)}</div>
                              </div>
                            )}
                            {results.information_ratio != null && (
                              <div className="pg-metric-card">
                                <div className="pg-metric-label">Info Ratio</div>
                                <div className="pg-metric-value text-gray-200">{(results.information_ratio ?? 0).toFixed(2)}</div>
                              </div>
                            )}
                          </div>

                        </div>
                    </div>
                  ) : activeResultsTab === 'trades' ? (
                    <TradeLog
                      trades={results.trades}
                    />
                  ) : activeResultsTab === 'orders' ? (
                    <div className="p-3 space-y-2">
                      {results.orders && results.orders.length > 0 ? (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-gray-400">{results.orders.length} Orders</span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-500 border-b border-gray-700">
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
                                  <tr key={i} className="border-b border-gray-800 hover:bg-gray-700/30">
                                    <td className={`py-1 px-1 ${order.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {order.side.toUpperCase()}
                                    </td>
                                    <td className="py-1 px-1 text-gray-300">{order.order_type}</td>
                                    <td className="py-1 px-1 text-right text-gray-300">{order.filled_quantity}</td>
                                    <td className="py-1 px-1 text-right text-gray-200">${order.avg_fill_price.toFixed(2)}</td>
                                    <td className="py-1 px-1 text-right text-gray-400">${order.commission.toFixed(2)}</td>
                                    <td className="py-1 px-1">
                                      <span className={`text-[10px] px-1 py-0.5 rounded ${
                                        order.status === 'filled' ? 'bg-emerald-900/50 text-emerald-400' :
                                        order.status === 'cancelled' ? 'bg-amber-900/50 text-amber-400' :
                                        'bg-red-900/50 text-red-400'
                                      }`}>{order.status}</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-8 text-gray-500 text-xs">
                          <p>Order history is shown above.</p>
                          <p className="text-gray-600 mt-1">Order-level detail shows every submission, fill, and cancellation.</p>
                        </div>
                      )}
                    </div>
                  ) : activeResultsTab === 'charts' ? (
                    <div className="p-3 space-y-3">
                      {/* Equity Curve with Benchmark */}
                      {equityCurveData.length > 0 && (
                        <div className="rounded-lg bg-gray-700/50 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs text-gray-400">Equity Curve</div>
                            <div className="flex items-center gap-2 text-[9px]">
                              <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-emerald-400 inline-block rounded" />Strategy</span>
                              <span className="flex items-center gap-1 text-gray-500"><span className="w-2 h-0.5 bg-gray-500 inline-block rounded" />Benchmark</span>
                            </div>
                          </div>
                          <div className="h-28">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart
                                data={equityCurveData.map((d, i) => ({
                                  ...d,
                                  benchmark: equityCurveData[0]?.equity ? (equityCurveData[0].equity * (1 + (i / Math.max(equityCurveData.length - 1, 1)) * ((results?.benchmark_return || 0) / 100))) : d.equity,
                                }))}
                                margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                              >
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
                                          <div className="text-emerald-400">Strategy: ${Number(d.equity).toLocaleString()}</div>
                                          <div className="text-gray-500">Benchmark: ${Number(d.benchmark).toLocaleString()}</div>
                                          <div className="text-gray-600">{d.date}</div>
                                        </div>
                                      );
                                    }
                                    return null;
                                  }}
                                />
                                <Area type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={1.5} fill="url(#eqGrad)" />
                                <Area type="monotone" dataKey="benchmark" stroke="#6b7280" strokeWidth={1} strokeDasharray="4 2" fill="none" />
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
                  ) : activeResultsTab === 'tca' ? (
                    <div className="p-3 space-y-3">
                      <>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-gray-400">Transaction Cost Analysis</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="p-2 rounded bg-gray-700/50">
                              <div className="text-gray-500 text-xs mb-0.5">Commission</div>
                              <div className="text-sm font-semibold text-amber-400">${(results.total_commission ?? 0).toFixed(2)}</div>
                            </div>
                            <div className="p-2 rounded bg-gray-700/50">
                              <div className="text-gray-500 text-xs mb-0.5">Slippage</div>
                              <div className="text-sm font-semibold text-amber-400">${(results.total_slippage ?? 0).toFixed(2)}</div>
                            </div>
                            <div className="p-2 rounded bg-gray-700/50">
                              <div className="text-gray-500 text-xs mb-0.5">Spread Cost</div>
                              <div className="text-sm font-semibold text-amber-400">${(results.total_spread_cost ?? 0).toFixed(2)}</div>
                            </div>
                            <div className="p-2 rounded bg-gray-700/50">
                              <div className="text-gray-500 text-xs mb-0.5">Cost % of P&L</div>
                              <div className="text-sm font-semibold text-red-400">{(results.cost_as_pct_of_pnl ?? 0).toFixed(1)}%</div>
                            </div>
                          </div>
                          <div className="p-2 rounded bg-gray-700/50">
                            <div className="text-gray-500 text-xs mb-0.5">Total Cost</div>
                            <div className="text-lg font-bold text-amber-400">
                              ${((results.total_commission ?? 0) + (results.total_slippage ?? 0) + (results.total_spread_cost ?? 0)).toFixed(2)}
                            </div>
                          </div>
                      </>
                    </div>
                  ) : activeResultsTab === 'optimize' ? (
                    <div className="p-3 space-y-3">
                      {/* Optimization Method Selector */}
                      <div className="flex gap-1 p-1 bg-gray-800 rounded-lg mb-2 flex-wrap">
                        {([
                          { key: 'grid', label: 'Grid', color: 'bg-blue-600 hover:bg-blue-500' },
                          { key: 'bayesian', label: 'Bayesian', color: 'bg-purple-600 hover:bg-purple-500' },
                          { key: 'genetic', label: 'Genetic', color: 'bg-orange-600 hover:bg-orange-500' },
                          { key: 'multiobjective', label: 'Multi-Obj', color: 'bg-cyan-600 hover:bg-cyan-500' },
                          { key: 'heatmap', label: 'Heatmap', color: 'bg-rose-600 hover:bg-rose-500' },
                        ] as const).map(m => (
                          <button
                            key={m.key}
                            onClick={() => setOptimizeMethod(m.key)}
                            className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md transition-all min-w-[60px] ${
                              optimizeMethod === m.key ? `${m.color} text-white shadow-sm` : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>

                      {/* Heatmap param selectors */}
                      {optimizeMethod === 'heatmap' && STRATEGY_PARAMS[selectedTemplate].length >= 2 && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-gray-500 mb-0.5 block">Param X</label>
                            <ConfigSelect
                              value={heatmapParamX}
                              onChange={(v) => setHeatmapParamX(v)}
                              small
                              placeholder="Select..."
                              buttonClassName="bg-gray-800 border-gray-600"
                              options={STRATEGY_PARAMS[selectedTemplate].map(p => ({ value: p.key, label: p.key }))}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 mb-0.5 block">Param Y</label>
                            <ConfigSelect
                              value={heatmapParamY}
                              onChange={(v) => setHeatmapParamY(v)}
                              small
                              placeholder="Select..."
                              buttonClassName="bg-gray-800 border-gray-600"
                              options={STRATEGY_PARAMS[selectedTemplate].filter(p => p.key !== heatmapParamX).map(p => ({ value: p.key, label: p.key }))}
                            />
                          </div>
                        </div>
                      )}

                      {/* Multi-Objective metric selectors */}
                      {optimizeMethod === 'multiobjective' && (
                        <div className="grid grid-cols-2 gap-2">
                          {[0, 1].map(idx => (
                            <div key={idx}>
                              <label className="text-xs text-gray-500 mb-0.5 block">Objective {idx + 1}</label>
                              <ConfigSelect
                                value={multiObjMetrics[idx]}
                                onChange={(v) => {
                                  const next = [...multiObjMetrics] as [string, string];
                                  next[idx] = v;
                                  setMultiObjMetrics(next);
                                }}
                                small
                                buttonClassName="bg-gray-800 border-gray-600"
                                options={['sharpe_ratio', 'max_drawdown', 'total_return', 'win_rate', 'total_trades'].map(m => ({
                                  value: m,
                                  label: m.replace(/_/g, ' '),
                                }))}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Constraints (collapsible) */}
                      <div>
                        <button onClick={() => setShowConstraints(!showConstraints)} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1">
                          <ChevronDown className={`h-3 w-3 transition-transform ${showConstraints ? '' : '-rotate-90'}`} />
                          Constraints
                        </button>
                        {showConstraints && (
                          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                            <div>
                              <label className="text-[10px] text-gray-500">Max DD %</label>
                              <input type="number" placeholder="e.g. 20" value={optConstraints.max_drawdown ?? ''}
                                onChange={e => setOptConstraints(prev => ({ ...prev, max_drawdown: e.target.value ? Number(e.target.value) : undefined }))}
                                className="pg-input pg-input-sm bg-gray-800 border-gray-600" />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-500">Min Trades</label>
                              <input type="number" placeholder="e.g. 10" value={optConstraints.min_trades ?? ''}
                                onChange={e => setOptConstraints(prev => ({ ...prev, min_trades: e.target.value ? Number(e.target.value) : undefined }))}
                                className="pg-input pg-input-sm bg-gray-800 border-gray-600" />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-500">Min Win %</label>
                              <input type="number" placeholder="e.g. 30" value={optConstraints.min_win_rate ?? ''}
                                onChange={e => setOptConstraints(prev => ({ ...prev, min_win_rate: e.target.value ? Number(e.target.value) : undefined }))}
                                className="pg-input pg-input-sm bg-gray-800 border-gray-600" />
                            </div>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={handleRunOptimization}
                        disabled={optimizeLoading || STRATEGY_PARAMS[selectedTemplate].length === 0}
                        className={`w-full py-2.5 text-sm font-medium rounded-md transition-all ${
                          ({ grid: 'bg-blue-600 hover:bg-blue-500', bayesian: 'bg-purple-600 hover:bg-purple-500', genetic: 'bg-orange-600 hover:bg-orange-500', multiobjective: 'bg-cyan-600 hover:bg-cyan-500', heatmap: 'bg-rose-600 hover:bg-rose-500' })[optimizeMethod]
                        } disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white shadow-sm active:scale-[0.99]`}
                      >
                        {optimizeLoading ? 'Optimizing...' : ({
                          grid: 'Run Grid Search',
                          bayesian: 'Run Bayesian (TPE)',
                          genetic: 'Run Genetic Algorithm',
                          multiobjective: 'Run Multi-Objective',
                          heatmap: 'Generate Heatmap',
                        })[optimizeMethod]}
                      </button>
                      {strategyMode === 'custom' && !playgroundStrategyId && (
                        <p className="text-xs text-gray-500">
                          {results ? 'Select a custom strategy to optimize' : 'Run a backtest first, then optimize'}
                        </p>
                      )}
                      {STRATEGY_PARAMS[selectedTemplate].length === 0 && (
                        <p className="text-xs text-gray-500">Custom strategies cannot be optimized</p>
                      )}
                      {optimizeResults?.error && (
                        <p className="text-xs text-red-400">{optimizeResults.error}</p>
                      )}

                      {/* Heatmap visualization */}
                      {optimizeResults?.z_values && (
                        <div className="space-y-2">
                          <div className="text-xs text-gray-400">
                            {optimizeResults.param_x} vs {optimizeResults.param_y}, colored by {optimizeResults.metric}
                          </div>
                          <div className="overflow-auto rounded bg-gray-800 p-1">
                            <table className="text-[10px] border-collapse">
                              <thead>
                                <tr>
                                  <th className="p-0.5 text-gray-500">{optimizeResults.param_y}\{optimizeResults.param_x}</th>
                                  {(optimizeResults.x_values as number[]).map((x: number) => (
                                    <th key={x} className="p-0.5 text-gray-500 font-normal">{typeof x === 'number' ? (Number.isInteger(x) ? x : x.toFixed(1)) : x}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {(optimizeResults.z_values as (number | null)[][]).map((row: (number | null)[], yi: number) => {
                                  const allVals = (optimizeResults.z_values as (number | null)[][]).flat().filter((v: number | null): v is number => v !== null);
                                  const minZ = Math.min(...allVals);
                                  const maxZ = Math.max(...allVals);
                                  const range = maxZ - minZ || 1;
                                  return (
                                    <tr key={yi}>
                                      <td className="p-0.5 text-gray-500 font-medium">{typeof optimizeResults.y_values[yi] === 'number' ? (Number.isInteger(optimizeResults.y_values[yi]) ? optimizeResults.y_values[yi] : optimizeResults.y_values[yi].toFixed(1)) : optimizeResults.y_values[yi]}</td>
                                      {row.map((val: number | null, xi: number) => {
                                        if (val === null) return <td key={xi} className="p-0.5 w-6 h-6 text-center bg-gray-900 text-gray-600">-</td>;
                                        const norm = (val - minZ) / range;
                                        const r = Math.round(239 * (1 - norm) + 16 * norm);
                                        const g = Math.round(68 * (1 - norm) + 185 * norm);
                                        const b = Math.round(68 * (1 - norm) + 129 * norm);
                                        return (
                                          <td key={xi} className="p-0.5 w-6 h-6 text-center text-[9px] text-white font-medium"
                                            style={{ backgroundColor: `rgb(${r},${g},${b})` }}
                                            title={`${optimizeResults.param_x}=${optimizeResults.x_values[xi]}, ${optimizeResults.param_y}=${optimizeResults.y_values[yi]}: ${val.toFixed(2)}`}>
                                            {val.toFixed(1)}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          <div className="flex justify-between text-[10px] text-gray-500">
                            <span className="text-red-400">Low</span>
                            <span>Color = {optimizeResults.metric}</span>
                            <span className="text-emerald-400">High</span>
                          </div>
                        </div>
                      )}

                      {/* Pareto front scatter (multi-objective) */}
                      {optimizeResults?.pareto_front && optimizeResults.pareto_front.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs text-gray-400">Pareto Front ({optimizeResults.pareto_front.length} solutions)</div>
                          <div className="h-40 rounded bg-gray-800 p-2">
                            <ResponsiveContainer width="100%" height="100%">
                              <ScatterChart margin={{ top: 5, right: 5, bottom: 20, left: 20 }}>
                                <XAxis
                                  type="number"
                                  dataKey="x"
                                  name={optimizeResults.objective_metrics?.[0] ?? 'obj1'}
                                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                                  label={{ value: optimizeResults.objective_metrics?.[0]?.replace(/_/g, ' ') ?? '', position: 'bottom', fontSize: 10, fill: '#6b7280' }}
                                />
                                <YAxis
                                  type="number"
                                  dataKey="y"
                                  name={optimizeResults.objective_metrics?.[1] ?? 'obj2'}
                                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                                  label={{ value: optimizeResults.objective_metrics?.[1]?.replace(/_/g, ' ') ?? '', angle: -90, position: 'left', fontSize: 10, fill: '#6b7280' }}
                                />
                                <Tooltip content={({ active, payload }) => {
                                  if (active && payload?.[0]) {
                                    const d = payload[0].payload;
                                    return (
                                      <div className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs">
                                        <div className="text-cyan-400">{d.label}</div>
                                        <div className="text-gray-500">{d.params}</div>
                                      </div>
                                    );
                                  }
                                  return null;
                                }} />
                                <Scatter
                                  data={optimizeResults.pareto_front.map((pf: any) => {
                                    const m0 = optimizeResults.objective_metrics?.[0] ?? 'sharpe_ratio';
                                    const m1 = optimizeResults.objective_metrics?.[1] ?? 'max_drawdown';
                                    return {
                                      x: pf.values?.[m0] ?? 0,
                                      y: pf.values?.[m1] ?? 0,
                                      label: `${m0}: ${(pf.values?.[m0] ?? 0).toFixed(2)}, ${m1}: ${(pf.values?.[m1] ?? 0).toFixed(2)}`,
                                      params: pf.params ? Object.entries(pf.params).map(([k, v]) => `${k}=${v}`).join(', ') : '',
                                    };
                                  })}
                                  fill="#06b6d4"
                                />
                              </ScatterChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}

                      {/* Genetic convergence chart */}
                      {optimizeResults?.generation_history && optimizeResults.generation_history.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs text-gray-400">Convergence ({optimizeResults.generations} generations, {optimizeResults.total_evaluations} evals)</div>
                          <div className="h-28 rounded bg-gray-800 p-2">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={optimizeResults.generation_history} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                                <XAxis dataKey="generation" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                                <Tooltip content={({ active, payload }) => {
                                  if (active && payload?.[0]) {
                                    return (
                                      <div className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs">
                                        <div className="text-orange-400">Gen {payload[0].payload.generation}: {payload[0].payload.best_fitness?.toFixed(3) ?? 'N/A'}</div>
                                      </div>
                                    );
                                  }
                                  return null;
                                }} />
                                <Line type="monotone" dataKey="best_fitness" stroke="#f97316" strokeWidth={2} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}

                      {/* Standard results table (grid/bayesian/genetic) */}
                      {optimizeResults?.results && !optimizeResults?.z_values && !optimizeResults?.pareto_front && (
                        <>
                          <div className="text-xs text-gray-400">
                            {optimizeResults.method === 'bayesian'
                              ? `${optimizeResults.total_trials} trials (Bayesian TPE)`
                              : optimizeResults.method === 'genetic'
                              ? `${optimizeResults.total_evaluations} evaluations (Genetic)`
                              : `${optimizeResults.total_combinations ?? optimizeResults.total_trials} combinations tested`}
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
                                  <tr key={i} className={`${i === 0 ? 'bg-emerald-900/20' : ''} ${r.constraint_violated ? 'opacity-40' : ''}`}>
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
                        disabled={walkForwardLoading || (!playgroundStrategyId && strategyMode !== 'templates')}
                        className="w-full py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-md transition-all shadow-sm active:scale-[0.99]"
                      >
                        {walkForwardLoading ? 'Analyzing...' : 'Run Walk-Forward Analysis'}
                      </button>
                      {strategyMode === 'custom' && !playgroundStrategyId && (
                        <p className="text-xs text-gray-500">
                          {results ? 'Select a custom strategy for walk-forward analysis' : 'Run a backtest first'}
                        </p>
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
                        className="w-full py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-md transition-all shadow-sm active:scale-[0.99]"
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

                              {/* Rolling Sharpe */}
                              {results.rolling_sharpe && results.rolling_sharpe.length > 0 && (
                                <div className="rounded-lg bg-gray-700/50 p-3">
                                  <div className="text-xs text-gray-400 mb-2">Rolling Sharpe Ratio (63-day)</div>
                                  <div className="h-24">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <AreaChart data={results.rolling_sharpe} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                                        <defs>
                                          <linearGradient id="rsGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                                            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                                          </linearGradient>
                                        </defs>
                                        <XAxis dataKey="date" hide />
                                        <YAxis hide />
                                        <Tooltip content={({ active, payload }) => {
                                          if (active && payload?.[0]) {
                                            const d = payload[0].payload;
                                            return (<div className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs">
                                              <div className="text-blue-400">Sharpe: {d.value.toFixed(2)}</div>
                                              <div className="text-gray-500">{d.date}</div>
                                            </div>);
                                          }
                                          return null;
                                        }} />
                                        <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={1.5} fill="url(#rsGrad)" />
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
                  ) : activeResultsTab === 'heatmap' ? (
                    <div className="p-3 space-y-3">
                      <div className="text-xs text-gray-400 font-medium mb-2">Monthly Returns Heatmap (%)</div>
                      {results?.equity_curve?.length > 10 ? (() => {
                        const ec = results.equity_curve;
                        const monthlyMap: Record<string, Record<number, number>> = {};
                        let prevEquity = ec[0]?.equity || 1;
                        let prevMonth = -1;
                        let prevYear = -1;
                        let monthStart = prevEquity;
                        for (const pt of ec) {
                          const d = new Date(pt.date);
                          const y = d.getFullYear();
                          const m = d.getMonth();
                          if (prevMonth !== -1 && (m !== prevMonth || y !== prevYear)) {
                            const key = `${prevYear}`;
                            if (!monthlyMap[key]) monthlyMap[key] = {};
                            monthlyMap[key][prevMonth] = monthStart > 0 ? ((prevEquity / monthStart) - 1) * 100 : 0;
                            monthStart = prevEquity;
                          }
                          prevEquity = pt.equity;
                          prevMonth = m;
                          prevYear = y;
                        }
                        if (prevMonth !== -1) {
                          const key = `${prevYear}`;
                          if (!monthlyMap[key]) monthlyMap[key] = {};
                          monthlyMap[key][prevMonth] = monthStart > 0 ? ((prevEquity / monthStart) - 1) * 100 : 0;
                        }
                        const years = Object.keys(monthlyMap).sort();
                        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                        return (
                          <div className="overflow-x-auto">
                            <table className="w-full text-[10px]">
                              <thead>
                                <tr>
                                  <th className="text-left text-gray-500 py-1 pr-2">Year</th>
                                  {months.map(m => <th key={m} className="text-center text-gray-500 py-1 px-0.5 w-[40px]">{m}</th>)}
                                  <th className="text-right text-gray-500 py-1 pl-2">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {years.map(year => {
                                  const yearData = monthlyMap[year] || {};
                                  const yearTotal = Object.values(yearData).reduce((a, b) => a + b, 0);
                                  return (
                                    <tr key={year}>
                                      <td className="text-gray-400 py-0.5 pr-2 font-medium">{year}</td>
                                      {Array.from({length: 12}, (_, i) => {
                                        const val = yearData[i];
                                        if (val === undefined) return <td key={i} className="text-center py-0.5 px-0.5"><span className="block w-full rounded" style={{background:'#1a1a2e'}}>-</span></td>;
                                        const absVal = Math.abs(val);
                                        const opacity = Math.min(absVal / 5, 1);
                                        const bg = val >= 0 ? `rgba(16,185,129,${opacity * 0.6})` : `rgba(239,68,68,${opacity * 0.6})`;
                                        return (
                                          <td key={i} className="text-center py-0.5 px-0.5">
                                            <span className="block w-full rounded py-0.5" style={{background: bg, color: val >= 0 ? '#10b981' : '#ef4444'}}>
                                              {val.toFixed(1)}
                                            </span>
                                          </td>
                                        );
                                      })}
                                      <td className={`text-right py-0.5 pl-2 font-medium ${yearTotal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {yearTotal.toFixed(1)}%
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        );
                      })() : (
                        <div className="text-center p-6">
                          <Calendar className="h-8 w-8 text-gray-600 mx-auto mb-2" />
                          <p className="text-sm text-gray-400">Need more data for monthly heatmap</p>
                          <p className="text-xs text-gray-500 mt-1">Run a backtest spanning multiple months</p>
                        </div>
                      )}
                    </div>
                  ) : activeResultsTab === 'distribution' ? (
                    <div className="p-3 space-y-3">
                      <div className="text-xs text-gray-400 font-medium mb-2">Trade P&L Distribution</div>
                      {results?.trades?.length > 2 ? (() => {
                        const pnls = results.trades.map((t: any) => t.pnl || 0).sort((a: number, b: number) => a - b);
                        const min = pnls[0];
                        const max = pnls[pnls.length - 1];
                        const bins = 15;
                        const step = (max - min) / bins || 1;
                        const histogram = Array.from({length: bins}, (_, i) => {
                          const lo = min + i * step;
                          const hi = lo + step;
                          const count = pnls.filter((v: number) => v >= lo && (i === bins - 1 ? v <= hi : v < hi)).length;
                          return { center: (lo + hi) / 2, count, label: `$${((lo + hi) / 2).toFixed(0)}` };
                        });
                        const maxCount = Math.max(...histogram.map(h => h.count));
                        return (
                          <div className="space-y-3">
                            <div className="h-40 flex items-end gap-[2px]">
                              {histogram.map((bin, i) => (
                                <div key={i} className="flex-1 flex flex-col items-center" title={`${bin.label}: ${bin.count} trades`}>
                                  <div
                                    className={`w-full rounded-t ${bin.center >= 0 ? 'bg-emerald-500/60' : 'bg-red-500/60'}`}
                                    style={{ height: `${maxCount > 0 ? (bin.count / maxCount) * 100 : 0}%`, minHeight: bin.count > 0 ? '2px' : '0' }}
                                  />
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-between text-[9px] text-gray-500">
                              <span>${min.toFixed(0)}</span>
                              <span>$0</span>
                              <span>${max.toFixed(0)}</span>
                            </div>
                            {/* Stats */}
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div className="bg-gray-700/50 rounded p-2 text-center">
                                <div className="text-gray-500 text-[10px]">Avg Win</div>
                                <div className="text-emerald-400 font-medium">
                                  ${(pnls.filter((v: number) => v > 0).reduce((a: number, b: number) => a + b, 0) / Math.max(pnls.filter((v: number) => v > 0).length, 1)).toFixed(2)}
                                </div>
                              </div>
                              <div className="bg-gray-700/50 rounded p-2 text-center">
                                <div className="text-gray-500 text-[10px]">Avg Loss</div>
                                <div className="text-red-400 font-medium">
                                  ${(pnls.filter((v: number) => v < 0).reduce((a: number, b: number) => a + b, 0) / Math.max(pnls.filter((v: number) => v < 0).length, 1)).toFixed(2)}
                                </div>
                              </div>
                              <div className="bg-gray-700/50 rounded p-2 text-center">
                                <div className="text-gray-500 text-[10px]">Median</div>
                                <div className="text-gray-200 font-medium">
                                  ${pnls[Math.floor(pnls.length / 2)]?.toFixed(2) || '0'}
                                </div>
                              </div>
                            </div>
                            {/* Duration distribution */}
                            {results.trades.some((t: any) => t.entry_date && t.exit_date) && (
                              <div>
                                <div className="text-xs text-gray-400 font-medium mb-1 mt-2">Trade Duration (days)</div>
                                <div className="flex gap-1">
                                  {(() => {
                                    const durations = results.trades
                                      .filter((t: any) => t.entry_date && t.exit_date)
                                      .map((t: any) => Math.max(1, Math.round((new Date(t.exit_date).getTime() - new Date(t.entry_date).getTime()) / 86400000)));
                                    const maxD = Math.max(...durations, 1);
                                    const buckets = [1, 2, 3, 5, 10, 20, 50, 100].filter(b => b <= maxD * 1.5);
                                    return buckets.map((b, i) => {
                                      const lo = i === 0 ? 0 : buckets[i-1];
                                      const cnt = durations.filter((d: number) => d > lo && d <= b).length;
                                      const pct = durations.length > 0 ? (cnt / durations.length * 100) : 0;
                                      return (
                                        <div key={b} className="flex-1 text-center">
                                          <div className="h-12 flex items-end justify-center">
                                            <div className="w-full bg-blue-500/40 rounded-t" style={{height: `${pct}%`, minHeight: cnt > 0 ? '2px' : '0'}} />
                                          </div>
                                          <div className="text-[8px] text-gray-500 mt-0.5">{b}d</div>
                                        </div>
                                      );
                                    });
                                  })()}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })() : (
                        <div className="text-center p-6">
                          <BarChart3 className="h-8 w-8 text-gray-600 mx-auto mb-2" />
                          <p className="text-sm text-gray-400">Need more trades for distribution</p>
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
        onExportReport={results ? () => {
          const html = generateLocalTearsheet(results);
          const blob = new Blob([html], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `tearsheet_${new Date().toISOString().split('T')[0]}.html`;
          a.click();
          URL.revokeObjectURL(url);
        } : undefined}
        onExportJSON={results ? handleExportJSON : undefined}
        uiScale={uiScale}
        onUiScaleChange={setUiScale}
      />

      {/* Floating Code Editor Panel - Draggable */}
      {showCodeEditor && (
        <div 
          className="fixed z-50 bg-[#1e1e1e] border border-gray-700 rounded-lg shadow-2xl flex flex-col"
          style={{
            left: editorPosition.x,
            top: editorPosition.y,
            width: editorMinimized ? '200px' : '700px',
            height: editorMinimized ? '36px' : '550px',
            transition: isDragging ? 'none' : 'width 0.2s, height 0.2s',
          }}
        >
          {/* Editor Header - Draggable */}
          <div 
            className={`h-10 bg-gray-800 ${editorMinimized ? 'rounded-lg' : 'rounded-t-lg'} px-3 flex items-center justify-between border-b border-gray-700 cursor-move select-none shrink-0`}
            onMouseDown={handleMouseDown}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <FileCode className="h-4 w-4 text-emerald-500 shrink-0" />
              <span className="text-sm text-gray-200 font-medium truncate">
                {playgroundStrategyId ? displayedCustomStrategies.find(s => s.id === playgroundStrategyId)?.title ?? 'strategy.py' : 'strategy.py'}
              </span>
              {!editorMinimized && strategyMode === 'custom' && playgroundStrategyId && (
                <div className="flex items-center gap-0.5 bg-gray-700/60 rounded-md p-0.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditorTab('code'); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`px-2.5 py-1 text-[11px] rounded transition ${editorTab === 'code' ? 'bg-gray-600 text-gray-100' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    Code
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditorTab('version-control'); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`px-2.5 py-1 text-[11px] rounded transition ${editorTab === 'version-control' ? 'bg-gray-600 text-gray-100' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    Version control
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!editorMinimized && strategyMode === 'custom' && playgroundStrategyId && (
                <div className="flex items-center gap-2">
                  {lastEditorSaveTime != null && (
                    <span className="text-[10px] text-gray-500" title={`Last saved ${new Date(lastEditorSaveTime).toLocaleString()}`}>
                      Saved {formatRelativeTime(lastEditorSaveTime)}
                    </span>
                  )}
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!playgroundStrategyId) return;
                      setEditorSaveStatus('saving');
                      try {
                        await api.updateStrategy(playgroundStrategyId, { code, parameters: strategyParams });
                        const now = Date.now();
                        setLastEditorSaveTime(now);
                        setEditorSaveStatus('saved');
                      } catch {
                        setEditorSaveStatus('error');
                        setTimeout(() => setEditorSaveStatus('idle'), 2500);
                      }
                    }}
                    disabled={editorSaveStatus === 'saving'}
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      editorSaveStatus === 'saved'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : editorSaveStatus === 'saving'
                        ? 'bg-gray-600/50 text-gray-400 border border-gray-600 cursor-wait'
                        : editorSaveStatus === 'error'
                        ? 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/15'
                        : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 hover:border-emerald-500/50'
                    }`}
                    title="Save strategy (without committing)"
                  >
                    {editorSaveStatus === 'saving' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : editorSaveStatus === 'saved' ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    {editorSaveStatus === 'saving' ? 'Saving…' : editorSaveStatus === 'saved' ? 'Saved' : editorSaveStatus === 'error' ? 'Failed' : 'Save'}
                  </button>
                </div>
              )}
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
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden rounded-b-lg">
              {editorTab === 'code' ? (
                <div className="flex-1 min-h-0" style={{ height: '480px' }}>
                  <ErrorBoundary label="Code Editor">
                    <CodeEditor value={code} onChange={setCode} />
                  </ErrorBoundary>
                </div>
              ) : strategyMode === 'custom' && playgroundStrategyId ? (
                /* Version Control tab - GitHub Desktop style */
                <div className="flex flex-col flex-1 min-h-0 bg-gray-800/50 overflow-hidden">
                  {/* Commit input bar */}
                  <div className="p-3 border-b border-gray-700/80 shrink-0">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={commitMessageInput}
                        onChange={(e) => setCommitMessageInput(e.target.value)}
                        placeholder="Summary (required)"
                        className="flex-1 px-3 py-2 text-sm bg-gray-700/80 border border-gray-600 rounded-md text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                        maxLength={500}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            if (!playgroundStrategyId) return;
                            api.updateStrategy(playgroundStrategyId, { code, parameters: strategyParams })
                              .then(() => api.createVersion(playgroundStrategyId!, commitMessageInput.trim() || undefined))
                              .then(() => {
                                setCommitMessageInput('');
                                return api.listVersions(playgroundStrategyId!, 0, 10);
                              })
                              .then((v) => { setVersionList(v); setVersionListHasMore(v.length >= 10); })
                              .catch(() => {});
                          }
                        }}
                      />
                      <button
                        onClick={async () => {
                          if (!playgroundStrategyId) return;
                          try {
                            await api.updateStrategy(playgroundStrategyId, { code, parameters: strategyParams });
                            await api.createVersion(playgroundStrategyId, commitMessageInput.trim() || undefined);
                            setCommitMessageInput('');
                            const versions = await api.listVersions(playgroundStrategyId, 0, 10);
                            setVersionList(versions);
                            setVersionListHasMore(versions.length >= 10);
                          } catch {}
                        }}
                        disabled={!commitMessageInput.trim()}
                        className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors flex items-center gap-2"
                        title="Commit changes"
                      >
                        <GitBranch className="h-4 w-4" />
                        Commit
                      </button>
                    </div>
                  </div>
                  {/* Commit history - GitHub Desktop style */}
                  <div className="flex-1 overflow-y-auto p-3">
                    <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-2">History</div>
                    {versionLoading ? (
                      <div className="text-xs text-gray-500 py-4">Loading...</div>
                    ) : versionList.length === 0 ? (
                      <div className="text-xs text-gray-500 py-6 text-center">No commits yet. Add a summary above and commit.</div>
                    ) : (
                      <div className="relative">
                        {/* Timeline line */}
                        <div className="absolute left-[11px] top-2 bottom-2 w-px bg-gray-600/60" />
                        <div className="space-y-0">
                          {versionList.map((v, i) => (
                            <div key={v.id} className="relative flex gap-3 pl-8 py-2 group">
                              <div className="absolute left-0 top-5 w-3 h-3 rounded-full bg-emerald-500/80 border-2 border-gray-800 shrink-0" />
                              <div className="flex-1 min-w-0 rounded-lg bg-gray-700/40 hover:bg-gray-700/60 border border-gray-600/40 p-3 transition-colors">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-gray-200 font-medium truncate">
                                      {v.commit_message || <span className="italic text-gray-500">No message</span>}
                                    </p>
                                    <p className="text-[11px] text-gray-500 mt-0.5">
                                      {v.created_at ? new Date(v.created_at).toLocaleString() : ''}
                                      <span className="ml-2 text-gray-600">• v{v.version}</span>
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    <button
                                      onClick={async () => {
                                        if (!playgroundStrategyId) return;
                                        try {
                                          const data = await api.restoreVersion(playgroundStrategyId, v.version);
                                          setCode(data.code);
                                          setEditorTab('code');
                                        } catch {}
                                      }}
                                      className="px-2 py-1 text-[11px] text-blue-400 hover:text-blue-300 hover:bg-gray-600 rounded"
                                      title="Revert to this commit"
                                    >
                                      Revert
                                    </button>
                                    <button
                                      onClick={async () => {
                                        if (!playgroundStrategyId || !confirm(`Delete v${v.version}?`)) return;
                                        try {
                                          await api.deleteVersion(playgroundStrategyId, v.version);
                                          setVersionList(prev => prev.filter(x => x.id !== v.id));
                                        } catch {}
                                      }}
                                      className="p-1 text-red-400 hover:text-red-300 hover:bg-gray-600 rounded"
                                      title="Delete commit"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {versionListHasMore && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!playgroundStrategyId) return;
                              setVersionLoading(true);
                              try {
                                const more = await api.listVersions(playgroundStrategyId, versionList.length, 10);
                                setVersionList(prev => [...prev, ...more]);
                                setVersionListHasMore(more.length >= 10);
                              } catch {}
                              setVersionLoading(false);
                            }}
                            className="w-full mt-2 py-2 text-[11px] text-gray-500 hover:text-gray-300 border border-dashed border-gray-600 rounded-lg hover:border-gray-500 transition-colors"
                          >
                            Load more
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Select a custom strategy for version control</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
