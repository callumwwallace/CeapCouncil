'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Book, FileCode, Play, Zap, BarChart3, Shield, GitBranch, Save,
  ChevronRight, ChevronDown, Activity, Target, Layers, Clock, Terminal,
  AlertTriangle, Box, TrendingUp, LineChart, Gauge, Search, Copy, Check,
  Timer,
} from 'lucide-react';

// ─── Section registry ──────────────────────────────────────────────
const SECTIONS = [
  { id: 'overview',      title: 'Overview',                    icon: Book },
  { id: 'quickstart',    title: 'Quick start',                 icon: Zap },
  { id: 'structure',     title: 'Strategy structure',          icon: FileCode },
  { id: 'lifecycle',     title: 'Lifecycle methods',           icon: Activity },
  { id: 'data',          title: 'Data & bar object',           icon: BarChart3 },
  { id: 'indicators',    title: 'Built-in indicators',         icon: LineChart },
  { id: 'orders',        title: 'Orders & positions',          icon: Target },
  { id: 'advanced-orders', title: 'Advanced orders',           icon: Layers },
  { id: 'execution',     title: 'Execution algorithms',        icon: Gauge },
  { id: 'portfolio',     title: 'Portfolio API',               icon: TrendingUp },
  { id: 'charts',        title: 'Custom charts & alerts',      icon: Activity },
  { id: 'consolidators', title: 'Bar consolidators',            icon: Timer },
  { id: 'scheduling',    title: 'Scheduling & state',          icon: Clock },
  { id: 'parameters',    title: 'Parameters',                  icon: Terminal },
  { id: 'restrictions',  title: 'Restrictions',                icon: Shield },
  { id: 'version-control', title: 'Version control',           icon: GitBranch },
] as const;

// ─── Interactive code examples ─────────────────────────────────────
const PLAYGROUND_EXAMPLES: Record<string, { title: string; code: string; description: string }> = {
  sma_crossover: {
    title: 'SMA Crossover',
    description: 'Buy when fast MA crosses above slow MA, sell on cross below',
    code: `class MyStrategy(StrategyBase):
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
                self.close_position(bar.symbol)`,
  },
  bracket_example: {
    title: 'Bracket Order',
    description: 'Entry with automatic take-profit and stop-loss',
    code: `class MyStrategy(StrategyBase):
    """
    Bracket order example: enter with a market order,
    automatically set take-profit and stop-loss levels.
    When one side fills, the other is cancelled.
    """
    def on_init(self):
        self.params.setdefault('period', 20)
        self.params.setdefault('tp_pct', 5.0)
        self.params.setdefault('sl_pct', 2.0)

    def on_data(self, bar):
        period = self.params['period']
        hist = self.history(bar.symbol, period)
        if len(hist) < period:
            return

        closes = [b.close for b in hist]
        sma = sum(closes) / period

        if self.is_flat(bar.symbol) and bar.close > sma:
            qty = max(1, int(self.portfolio.cash * 0.90 / bar.close))
            tp = bar.close * (1 + self.params['tp_pct'] / 100)
            sl = bar.close * (1 - self.params['sl_pct'] / 100)
            self.bracket_order(bar.symbol, qty,
                take_profit_price=tp,
                stop_loss_price=sl)`,
  },
  custom_chart: {
    title: 'Custom Charts',
    description: 'Plot indicators and signals on custom chart panes',
    code: `class MyStrategy(StrategyBase):
    """
    Demonstrates self.plot() for custom chart overlays.
    Plots RSI and Z-score on separate chart panes
    using built-in indicator classes.
    """
    def on_init(self):
        self.params.setdefault('period', 14)
        self.set_warmup(bars=50)

    def on_data(self, bar):
        period = self.params['period']
        hist = self.history(bar.symbol, period * 3)
        if len(hist) < period * 3:
            return
        closes = [b.close for b in hist]

        # Use built-in indicators (global classes)
        rsi = RSI(period=period)(closes)
        z = ZScore(period=period)(closes)

        # Plot on custom charts
        self.plot('RSI', 'rsi', rsi)
        self.plot('RSI', 'oversold', 30)
        self.plot('RSI', 'overbought', 70)
        self.plot('Z-Score', 'z', z)

        if self.is_flat(bar.symbol) and rsi < 30 and z < -2:
            qty = max(1, int(self.portfolio.cash * 0.95 / bar.close))
            self.market_order(bar.symbol, qty)
        elif self.is_long(bar.symbol) and rsi > 70:
            self.close_position(bar.symbol)`,
  },
  twap_example: {
    title: 'TWAP Execution',
    description: 'Split a large order across multiple bars to reduce impact',
    code: `class MyStrategy(StrategyBase):
    """
    Demonstrates TWAP execution algorithm.
    Splits a large order into equal-sized slices
    distributed across N bars.
    """
    def on_init(self):
        self.params.setdefault('period', 50)
        self.params.setdefault('slices', 10)

    def on_data(self, bar):
        period = self.params['period']
        hist = self.history(bar.symbol, period)
        if len(hist) < period:
            return

        closes = [b.close for b in hist]
        sma = sum(closes) / period

        if self.is_flat(bar.symbol) and bar.close > sma:
            qty = max(10, int(self.portfolio.cash * 0.90 / bar.close))
            # Split into 10 equal slices over 10 bars
            self.twap_order(bar.symbol, qty,
                num_slices=self.params['slices'])

        elif self.is_long(bar.symbol) and bar.close < sma:
            self.close_position(bar.symbol)`,
  },
  scheduled_rebalance: {
    title: 'Scheduled Rebalance',
    description: 'Use self.schedule() to run logic every N bars',
    code: `class MyStrategy(StrategyBase):
    """
    Demonstrates self.schedule() for periodic logic.
    Rebalances position every 20 bars based on momentum.
    """
    def on_init(self):
        self.params.setdefault('lookback', 20)
        self.schedule('rebalance', every_n_bars=20,
            callback=self.rebalance)

    def rebalance(self):
        lookback = self.params['lookback']
        hist = self.history(length=lookback + 1)
        if len(hist) < lookback + 1:
            return
        roc = (hist[-1].close - hist[0].close) / hist[0].close

        symbol = hist[-1].symbol
        if roc > 0.02 and self.is_flat(symbol):
            qty = max(1, int(self.portfolio.cash * 0.95 / hist[-1].close))
            self.market_order(symbol, qty)
            self.notify(f"Entered long: ROC={roc:.2%}", level="info")
        elif roc < -0.02 and self.is_long(symbol):
            self.close_position(symbol)
            self.notify(f"Exited: ROC={roc:.2%}", level="warning")

    def on_data(self, bar):
        # Scheduled callback handles the logic
        pass`,
  },
};

// ─── Reusable components ───────────────────────────────────────────

function CodeBlock({ code, language = 'python' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Copy code"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function TryButton({ exampleKey }: { exampleKey: string }) {
  const router = useRouter();
  const example = PLAYGROUND_EXAMPLES[exampleKey];
  if (!example) return null;

  return (
    <button
      onClick={() => {
        sessionStorage.setItem('playground_inject_code', example.code);
        router.push('/playground');
      }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-md transition"
    >
      <Play className="h-3 w-3" />
      Try in Playground
    </button>
  );
}

function MethodCard({
  signature,
  description,
  returns,
  children,
}: {
  signature: string;
  description: string;
  returns?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <h3 className="font-mono text-sm text-emerald-700 font-semibold">{signature}</h3>
      <p className="mt-1.5 text-gray-600 text-sm">{description}</p>
      {returns && (
        <p className="mt-1 text-xs text-gray-500">
          <span className="font-semibold">Returns:</span> <code className="bg-gray-100 px-1 rounded">{returns}</code>
        </p>
      )}
      {children}
    </div>
  );
}

function ApiTable({ rows }: { rows: { method: string; description: string }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="border border-gray-200 px-3 py-2.5 text-left font-semibold text-gray-700">Method / Property</th>
            <th className="border border-gray-200 px-3 py-2.5 text-left font-semibold text-gray-700">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
              <td className="border border-gray-200 px-3 py-2 font-mono text-xs text-emerald-700 whitespace-nowrap">{r.method}</td>
              <td className="border border-gray-200 px-3 py-2 text-gray-600">{r.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CollapsibleSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left font-medium text-gray-700 transition"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {title}
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

function Callout({ type, children }: { type: 'info' | 'warning' | 'tip'; children: React.ReactNode }) {
  const styles = {
    info: 'bg-blue-50 border-blue-200 text-blue-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    tip: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  };
  const labels = { info: 'Note', warning: 'Warning', tip: 'Tip' };
  return (
    <div className={`p-4 border rounded-lg text-sm ${styles[type]}`}>
      <strong>{labels[type]}:</strong> {children}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────
export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSections = searchQuery
    ? SECTIONS.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : SECTIONS;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex gap-8">

          {/* ── Sidebar nav ── */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-8 space-y-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Documentation</h1>
                <p className="mt-1 text-sm text-gray-500">Strategy Engine API Reference</p>
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search docs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
                />
              </div>

              <nav className="space-y-0.5">
                {filteredSections.map((s) => {
                  const Icon = s.icon;
                  return (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      onClick={() => setActiveSection(s.id)}
                      className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition ${
                        activeSection === s.id
                          ? 'bg-emerald-50 text-emerald-700 font-medium'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {s.title}
                    </a>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* ── Main content ── */}
          <main className="flex-1 min-w-0 max-w-4xl">

            {/* Mobile TOC */}
            <nav className="lg:hidden mb-8 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Contents</h2>
              <div className="flex flex-wrap gap-2">
                {SECTIONS.map((s) => (
                  <a key={s.id} href={`#${s.id}`} className="text-xs px-2.5 py-1.5 bg-gray-100 text-emerald-600 hover:bg-emerald-50 rounded-md">
                    {s.title}
                  </a>
                ))}
              </div>
            </nav>

            <article className="space-y-16">

              {/* ═══════════════ OVERVIEW ═══════════════ */}
              <section id="overview" className="scroll-mt-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Book className="h-6 w-6 text-emerald-600" />
                  Overview
                </h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  Write trading strategies in Python, backtest them against historical data, optimize parameters, and compete
                  on the leaderboard — all from the <Link href="/playground" className="text-emerald-600 hover:underline font-medium">Playground</Link>.
                </p>
                <p className="text-gray-700 leading-relaxed mb-4">
                  Strategies inherit from <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">StrategyBase</code> and
                  implement lifecycle methods. The engine feeds your strategy one bar at a time, and you respond
                  by placing orders, managing positions, and plotting custom indicators.
                </p>

                <Callout type="info">
                  Your class <strong>must</strong> be named <code className="bg-blue-100 px-1 rounded">MyStrategy</code> and
                  inherit from <code className="bg-blue-100 px-1 rounded">StrategyBase</code>. The engine validates your code before running.
                </Callout>

                <div className="mt-6 grid sm:grid-cols-3 gap-4">
                  {[
                    { icon: FileCode, title: '30+ Indicators', desc: 'SMA, EMA, RSI, MACD, Bollinger, ATR, and more' },
                    { icon: Layers, title: '7 Order Types', desc: 'Market, limit, stop, stop-limit, trailing, MOO, MOC' },
                    { icon: Gauge, title: '4 Exec Algos', desc: 'TWAP, VWAP, Iceberg, Percentage of Volume' },
                  ].map(({ icon: I, title, desc }) => (
                    <div key={title} className="p-4 bg-white border border-gray-200 rounded-lg">
                      <I className="h-5 w-5 text-emerald-600 mb-2" />
                      <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
                      <p className="text-gray-500 text-xs mt-1">{desc}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* ═══════════════ QUICK START ═══════════════ */}
              <section id="quickstart" className="scroll-mt-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Zap className="h-6 w-6 text-emerald-600" />
                  Quick start
                </h2>
                <p className="text-gray-700 mb-4">
                  Here&apos;s a complete SMA crossover strategy. Click <strong>Try in Playground</strong> to run it instantly.
                </p>

                <div className="flex items-center gap-3 mb-3">
                  <TryButton exampleKey="sma_crossover" />
                  <span className="text-xs text-gray-500">Opens in Playground with this code pre-loaded</span>
                </div>

                <CodeBlock code={PLAYGROUND_EXAMPLES.sma_crossover.code} />

                <div className="mt-6 space-y-3">
                  <h3 className="font-semibold text-gray-900">What&apos;s happening:</h3>
                  <ol className="list-decimal list-inside text-sm text-gray-700 space-y-2">
                    <li><code className="bg-gray-100 px-1 rounded">on_init</code> — sets default parameters for fast (10) and slow (30) moving average periods</li>
                    <li><code className="bg-gray-100 px-1 rounded">on_data</code> — called on every bar with the latest OHLCV data</li>
                    <li><code className="bg-gray-100 px-1 rounded">self.history()</code> — fetches recent bars to compute indicators</li>
                    <li><code className="bg-gray-100 px-1 rounded">self.is_flat()</code> — checks if we have no open position</li>
                    <li><code className="bg-gray-100 px-1 rounded">self.market_order()</code> — places a buy order when the fast MA crosses above the slow</li>
                    <li><code className="bg-gray-100 px-1 rounded">self.close_position()</code> — exits the trade when the fast MA crosses below</li>
                  </ol>
                </div>
              </section>

              {/* ═══════════════ STRATEGY STRUCTURE ═══════════════ */}
              <section id="structure" className="scroll-mt-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <FileCode className="h-6 w-6 text-emerald-600" />
                  Strategy structure
                </h2>
                <p className="text-gray-700 mb-4">
                  Every strategy follows this pattern:
                </p>
                <CodeBlock code={`class MyStrategy(StrategyBase):
    """Your strategy description."""

    def on_init(self):
        # Set parameters, warm-up, initial state
        self.params.setdefault('period', 20)
        self.set_warmup(bars=200)

    def on_data(self, bar):
        # Called each bar — your main trading logic
        hist = self.history(bar.symbol, 20)
        # ... compute indicators, place orders ...

    def on_order_event(self, fill):
        # Optional: react to fills
        pass

    def on_end(self):
        # Optional: cleanup after backtest
        pass`} />

                <Callout type="tip">
                  You can define helper methods on your class (like <code className="bg-emerald-100 px-1 rounded">_sma</code>, <code className="bg-emerald-100 px-1 rounded">_rsi</code>) — only the lifecycle methods are called by the engine.
                </Callout>
              </section>

              {/* ═══════════════ LIFECYCLE METHODS ═══════════════ */}
              <section id="lifecycle" className="scroll-mt-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Activity className="h-6 w-6 text-emerald-600" />
                  Lifecycle methods
                </h2>
                <div className="space-y-4">
                  <MethodCard
                    signature="on_init(self) → None"
                    description="Called once before the backtest starts. Set default parameters with self.params.setdefault(), configure warm-up with self.set_warmup(), initialize instance variables, and set up scheduled callbacks."
                  />
                  <MethodCard
                    signature="on_data(self, bar: BarData) → None"
                    description="Called on each new bar (after warm-up completes). This is where your main trading logic goes — compute indicators, check signals, and place orders. This method is abstract and must be implemented."
                  >
                    <div className="mt-2 px-2 py-1 bg-red-50 border border-red-100 rounded text-xs text-red-700">
                      Required — your strategy won&apos;t compile without this method.
                    </div>
                  </MethodCard>
                  <MethodCard
                    signature="on_order_event(self, fill: FillEvent) → None"
                    description="Called whenever an order fills. Use this for fill-based logic like adjusting trailing stops, logging trades, or placing follow-up orders."
                  />
                  <MethodCard
                    signature="on_end(self) → None"
                    description="Called when the backtest finishes. Use for cleanup, final calculations, or logging summary statistics."
                  />
                </div>
              </section>

              {/* ═══════════════ DATA & BAR OBJECT ═══════════════ */}
              <section id="data" className="scroll-mt-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <BarChart3 className="h-6 w-6 text-emerald-600" />
                  Data & bar object
                </h2>

                <h3 className="font-semibold text-gray-900 mb-3">Bar properties</h3>
                <ApiTable rows={[
                  { method: 'bar.open', description: 'Opening price' },
                  { method: 'bar.high', description: 'Highest price in the bar' },
                  { method: 'bar.low', description: 'Lowest price in the bar' },
                  { method: 'bar.close', description: 'Closing price' },
                  { method: 'bar.volume', description: 'Volume traded' },
                  { method: 'bar.symbol', description: 'Ticker symbol (e.g., "AAPL")' },
                  { method: 'bar.timestamp', description: 'Bar datetime' },
                  { method: 'bar.bar_index', description: 'Sequential bar number (0-based)' },
                  { method: 'bar.mid', description: 'Computed: (high + low) / 2' },
                  { method: 'bar.typical_price', description: 'Computed: (high + low + close) / 3' },
                  { method: 'bar.range', description: 'Computed: high - low' },
                ]} />

                <h3 className="font-semibold text-gray-900 mt-8 mb-3">Fetching history</h3>
                <MethodCard
                  signature="self.history(symbol=None, length=1) → list[BarData]"
                  description="Returns the most recent bars for a symbol. If symbol is omitted, uses the primary symbol. History buffer holds up to 500 bars per symbol."
                  returns="list[BarData]"
                />

                <CodeBlock code={`# Get last 50 bars
hist = self.history(bar.symbol, 50)
closes = [b.close for b in hist]
highs = [b.high for b in hist]

# Always guard against insufficient data
if len(hist) < 50:
    return`} />

                <h3 className="font-semibold text-gray-900 mt-8 mb-3">Strategy properties</h3>
                <ApiTable rows={[
                  { method: 'self.portfolio', description: 'Portfolio object — access cash, equity, positions, P&L' },
                  { method: 'self.time', description: 'Current simulation datetime' },
                  { method: 'self.bar_index', description: 'Current bar index (0-based)' },
                  { method: 'self.params', description: 'Strategy parameters dict (set in on_init)' },
                  { method: 'self.store', description: 'Persistent key-value store that persists between bars' },
                  { method: 'self.is_warming_up', description: 'True if still in warm-up period' },
                ]} />
              </section>

              {/* ═══════════════ BUILT-IN INDICATORS ═══════════════ */}
              <section id="indicators" className="scroll-mt-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <LineChart className="h-6 w-6 text-emerald-600" />
                  Built-in indicators
                </h2>
                <p className="text-gray-700 mb-4">
                  The engine provides 30+ built-in indicators as <strong>global classes</strong>. You don&apos;t need to import them — they&apos;re
                  available directly in your strategy code. Create an instance with parameters, then call it with your data.
                </p>

                <Callout type="info">
                  Indicators are <strong>classes, not methods on self</strong>. The pattern
                  is: <code className="bg-blue-100 px-1 rounded">IndicatorName(params)(data)</code> — instantiate with config, then call with price arrays.
                </Callout>

                <CodeBlock code={`# Single-input indicators: pass a list of closes (or other values)
closes = [b.close for b in self.history(bar.symbol, 50)]
sma_val = SMA(period=20)(closes)         # → float
ema_val = EMA(period=20)(closes)         # → float
rsi_val = RSI(period=14)(closes)         # → float

# Multi-value indicators (return a dict)
macd = MACD(fast=12, slow=26, signal=9)(closes)
# → {"macd": float, "signal": float, "histogram": float}

bb = BollingerBands(period=20, num_std=2.0)(closes)
# → {"upper": float, "middle": float, "lower": float}

# Multi-input indicators: pass high, low, close, volume as keyword args
hist = self.history(bar.symbol, 50)
highs  = [b.high for b in hist]
lows   = [b.low for b in hist]
volumes = [b.volume for b in hist]

stoch = Stochastic(k_period=14, d_period=3)(high=highs, low=lows, close=closes)
# → {"k": float, "d": float}

atr_val = ATR(period=14)(high=highs, low=lows, close=closes)
# → float

mfi_val = MFI(period=14)(high=highs, low=lows, close=closes, volume=volumes)
# → float

# You can also get a full series (useful for crossover detection)
sma_series = SMA(period=20).series(closes)   # → numpy array`} />

                <div className="mt-6 space-y-3">
                  <CollapsibleSection title="Overlays (plot on price chart)" defaultOpen>
                    <ApiTable rows={[
                      { method: 'SMA(period=20)(closes)', description: 'Simple Moving Average → float. Also has .series(closes) → array' },
                      { method: 'EMA(period=20)(closes)', description: 'Exponential Moving Average → float. Also has .series(closes) → array' },
                      { method: 'WMA(period=20)(closes)', description: 'Weighted Moving Average → float' },
                      { method: 'DEMA(period=20)(closes)', description: 'Double Exponential Moving Average → float' },
                      { method: 'TEMA(period=20)(closes)', description: 'Triple Exponential Moving Average → float' },
                      { method: 'VWAP()(high=, low=, close=, volume=)', description: 'Volume-Weighted Average Price → float' },
                      { method: 'BollingerBands(period=20, num_std=2.0)(closes)', description: '→ {"upper", "middle", "lower"}' },
                      { method: 'KeltnerChannel()(high=, low=, close=)', description: '→ {"upper", "middle", "lower"}' },
                      { method: 'DonchianChannel(period=20)(high=, low=)', description: '→ {"highest", "lowest"}' },
                      { method: 'IchimokuCloud()(high=, low=, close=)', description: 'Ichimoku Cloud components' },
                      { method: 'ParabolicSAR()(high=, low=, close=)', description: 'Parabolic Stop and Reverse → float' },
                      { method: 'Envelope(period=20, pct=2.5)(closes)', description: 'Price envelope → {"upper", "lower"}' },
                    ]} />
                  </CollapsibleSection>

                  <CollapsibleSection title="Oscillators (separate pane)">
                    <ApiTable rows={[
                      { method: 'RSI(period=14)(closes)', description: 'Relative Strength Index (0-100) → float. Also has .series()' },
                      { method: 'MACD(fast=12, slow=26, signal=9)(closes)', description: '→ {"macd", "signal", "histogram"}' },
                      { method: 'Stochastic(k_period=14, d_period=3, smooth=3)(high=, low=, close=)', description: '→ {"k", "d"}' },
                      { method: 'CCI(period=20)(high=, low=, close=)', description: 'Commodity Channel Index → float' },
                      { method: 'WilliamsR(period=14)(high=, low=, close=)', description: 'Williams %R → float' },
                      { method: 'ROC(period=12)(closes)', description: 'Rate of Change → float' },
                      { method: 'MOM(period=10)(closes)', description: 'Momentum → float' },
                      { method: 'PPO(fast=12, slow=26, signal=9)(closes)', description: 'Percentage Price Oscillator → dict' },
                      { method: 'TSI()(closes)', description: 'True Strength Index → float' },
                      { method: 'UltimateOscillator()(high=, low=, close=)', description: 'Ultimate Oscillator → float' },
                      { method: 'Aroon(period=25)(high=, low=)', description: '→ {"up", "down", "oscillator"}' },
                      { method: 'ADX(period=14)(high=, low=, close=)', description: '→ {"adx", "plus_di", "minus_di"}' },
                    ]} />
                  </CollapsibleSection>

                  <CollapsibleSection title="Volume indicators">
                    <ApiTable rows={[
                      { method: 'OBV()(close=, volume=)', description: 'On-Balance Volume → float' },
                      { method: 'MFI(period=14)(high=, low=, close=, volume=)', description: 'Money Flow Index → float' },
                      { method: 'ChaikinMoneyFlow(period=20)(high=, low=, close=, volume=)', description: 'Chaikin Money Flow → float' },
                      { method: 'ForceIndex()(close=, volume=)', description: 'Force Index → float' },
                      { method: 'AccumulationDistribution()(high=, low=, close=, volume=)', description: 'A/D Line → float' },
                      { method: 'EaseOfMovement()(high=, low=, volume=)', description: 'Ease of Movement → float' },
                    ]} />
                  </CollapsibleSection>

                  <CollapsibleSection title="Volatility">
                    <ApiTable rows={[
                      { method: 'ATR(period=14)(high=, low=, close=)', description: 'Average True Range → float' },
                      { method: 'NormalizedATR(period=14)(high=, low=, close=)', description: 'ATR as percentage of close → float' },
                      { method: 'HistoricalVolatility(period=20)(closes)', description: 'Historical (realized) volatility → float' },
                      { method: 'GarmanKlass(period=20)(open=, high=, low=, close=)', description: 'Garman-Klass volatility estimator → float' },
                    ]} />
                  </CollapsibleSection>

                  <CollapsibleSection title="Statistics">
                    <ApiTable rows={[
                      { method: 'StdDev(period=20)(closes)', description: 'Standard Deviation → float' },
                      { method: 'LinearRegression(period=20)(closes)', description: 'Linear Regression → float' },
                      { method: 'Correlation(period=20)(series_a, series_b)', description: 'Correlation between two series → float' },
                      { method: 'ZScore(period=20)(closes)', description: 'Z-Score → float' },
                      { method: 'HurstExponent(max_lag=20)(closes)', description: 'Hurst Exponent (< 0.5 mean-reverting, > 0.5 trending) → float' },
                    ]} />
                  </CollapsibleSection>
                </div>
              </section>

              {/* ═══════════════ ORDERS & POSITIONS ═══════════════ */}
              <section id="orders" className="scroll-mt-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Target className="h-6 w-6 text-emerald-600" />
                  Orders & positions
                </h2>

                <h3 className="font-semibold text-gray-900 mb-3">Order methods</h3>
                <p className="text-gray-700 mb-4 text-sm">
                  All order methods return an <code className="bg-gray-100 px-1 rounded">Order</code> object. Use positive quantity for buy, negative for sell.
                </p>
                <div className="space-y-3">
                  <MethodCard
                    signature="self.market_order(symbol, quantity) → Order"
                    description="Submit a market order. Fills at the next bar's open price (or intrabar if enabled). Positive qty = buy, negative = sell."
                  />
                  <MethodCard
                    signature="self.limit_order(symbol, quantity, price) → Order"
                    description="Submit a limit order. Buy limit fills at price or better (lower). Sell limit fills at price or better (higher)."
                  />
                  <MethodCard
                    signature="self.stop_order(symbol, quantity, stop_price) → Order"
                    description="Submit a stop-market order. Triggers a market order when the stop price is hit."
                  />
                  <MethodCard
                    signature="self.stop_limit_order(symbol, quantity, stop_price, limit_price) → Order"
                    description="Submit a stop-limit order. When stop price is hit, a limit order is placed at the limit price."
                  />
                  <MethodCard
                    signature="self.trailing_stop(symbol, quantity, trail_amount=None, trail_percent=None) → Order"
                    description="Submit a trailing stop order. Specify either an absolute trail_amount or a trail_percent (not both). The stop price adjusts as price moves in your favor."
                  />
                </div>

                <h3 className="font-semibold text-gray-900 mt-8 mb-3">Position management</h3>
                <ApiTable rows={[
                  { method: 'self.is_flat(symbol)', description: 'True if no open position' },
                  { method: 'self.is_long(symbol)', description: 'True if long position (quantity > 0)' },
                  { method: 'self.is_short(symbol)', description: 'True if short position (quantity < 0)' },
                  { method: 'self.position_size(symbol)', description: 'Current quantity — positive = long, negative = short, 0 = flat' },
                  { method: 'self.close_position(symbol)', description: 'Close entire position with a market order' },
                  { method: 'self.cancel_all_orders(symbol=None)', description: 'Cancel all pending orders. Optionally filter by symbol. Returns count cancelled.' },
                ]} />
              </section>

              {/* ═══════════════ ADVANCED ORDERS ═══════════════ */}
              <section id="advanced-orders" className="scroll-mt-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Layers className="h-6 w-6 text-emerald-600" />
                  Advanced orders
                </h2>

                <div className="space-y-4">
                  <MethodCard
                    signature='self.bracket_order(symbol, quantity, take_profit_price, stop_loss_price, entry_price=None) → {"entry", "take_profit", "stop_loss"}'
                    description="Submit a bracket (OCO) order. Places an entry order with automatic take-profit and stop-loss. When one side fills, the other is automatically cancelled. If entry_price is None, the entry is a market order; otherwise a limit order."
                  />
                  <MethodCard
                    signature='self.oco_order(symbol, order_a, order_b) → {"order_a", "order_b"}'
                    description='One-Cancels-Other: submit two orders — when one fills, the other is cancelled. Each order dict: {"quantity", "price", "order_type": "limit"|"stop"}.'
                  />
                </div>

                <div className="mt-6">
                  <div className="flex items-center gap-3 mb-3">
                    <TryButton exampleKey="bracket_example" />
                    <span className="text-xs text-gray-500">Bracket order with SMA entry signal</span>
                  </div>
                  <CodeBlock code={PLAYGROUND_EXAMPLES.bracket_example.code} />
                </div>

                <h3 className="font-semibold text-gray-900 mt-8 mb-3">Order object properties</h3>
                <ApiTable rows={[
                  { method: 'order.status', description: 'CREATED, SUBMITTED, PARTIALLY_FILLED, FILLED, CANCELLED, REJECTED' },
                  { method: 'order.filled_quantity', description: 'Quantity filled so far' },
                  { method: 'order.avg_fill_price', description: 'Volume-weighted average fill price' },
                  { method: 'order.commission', description: 'Commission charged on this order' },
                  { method: 'order.slippage_cost', description: 'Slippage cost on this order' },
                  { method: 'order.remaining_quantity', description: 'Quantity remaining to fill' },
                  { method: 'order.is_active', description: 'True if SUBMITTED or PARTIALLY_FILLED' },
                  { method: 'order.is_terminal', description: 'True if FILLED, CANCELLED, or REJECTED' },
                ]} />
              </section>

              {/* ═══════════════ EXECUTION ALGORITHMS ═══════════════ */}
              <section id="execution" className="scroll-mt-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Gauge className="h-6 w-6 text-emerald-600" />
                  Execution algorithms
                </h2>
                <p className="text-gray-700 mb-4">
                  Split large orders across multiple bars to reduce market impact. Each returns an executor
                  object with <code className="bg-gray-100 px-1 rounded">is_complete</code> and <code className="bg-gray-100 px-1 rounded">fill_pct</code> properties.
                </p>

                <div className="space-y-4">
                  <MethodCard
                    signature="self.twap_order(symbol, quantity, num_slices=10) → TWAPExecutor"
                    description="Time-Weighted Average Price. Splits the order into equal-sized market orders distributed over N bars."
                  />
                  <MethodCard
                    signature="self.vwap_order(symbol, quantity, num_slices=10, volume_profile=None) → VWAPExecutor"
                    description="Volume-Weighted Average Price. Distributes order slices proportional to the volume profile. Pass a custom volume_profile list or let the engine use actual volume."
                  />
                  <MethodCard
                    signature="self.iceberg_order(symbol, quantity, visible_quantity, limit_price=None) → IcebergExecutor"
                    description="Iceberg order. Shows only visible_quantity at a time. Automatically submits the next slice when the current one fills. Use limit_price for limit orders, omit for market."
                  />
                  <MethodCard
                    signature="self.pov_order(symbol, quantity, max_pct_of_volume=0.1) → POVExecutor"
                    description="Percentage of Volume. Limits execution to max_pct_of_volume of each bar's volume. Continues until the full quantity is filled."
                  />
                </div>

                <div className="mt-6">
                  <div className="flex items-center gap-3 mb-3">
                    <TryButton exampleKey="twap_example" />
                    <span className="text-xs text-gray-500">TWAP order split across 10 bars</span>
                  </div>
                  <CodeBlock code={PLAYGROUND_EXAMPLES.twap_example.code} />
                </div>
              </section>

              {/* ═══════════════ PORTFOLIO API ═══════════════ */}
              <section id="portfolio" className="scroll-mt-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <TrendingUp className="h-6 w-6 text-emerald-600" />
                  Portfolio API
                </h2>
                <p className="text-gray-700 mb-4">
                  Access portfolio state via <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">self.portfolio</code>.
                </p>

                <ApiTable rows={[
                  { method: 'self.portfolio.equity', description: 'Total portfolio value (cash + positions at market)' },
                  { method: 'self.portfolio.cash', description: 'Available cash balance' },
                  { method: 'self.portfolio.unrealized_pnl', description: 'Unrealized profit/loss on open positions' },
                  { method: 'self.portfolio.realized_pnl', description: 'Realized profit/loss from closed trades' },
                  { method: 'self.portfolio.total_pnl', description: 'Total P&L (realized + unrealized)' },
                  { method: 'self.portfolio.total_return_pct', description: 'Total return as a percentage' },
                  { method: 'self.portfolio.buying_power', description: 'Available buying power (considers margin if enabled)' },
                  { method: 'self.portfolio.margin_used', description: 'Margin currently in use' },
                  { method: 'self.portfolio.margin_available', description: 'Remaining margin available' },
                ]} />

                <h3 className="font-semibold text-gray-900 mt-8 mb-3">Position object</h3>
                <CodeBlock code={`# Access a specific position
pos = self.portfolio.get_position(bar.symbol)
if pos:
    print(pos.quantity)        # Number of shares
    print(pos.avg_cost)        # Average cost basis
    print(pos.realized_pnl)    # Realized P&L
    print(pos.unrealized_pnl(bar.close))  # Current unrealized P&L
    print(pos.is_long)         # True if long
    print(pos.total_commission) # Total commission paid

# Check if position exists
has_pos = self.portfolio.has_position(bar.symbol)
qty = self.portfolio.get_position_quantity(bar.symbol)`} />
              </section>

              {/* ═══════════════ CUSTOM CHARTS & ALERTS ═══════════════ */}
              <section id="charts" className="scroll-mt-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Activity className="h-6 w-6 text-emerald-600" />
                  Custom charts & alerts
                </h2>

                <div className="space-y-4">
                  <MethodCard
                    signature='self.plot(chart_name, series_name, value) → None'
                    description='Plot a value on a custom chart pane. chart_name groups series together, series_name identifies the line within that chart. Call once per bar to build a time series.'
                  />
                  <MethodCard
                    signature='self.notify(message, level="info", data=None) → None'
                    description='Send a notification/alert. Level can be "info", "warning", or "critical". Optional data dict for extra context. Alerts are shown in the results panel.'
                  />
                </div>

                <div className="mt-6">
                  <div className="flex items-center gap-3 mb-3">
                    <TryButton exampleKey="custom_chart" />
                    <span className="text-xs text-gray-500">RSI + Z-Score with chart overlays</span>
                  </div>
                  <CodeBlock code={PLAYGROUND_EXAMPLES.custom_chart.code} />
                </div>
              </section>

              {/* ═══════════════ BAR CONSOLIDATORS ═══════════════ */}
              <section id="consolidators" className="scroll-mt-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Timer className="h-6 w-6 text-emerald-600" />
                  Bar consolidators
                </h2>
                <p className="text-gray-700 mb-4">
                  Aggregate lower-timeframe bars into higher timeframes directly in your strategy.
                  Consolidators are available as global classes — no imports needed.
                </p>

                <div className="space-y-4">
                  <MethodCard
                    signature="TimeConsolidator(minutes=60, callback=fn)"
                    description="Aggregates bars by time. Feed 1-minute bars to get 5-minute, 1-hour, 4-hour, etc. The callback is called with a ConsolidatedBar when each period completes."
                  />
                  <MethodCard
                    signature="BarCountConsolidator(count=10, callback=fn)"
                    description="Aggregates every N bars into one. Useful for fixed-count aggregation regardless of time."
                  />
                  <MethodCard
                    signature="RenkoConsolidator(brick_size=10.0, callback=fn)"
                    description="Creates Renko bars based on price movement. A new brick is formed when price moves by brick_size from the previous brick's close."
                  />
                  <MethodCard
                    signature="RangeConsolidator(range_size=5.0, callback=fn)"
                    description="Creates range bars with a fixed price range. A new bar forms when the high-low range exceeds range_size."
                  />
                </div>

                <CodeBlock code={`class MyStrategy(StrategyBase):
    """
    Multi-timeframe strategy using bar consolidators.
    Uses 1-hour bars derived from lower-timeframe data.
    """
    def on_init(self):
        # Create a 1-hour consolidator
        self.hourly = TimeConsolidator(
            minutes=60, callback=self.on_hourly)
        self.hourly_sma = None

    def on_data(self, bar):
        # Feed every bar into the consolidator
        self.hourly.update(bar)

        # Trade based on hourly signal + current bar
        if self.hourly_sma and self.is_flat(bar.symbol):
            if bar.close > self.hourly_sma:
                qty = max(1, int(self.portfolio.cash * 0.95 / bar.close))
                self.market_order(bar.symbol, qty)
        elif self.is_long(bar.symbol) and self.hourly_sma:
            if bar.close < self.hourly_sma:
                self.close_position(bar.symbol)

    def on_hourly(self, consolidated_bar):
        # Called when a 1-hour bar completes
        hist = self.history(length=50)
        if len(hist) >= 20:
            closes = [b.close for b in hist[-20:]]
            self.hourly_sma = SMA(period=20)(closes)`} />

                <Callout type="tip">
                  The <code className="bg-emerald-100 px-1 rounded">ConsolidatedBar</code> object has the same
                  fields as a regular bar (<code className="bg-emerald-100 px-1 rounded">open</code>, <code className="bg-emerald-100 px-1 rounded">high</code>,
                  <code className="bg-emerald-100 px-1 rounded">low</code>, <code className="bg-emerald-100 px-1 rounded">close</code>,
                  <code className="bg-emerald-100 px-1 rounded">volume</code>) plus <code className="bg-emerald-100 px-1 rounded">start_time</code>,
                  <code className="bg-emerald-100 px-1 rounded">end_time</code>, and <code className="bg-emerald-100 px-1 rounded">bar_count</code>.
                </Callout>
              </section>

              {/* ═══════════════ SCHEDULING & STATE ═══════════════ */}
              <section id="scheduling" className="scroll-mt-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Clock className="h-6 w-6 text-emerald-600" />
                  Scheduling & state
                </h2>

                <div className="space-y-4">
                  <MethodCard
                    signature="self.set_warmup(bars=0) → None"
                    description="Set warm-up period. on_data() won't be called until the specified number of bars have passed. Use this for indicators that need historical data to stabilize."
                  />
                  <MethodCard
                    signature="self.schedule(name, every_n_bars, callback) → None"
                    description="Schedule a callback to run every N bars. The callback receives no arguments — use self.history() inside it to access data."
                  />
                  <MethodCard
                    signature="self.store"
                    description="A persistent dict that survives between bars. Use it to store custom state like running totals, counters, or cross-bar signal data."
                  />
                </div>

                <div className="mt-6">
                  <div className="flex items-center gap-3 mb-3">
                    <TryButton exampleKey="scheduled_rebalance" />
                    <span className="text-xs text-gray-500">Periodic rebalance with self.schedule()</span>
                  </div>
                  <CodeBlock code={PLAYGROUND_EXAMPLES.scheduled_rebalance.code} />
                </div>
              </section>

              {/* ═══════════════ PARAMETERS ═══════════════ */}
              <section id="parameters" className="scroll-mt-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Terminal className="h-6 w-6 text-emerald-600" />
                  Parameters
                </h2>
                <p className="text-gray-700 mb-4">
                  Define parameters in <code className="bg-gray-100 px-1.5 rounded">on_init</code> with <code className="bg-gray-100 px-1.5 rounded">self.params.setdefault()</code>.
                  Parameters appear as adjustable inputs in the Playground sidebar and can be optimized using grid search, Bayesian optimization, or genetic algorithms.
                </p>
                <CodeBlock code={`def on_init(self):
    # These become sliders/inputs in the Playground
    self.params.setdefault('fast', 10)       # Fast MA period
    self.params.setdefault('slow', 30)       # Slow MA period
    self.params.setdefault('threshold', 2.0) # Entry threshold

def on_data(self, bar):
    fast = self.params['fast']   # Read current value
    slow = self.params['slow']
    # ... use parameters in your logic`} />

                <Callout type="tip">
                  When you run optimization, the engine sweeps through parameter combinations
                  and ranks results by Sharpe ratio, return, or your chosen objective. Use <code className="bg-emerald-100 px-1 rounded">self.params.setdefault()</code> (not direct assignment)
                  so the optimizer can inject values.
                </Callout>
              </section>

              {/* ═══════════════ RESTRICTIONS ═══════════════ */}
              <section id="restrictions" className="scroll-mt-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Shield className="h-6 w-6 text-emerald-600" />
                  Restrictions
                </h2>
                <p className="text-gray-700 mb-4">
                  Strategy code runs in a sandboxed environment. The validator checks your code before execution.
                </p>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <h3 className="font-semibold text-emerald-800 text-sm mb-2 flex items-center gap-1.5">
                      <Check className="h-4 w-4" /> Allowed imports
                    </h3>
                    <ul className="text-sm text-emerald-700 space-y-1">
                      <li><code className="bg-emerald-100 px-1 rounded">math</code></li>
                      <li><code className="bg-emerald-100 px-1 rounded">numpy</code> / <code className="bg-emerald-100 px-1 rounded">np</code></li>
                      <li><code className="bg-emerald-100 px-1 rounded">pandas</code> / <code className="bg-emerald-100 px-1 rounded">pd</code></li>
                      <li><code className="bg-emerald-100 px-1 rounded">statistics</code></li>
                      <li><code className="bg-emerald-100 px-1 rounded">collections</code>, <code className="bg-emerald-100 px-1 rounded">itertools</code>, <code className="bg-emerald-100 px-1 rounded">functools</code></li>
                      <li><code className="bg-emerald-100 px-1 rounded">datetime</code>, <code className="bg-emerald-100 px-1 rounded">decimal</code></li>
                    </ul>
                  </div>

                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <h3 className="font-semibold text-red-800 text-sm mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" /> Blocked
                    </h3>
                    <ul className="text-sm text-red-700 space-y-1">
                      <li><code className="bg-red-100 px-1 rounded">os</code>, <code className="bg-red-100 px-1 rounded">sys</code>, <code className="bg-red-100 px-1 rounded">subprocess</code></li>
                      <li><code className="bg-red-100 px-1 rounded">socket</code>, <code className="bg-red-100 px-1 rounded">requests</code>, <code className="bg-red-100 px-1 rounded">http</code></li>
                      <li><code className="bg-red-100 px-1 rounded">multiprocessing</code>, <code className="bg-red-100 px-1 rounded">threading</code></li>
                      <li>Builtins: <code className="bg-red-100 px-1 rounded">exec</code>, <code className="bg-red-100 px-1 rounded">eval</code>, <code className="bg-red-100 px-1 rounded">compile</code>, <code className="bg-red-100 px-1 rounded">open</code>, <code className="bg-red-100 px-1 rounded">input</code></li>
                      <li>Builtins: <code className="bg-red-100 px-1 rounded">__import__</code>, <code className="bg-red-100 px-1 rounded">globals</code>, <code className="bg-red-100 px-1 rounded">getattr</code>, <code className="bg-red-100 px-1 rounded">setattr</code></li>
                      <li>All <code className="bg-red-100 px-1 rounded">__dunder__</code> attribute access</li>
                    </ul>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <Callout type="warning">
                    The history buffer holds a maximum of <strong>500 bars</strong> per symbol. If your strategy
                    needs more lookback, consider computing running averages incrementally using <code className="bg-amber-100 px-1 rounded">self.store</code>.
                  </Callout>
                </div>
              </section>

              {/* ═══════════════ VERSION CONTROL ═══════════════ */}
              <section id="version-control" className="scroll-mt-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <GitBranch className="h-6 w-6 text-emerald-600" />
                  Version control
                </h2>
                <p className="text-gray-700 mb-4">
                  Custom strategies support Git-style versioning in the Playground code editor:
                </p>

                <div className="space-y-4">
                  <div className="flex gap-3 p-4 bg-white border border-gray-200 rounded-lg">
                    <Save className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-gray-900">Save</h3>
                      <p className="text-gray-600 text-sm mt-1">
                        Persists your working copy without creating a version. Auto-saves periodically while editing.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-4 bg-white border border-gray-200 rounded-lg">
                    <GitBranch className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-gray-900">Commit</h3>
                      <p className="text-gray-600 text-sm mt-1">
                        Creates a new version with a title and optional description. Each commit is a snapshot you can restore later.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-4 bg-white border border-gray-200 rounded-lg">
                    <Box className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-gray-900">Revert</h3>
                      <p className="text-gray-600 text-sm mt-1">
                        Restores your working copy to a previous version. You can also rename and delete strategies from the strategy list.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* ═══════════════ CTA ═══════════════ */}
              <section className="mt-16 p-6 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-100 rounded-lg">
                    <Play className="h-8 w-8 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Ready to build?</h2>
                    <p className="text-gray-600 text-sm mt-1">
                      Open the Playground and start with a template or write your own strategy from scratch.
                    </p>
                    <Link
                      href="/playground"
                      className="inline-flex items-center gap-2 mt-3 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition shadow-sm"
                    >
                      <Play className="h-4 w-4" />
                      Open Playground
                    </Link>
                  </div>
                </div>
              </section>
            </article>
          </main>
        </div>
      </div>
    </div>
  );
}
