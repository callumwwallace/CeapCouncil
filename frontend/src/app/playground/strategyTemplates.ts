// Strategy Templates, Python code for each built in strategy
// Extracted from page.tsx to keep the main component focused on UI logic
// Will be adding more strategies over time

export const STRATEGY_TEMPLATES = {
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
  ma_50_200: {
    name: 'MA 50/200 Crossover',
    description: 'Long/short on 50/200 MA crosses (enable Margin in Engine Settings)',
    code: `# MA 50/200 Crossover (Reddit strategy)

class MyStrategy(StrategyBase):
    def on_init(self):
        self.short_period = 50
        self.long_period = 200

    def on_data(self, bar):
        history = self.history(bar.symbol, self.long_period + 1)
        if len(history) < self.long_period + 1:
            return

        closes = [b.close for b in history]
        short_ma = sum(closes[-self.short_period:]) / self.short_period
        long_ma = sum(closes[-self.long_period:]) / self.long_period
        prev_short = sum(closes[-self.short_period - 1:-1]) / self.short_period
        prev_long = sum(closes[-self.long_period - 1:-1]) / self.long_period

        cross_up = prev_short <= prev_long and short_ma > long_ma
        cross_down = prev_short >= prev_long and short_ma < long_ma

        if self.is_flat(bar.symbol):
            if cross_up:
                qty = int(self.portfolio.cash * 0.95 / bar.close)
                if qty > 0:
                    self.market_order(bar.symbol, qty)
            elif cross_down:
                qty = int(self.portfolio.cash * 0.95 / bar.close)
                if qty > 0:
                    self.market_order(bar.symbol, -qty)
        elif self.is_long(bar.symbol) and cross_down:
            self.close_position(bar.symbol)
        elif self.is_short(bar.symbol) and cross_up:
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

export type StrategyTemplateKey = keyof typeof STRATEGY_TEMPLATES;

export const DEFAULT_CODE = STRATEGY_TEMPLATES.sma_crossover.code;
