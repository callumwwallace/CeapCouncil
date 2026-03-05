'use client';

import Link from 'next/link';
import { FileCode, Book, Save, GitBranch, Play } from 'lucide-react';

const SECTIONS = [
  { id: 'overview', title: 'Overview' },
  { id: 'structure', title: 'Strategy structure' },
  { id: 'lifecycle', title: 'Lifecycle methods' },
  { id: 'data', title: 'Data & indicators' },
  { id: 'orders', title: 'Orders & positions' },
  { id: 'parameters', title: 'Parameters' },
  { id: 'restrictions', title: 'Restrictions' },
  { id: 'version-control', title: 'Version control' },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-gray-900">Documentation</h1>
          <p className="mt-2 text-gray-600">
            Learn how to create, backtest, and version your trading strategies on Ceap Council.
          </p>
        </div>

        <nav className="mb-12 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Contents</h2>
          <ul className="space-y-2">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-emerald-600 hover:text-emerald-700 hover:underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <article className="prose prose-emerald max-w-none">
          {/* Overview */}
          <section id="overview" className="mb-16 scroll-mt-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Book className="h-6 w-6 text-emerald-600" />
              Overview
            </h2>
            <p className="text-gray-700 leading-relaxed">
              Ceap Council lets you write custom trading strategies in Python. Strategies run in a sandboxed backtest
              engine and can be saved, versioned, and shared. Use the <Link href="/playground" className="text-emerald-600 hover:underline">Playground</Link> to
              build, run, and iterate on your ideas.
            </p>
            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
              <strong>Note:</strong> You must define a class named <code className="bg-amber-100 px-1 rounded">MyStrategy</code> that inherits
              from <code className="bg-amber-100 px-1 rounded">StrategyBase</code>. The engine validates and compiles your code before running.
            </div>
          </section>

          {/* Strategy structure */}
          <section id="structure" className="mb-16 scroll-mt-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <FileCode className="h-6 w-6 text-emerald-600" />
              Strategy structure
            </h2>
            <p className="text-gray-700 mb-4">
              Every strategy is a Python class with a specific structure:
            </p>
            <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
{`class MyStrategy(StrategyBase):
    """
    Your strategy description.
    """

    def on_init(self):
        # Called once at startup
        self.params.setdefault('fast', 10)
        self.params.setdefault('slow', 30)

    def on_data(self, bar):
        # Called on each new bar
        if self.is_flat(bar.symbol):
            hist = self.history(bar.symbol, 20)
            if len(hist) >= 20:
                # Your logic here
                qty = int(self.portfolio.cash * 0.95 / bar.close)
                self.market_order(bar.symbol, qty)
        elif self.is_long(bar.symbol):
            self.close_position(bar.symbol)`}
            </pre>
          </section>

          {/* Lifecycle methods */}
          <section id="lifecycle" className="mb-16 scroll-mt-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Lifecycle methods</h2>
            <p className="text-gray-700 mb-6">
              Override these methods to implement your strategy:
            </p>
            <div className="space-y-6">
              <div className="border border-gray-200 rounded-lg p-4 bg-white">
                <h3 className="font-mono text-emerald-700 font-semibold">on_init(self)</h3>
                <p className="mt-2 text-gray-600 text-sm">
                  Called once before the backtest starts. Use it to set default parameters with{' '}
                  <code className="bg-gray-100 px-1 rounded">self.params.setdefault(&apos;name&apos;, value)</code> and
                  configure warm-up with <code className="bg-gray-100 px-1 rounded">self.set_warmup(bars=200)</code>.
                </p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4 bg-white">
                <h3 className="font-mono text-emerald-700 font-semibold">on_data(self, bar)</h3>
                <p className="mt-2 text-gray-600 text-sm">
                  Called on each new bar. Implement your entry/exit logic here. The <code className="bg-gray-100 px-1 rounded">bar</code> object
                  has <code className="bg-gray-100 px-1 rounded">bar.open</code>, <code className="bg-gray-100 px-1 rounded">bar.high</code>,{' '}
                  <code className="bg-gray-100 px-1 rounded">bar.low</code>, <code className="bg-gray-100 px-1 rounded">bar.close</code>, and{' '}
                  <code className="bg-gray-100 px-1 rounded">bar.symbol</code>.
                </p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4 bg-white">
                <h3 className="font-mono text-emerald-700 font-semibold">on_order_event(self, fill)</h3>
                <p className="mt-2 text-gray-600 text-sm">
                  Called when an order fills. Override for fill-based logic (e.g. trailing stops).
                </p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4 bg-white">
                <h3 className="font-mono text-emerald-700 font-semibold">on_end(self)</h3>
                <p className="mt-2 text-gray-600 text-sm">
                  Called when the backtest finishes. Override for cleanup or final calculations.
                </p>
              </div>
            </div>
          </section>

          {/* Data & indicators */}
          <section id="data" className="mb-16 scroll-mt-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Data & indicators</h2>
            <p className="text-gray-700 mb-4">
              Access historical bars and compute indicators manually:
            </p>
            <div className="space-y-4">
              <div>
                <h3 className="font-mono text-sm text-emerald-700 font-semibold">self.history(symbol, length)</h3>
                <p className="text-gray-600 text-sm mt-1">
                  Returns the last <code className="bg-gray-100 px-1 rounded">length</code> bars for a symbol. Use it to compute
                  moving averages, RSI, etc. Always check you have enough data: <code className="bg-gray-100 px-1 rounded">if len(hist) &lt; period: return</code>.
                </p>
              </div>
              <div>
                <h3 className="font-mono text-sm text-emerald-700 font-semibold">bar object</h3>
                <p className="text-gray-600 text-sm mt-1">
                  Each bar has <code className="bg-gray-100 px-1 rounded">open</code>, <code className="bg-gray-100 px-1 rounded">high</code>,{' '}
                  <code className="bg-gray-100 px-1 rounded">low</code>, <code className="bg-gray-100 px-1 rounded">close</code>,{' '}
                  <code className="bg-gray-100 px-1 rounded">volume</code>, and <code className="bg-gray-100 px-1 rounded">symbol</code>.
                </p>
              </div>
              <div>
                <h3 className="font-mono text-sm text-emerald-700 font-semibold">self.set_warmup(bars=200)</h3>
                <p className="text-gray-600 text-sm mt-1">
                  Skip the first N bars before <code className="bg-gray-100 px-1 rounded">on_data</code> is called. Useful for long-period indicators.
                </p>
              </div>
            </div>
          </section>

          {/* Orders & positions */}
          <section id="orders" className="mb-16 scroll-mt-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Orders & positions</h2>
            <div className="space-y-4">
              <table className="w-full border-collapse border border-gray-300 text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Method</th>
                    <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 font-mono">market_order(symbol, qty)</td>
                    <td className="border border-gray-300 px-3 py-2">Submit a market order. Use positive qty for buy, negative for sell.</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 font-mono">close_position(symbol)</td>
                    <td className="border border-gray-300 px-3 py-2">Close the entire position for a symbol.</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 font-mono">is_flat(symbol)</td>
                    <td className="border border-gray-300 px-3 py-2">True if no open position.</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 font-mono">is_long(symbol)</td>
                    <td className="border border-gray-300 px-3 py-2">True if long position.</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 font-mono">is_short(symbol)</td>
                    <td className="border border-gray-300 px-3 py-2">True if short position.</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 font-mono">position_size(symbol)</td>
                    <td className="border border-gray-300 px-3 py-2">Current position quantity (positive=long, negative=short).</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 font-mono">self.portfolio.cash</td>
                    <td className="border border-gray-300 px-3 py-2">Available cash.</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 font-mono">self.portfolio.equity</td>
                    <td className="border border-gray-300 px-3 py-2">Total portfolio equity (cash + positions).</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Parameters */}
          <section id="parameters" className="mb-16 scroll-mt-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Parameters</h2>
            <p className="text-gray-700 mb-4">
              Define parameters in <code className="bg-gray-100 px-1 rounded">on_init</code> with <code className="bg-gray-100 px-1 rounded">self.params.setdefault</code>.
              They appear as adjustable inputs in the Playground and can be optimized.
            </p>
            <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
{`def on_init(self):
    self.params.setdefault('fast', 10)
    self.params.setdefault('slow', 30)
    self.params.setdefault('period', 20)

def on_data(self, bar):
    fast = self.params['fast']
    slow = self.params['slow']`}
            </pre>
          </section>

          {/* Restrictions */}
          <section id="restrictions" className="mb-16 scroll-mt-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Restrictions</h2>
            <p className="text-gray-700 mb-4">
              For security, strategy code runs in a sandbox with restricted imports and builtins:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 mb-4">
              <li><strong>Forbidden imports:</strong> os, sys, subprocess, socket, requests, multiprocessing, threading, and similar.</li>
              <li><strong>Allowed:</strong> math, statistics, numpy, pandas (for indicator calculations).</li>
              <li><strong>Blocked builtins:</strong> exec, eval, open, input, __import__, etc.</li>
            </ul>
            <p className="text-gray-700">
              The validator runs before backtests and will report errors for invalid code.
            </p>
          </section>

          {/* Version control */}
          <section id="version-control" className="mb-16 scroll-mt-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <GitBranch className="h-6 w-6 text-emerald-600" />
              Version control
            </h2>
            <p className="text-gray-700 mb-4">
              Custom strategies support Git-style versioning in the Playground:
            </p>
            <div className="space-y-4">
              <div className="flex gap-3">
                <Save className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-gray-900">Save</h3>
                  <p className="text-gray-700 text-sm">
                    Persists your working copy without creating a version. Use it to save progress while editing.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <GitBranch className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-gray-900">Commit</h3>
                  <p className="text-gray-700 text-sm">
                    Creates a new version in history with a required commit message. Like a Git commit.
                  </p>
                </div>
              </div>
              <p className="text-gray-700 text-sm">
                <strong>Revert</strong> restores your working copy to a previous version without creating a new commit.
                You can rename and delete strategies from the custom strategy list.
              </p>
            </div>
          </section>

          {/* CTA */}
          <section className="mt-16 p-6 bg-emerald-50 border border-emerald-200 rounded-lg">
            <div className="flex items-center gap-3">
              <Play className="h-8 w-8 text-emerald-600" />
              <div>
                <h2 className="text-lg font-bold text-gray-900">Ready to build?</h2>
                <p className="text-gray-600 text-sm mt-1">
                  Open the Playground and start with a template or create a custom strategy from scratch.
                </p>
                <Link
                  href="/playground"
                  className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition"
                >
                  <Play className="h-4 w-4" />
                  Open Playground
                </Link>
              </div>
            </div>
          </section>
        </article>
      </div>
    </div>
  );
}
