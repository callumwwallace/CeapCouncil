import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Code2,
  Trophy,
  MessageSquare,
  BookOpen,
  ArrowRight,
  GitFork,
  Archive,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Ceap Council - Build & Backtest Trading Strategies',
  description:
    'Free platform for algorithmic traders. Write Python trading strategies, backtest on real historical market data, and learn from a community of systematic traders.',
  alternates: { canonical: 'https://ceapcouncil.com' },
  openGraph: {
    title: 'Ceap Council - Build & Backtest Trading Strategies',
    description: 'Write Python strategies, backtest on real market data, and learn alongside other systematic traders.',
    url: 'https://ceapcouncil.com',
  },
};

function CodePreview() {
  return (
    <div className="rounded-2xl overflow-hidden shadow-2xl shadow-slate-900/30 border border-gray-200">
      {/* Editor panel - matches actual #0d1117 editor bg */}
      <div style={{ backgroundColor: '#0d1117' }}>
        {/* Window chrome */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700/60" style={{ backgroundColor: '#161b22' }}>
          <span className="w-3 h-3 rounded-full bg-red-500/70" />
          <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
          <span className="w-3 h-3 rounded-full bg-emerald-500/70" />
          <span className="ml-3 text-xs font-mono" style={{ color: '#8b949e', fontFamily: "'SF Mono', 'Fira Code', 'Monaco', monospace" }}>momentum_v2.py</span>
        </div>
        {/* Code - token colors match ceapcouncil-dark Monaco theme */}
        <div className="p-5 text-[13px] leading-[20px]" style={{ fontFamily: "'SF Mono', 'Fira Code', 'Monaco', monospace", letterSpacing: '0.3px' }}>
          <div>
            <span style={{ color: '#c586c0' }}>class </span>
            <span style={{ color: '#4ec9b0' }}>MomentumStrategy</span>
            <span style={{ color: '#e6edf3' }}>(</span>
            <span style={{ color: '#4ec9b0' }}>StrategyBase</span>
            <span style={{ color: '#e6edf3' }}>):</span>
          </div>
          <div className="mt-3 pl-6">
            <span style={{ color: '#c586c0' }}>def </span>
            <span style={{ color: '#dcdcaa' }}>on_bar</span>
            <span style={{ color: '#e6edf3' }}>(</span>
            <span style={{ color: '#9cdcfe' }}>self</span>
            <span style={{ color: '#e6edf3' }}>, </span>
            <span style={{ color: '#9cdcfe' }}>bar</span>
            <span style={{ color: '#e6edf3' }}>):</span>
          </div>
          <div className="pl-12">
            <span style={{ color: '#9cdcfe' }}>sma</span>
            <span style={{ color: '#e6edf3' }}> = </span>
            <span style={{ color: '#9cdcfe' }}>self</span>
            <span style={{ color: '#e6edf3' }}>.indicator(</span>
            <span style={{ color: '#ce9178' }}>&apos;SMA&apos;</span>
            <span style={{ color: '#e6edf3' }}>, period=</span>
            <span style={{ color: '#b5cea8' }}>20</span>
            <span style={{ color: '#e6edf3' }}>)</span>
          </div>
          <div className="mt-3 pl-12">
            <span style={{ color: '#c586c0' }}>if </span>
            <span style={{ color: '#9cdcfe' }}>bar</span>
            <span style={{ color: '#e6edf3' }}>.close &gt; </span>
            <span style={{ color: '#9cdcfe' }}>sma</span>
            <span style={{ color: '#c586c0' }}> and not </span>
            <span style={{ color: '#9cdcfe' }}>self</span>
            <span style={{ color: '#e6edf3' }}>.position:</span>
          </div>
          <div className="pl-20">
            <span style={{ color: '#9cdcfe' }}>self</span>
            <span style={{ color: '#e6edf3' }}>.buy(size=</span>
            <span style={{ color: '#b5cea8' }}>0.95</span>
            <span style={{ color: '#e6edf3' }}>)</span>
          </div>
          <div className="mt-2 pl-12">
            <span style={{ color: '#c586c0' }}>elif </span>
            <span style={{ color: '#9cdcfe' }}>bar</span>
            <span style={{ color: '#e6edf3' }}>.close &lt; </span>
            <span style={{ color: '#9cdcfe' }}>sma</span>
            <span style={{ color: '#c586c0' }}> and </span>
            <span style={{ color: '#9cdcfe' }}>self</span>
            <span style={{ color: '#e6edf3' }}>.position:</span>
          </div>
          <div className="pl-20">
            <span style={{ color: '#9cdcfe' }}>self</span>
            <span style={{ color: '#e6edf3' }}>.sell()</span>
          </div>
        </div>
      </div>
      {/* Backtest results - matches actual ResultsPanel light theme */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-t border-emerald-100 px-5 py-4">
        <div className="text-[10px] text-gray-500 mb-3 font-mono uppercase tracking-wider">Backtest result</div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] text-gray-500 uppercase mb-0.5">Sharpe</div>
            <div className="text-sm font-semibold text-emerald-600 font-mono">1.82</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500 uppercase mb-0.5">Return</div>
            <div className="text-sm font-semibold text-emerald-600 font-mono">+34.1%</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500 uppercase mb-0.5">Max DD</div>
            <div className="text-sm font-semibold text-amber-600 font-mono">-8.3%</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="bg-white">

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-100 via-slate-50 to-white border-b border-slate-200">
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23334155' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
        {/* Glow accent */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
          <div className="flex flex-col lg:flex-row lg:items-center gap-14 lg:gap-16">
            {/* Left — copy */}
            <div className="flex-1 max-w-xl">
              <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-bold text-slate-900 leading-tight tracking-tight">
                Build and test your<br className="hidden sm:block" /> trading strategies.
              </h1>
              <p className="mt-6 text-lg text-slate-500 leading-relaxed">
                Write Python strategies, backtest them on real historical data, and develop your approach at your own pace. When you're ready, compete against other traders or share ideas in the community.
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
                <Link
                  href="/playground"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold rounded-lg shadow-lg shadow-emerald-500/20 transition"
                >
                  Try Playground
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 px-6 py-3 border border-slate-300 text-slate-700 hover:bg-slate-100 hover:border-slate-400 font-medium rounded-lg transition"
                >
                  Create free account
                </Link>
              </div>
              <p className="mt-5 text-sm text-slate-400">
                Free to use. Your strategies stay private by default.
              </p>
            </div>
            {/* Right — code preview */}
            <div className="flex-1 max-w-lg w-full">
              <CodePreview />
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-14">
            <div className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-3">How it works</div>
            <h2 className="text-3xl font-bold text-slate-900 max-w-lg">
              From idea to results in three steps.
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connecting line (desktop only) */}
            <div className="hidden md:block absolute top-6 left-[calc(16.67%+12px)] right-[calc(16.67%+12px)] h-px bg-slate-200 pointer-events-none" />
            {[
              {
                n: '01',
                title: 'Write your strategy',
                body: 'Open the Playground and start coding in Python. Use our StrategyBase API with built-in indicators. Save and version your work as you go.',
              },
              {
                n: '02',
                title: 'Run a backtest',
                body: 'Pick a symbol, date range, and starting capital. You get back an equity curve, trade log, Sharpe ratio, drawdown, and more.',
              },
              {
                n: '03',
                title: 'Share or compete',
                body: 'Keep refining on your own, or put your strategy to the test in a live competition. You can also browse the forum, fork what others have shared, and learn from the community.',
              },
            ].map(({ n, title, body }) => (
              <div key={n} className="relative group">
                <div className="w-12 h-12 rounded-full bg-white border-2 border-slate-200 group-hover:border-emerald-400 group-hover:bg-emerald-50 flex items-center justify-center mb-5 relative z-10 transition-colors duration-200">
                  <span className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors duration-200">{n}</span>
                </div>
                <h3 className="font-semibold text-slate-900 mb-2 text-lg">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Three pillars */}
      <section className="py-24 bg-slate-50 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-14">
            <div className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-3">Platform</div>
            <h2 className="text-3xl font-bold text-slate-900">Everything you need in one place.</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <Link
              href="/playground"
              className="group rounded-2xl border border-slate-200 bg-white p-8 hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-900/5 transition-all duration-200"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-center mb-6 group-hover:bg-emerald-100 transition">
                <Code2 className="h-6 w-6 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Playground</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                Write and tweak Python strategies in a live code editor. Run backtests on equities and ETFs with slippage,
                commissions, and full trade logs. See your equity curve, drawdowns, and key metrics all in one place.
              </p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 group-hover:gap-2.5 transition-all">
                Open Playground
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>

            <Link
              href="/competitions"
              className="group rounded-2xl border border-slate-200 bg-white p-8 hover:border-amber-300 hover:shadow-xl hover:shadow-amber-900/5 transition-all duration-200"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200/60 flex items-center justify-center mb-6 group-hover:bg-amber-100 transition">
                <Trophy className="h-6 w-6 text-amber-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Competitions</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                When you want to test yourself, enter a time-bound competition. Everyone gets the same data and rules, so it comes
                down to your approach. Rankings are based on Sharpe, return, drawdown, or custom metrics. Finished competitions get archived to the forum so everyone can learn from them.
              </p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 group-hover:gap-2.5 transition-all">
                View competitions
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>

            <Link
              href="/community"
              className="group rounded-2xl border border-slate-200 bg-white p-8 hover:border-slate-300 hover:shadow-xl transition-all duration-200"
            >
              <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-6 group-hover:bg-slate-200 transition">
                <MessageSquare className="h-6 w-6 text-slate-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Community</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                A place to talk through strategy ideas, ask questions, and learn from other traders.
                Search threads, mention other users, and get notified when someone replies. Vote on strategies and fork the ones that catch your eye.
              </p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 group-hover:gap-2.5 transition-all">
                Browse Community
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* Competitions detail */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row lg:items-center gap-14">
            <div className="max-w-xl">
              <div className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-3">Competitions</div>
              <h2 className="text-3xl font-bold text-slate-900 mb-5">Fair rules, real results.</h2>
              <p className="text-slate-500 leading-relaxed mb-8">
                Every entry runs on the same data, rules, and starting capital, so nobody gets an unfair advantage from their setup. When a competition wraps up,
                the top 25 strategies get posted to the archive. It's a great way to see what other people are trying and learn from what actually worked.
              </p>
              <Link
                href="/competitions"
                className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-500 font-medium transition"
              >
                Browse Competitions
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="flex-1 max-w-md lg:ml-8">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Leaderboard</div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live
                  </span>
                </div>
                <div className="space-y-2">
                  {[
                    { rank: 1, name: 'momentum_v2', user: 'alice', sharpe: '1.82', ret: '+34.1%' },
                    { rank: 2, name: 'mean_reversion', user: 'bob', sharpe: '1.67', ret: '+28.6%' },
                    { rank: 3, name: 'sma_crossover', user: 'charlie', sharpe: '1.54', ret: '+22.3%' },
                  ].map((r) => (
                    <div
                      key={r.rank}
                      className={`flex items-center justify-between p-3 rounded-xl ${r.rank === 1 ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-100'}`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            r.rank === 1 ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-500'
                          }`}
                        >
                          {r.rank}
                        </span>
                        <div>
                          <span className="text-gray-900 text-sm font-medium">{r.name}</span>
                          <span className="text-gray-400 text-xs block">{r.user}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-mono font-semibold text-emerald-600">{r.sharpe}</div>
                        <div className="text-xs text-gray-500">Sharpe</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Community — differentiating features */}
      <section className="py-24 bg-slate-50 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-14">
            <div className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-3">Community</div>
            <h2 className="text-3xl font-bold text-slate-900">Learn from real strategies.</h2>
            <p className="mt-3 text-slate-500 max-w-2xl">
              More than just a forum. It&apos;s a growing library of backtested strategies with real performance data you can learn from.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-8 hover:shadow-lg transition-shadow duration-200">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-center mb-6">
                <GitFork className="h-5 w-5 text-emerald-600" />
              </div>
              <h3 className="font-bold text-slate-900 mb-2 text-lg">Fork strategies</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                Find a public strategy that looks interesting, fork it straight into your Playground, and use it as a starting point for your own ideas.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-8 hover:shadow-lg transition-shadow duration-200">
              <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200/60 flex items-center justify-center mb-6">
                <Archive className="h-5 w-5 text-amber-600" />
              </div>
              <h3 className="font-bold text-slate-900 mb-2 text-lg">Competition archives</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                When a competition finishes, the top 25 results get posted automatically. Dig into what the winners optimised for and why their approaches worked.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-8 hover:shadow-lg transition-shadow duration-200">
              <div className="w-12 h-12 rounded-xl bg-sky-50 border border-sky-200/60 flex items-center justify-center mb-6">
                <BookOpen className="h-5 w-5 text-sky-600" />
              </div>
              <h3 className="font-bold text-slate-900 mb-2 text-lg">Docs & guides</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                Not sure where to start? The docs cover everything from beginner tutorials to the full API reference, with strategy examples you can run right away.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="max-w-xl mx-auto">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Start building your first strategy.</h2>
            <p className="text-slate-500 mb-10 leading-relaxed">
              It's free, and your strategies stay private until you decide to share them. No pressure, no time limits.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold rounded-lg shadow-lg shadow-emerald-500/20 transition"
              >
                Create free account
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/playground"
                className="inline-flex items-center gap-2 px-7 py-3.5 border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 font-medium rounded-lg transition"
              >
                Try Playground
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-slate-500 text-sm">Ceap Council - build, backtest, learn.</p>
          <div className="flex items-center gap-6 text-sm text-slate-400">
            <Link href="/docs" className="hover:text-slate-600 transition">Docs</Link>
            <Link href="/blog" className="hover:text-slate-600 transition">Blog</Link>
            <Link href="/community" className="hover:text-slate-600 transition">Community</Link>
            <Link href="/privacy" className="hover:text-slate-600 transition">Privacy</Link>
            <Link href="/terms" className="hover:text-slate-600 transition">Terms</Link>
            <Link href="/register" className="hover:text-slate-600 transition">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
