import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Code2,
  Trophy,
  MessageSquare,
  FileCode,
  BookOpen,
  ArrowRight,
  Search,
  AtSign,
  GitFork,
  Shield,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Ceap Council — Backtest Trading Strategies & Compete',
  description:
    'Free platform for algorithmic traders. Write Python trading strategies, backtest on real historical market data, compete in ranked competitions, and discuss with the community.',
  alternates: { canonical: 'https://ceapcouncil.com' },
  openGraph: {
    title: 'Ceap Council — Backtest Trading Strategies & Compete',
    description: 'Write Python strategies, run backtests on real market data, and compete in ranked trading competitions.',
    url: 'https://ceapcouncil.com',
  },
};

export default function Home() {
  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
          <div className="max-w-3xl">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 leading-tight tracking-tight">
              Build strategies. Backtest. Compete.
            </h1>
            <p className="mt-6 text-xl text-slate-600 leading-relaxed">
              Write Python strategies in the Playground, run them on real market data, and compete in Competitions. 
              Discuss ideas in the Community. Ceap Council is built for systematic traders who want to validate, benchmark, and improve.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-medium rounded-lg shadow-lg shadow-emerald-900/20 transition"
              >
                Get started
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/playground"
                className="inline-flex items-center gap-2 px-6 py-3 border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium rounded-lg transition"
              >
                Try Playground
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Three pillars */}
      <section className="py-20 border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="sr-only">Features</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Link
              href="/playground"
              className="group rounded-2xl border border-slate-200 bg-white p-8 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-900/5 transition"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center mb-5 group-hover:bg-emerald-500/20 transition">
                <Code2 className="h-6 w-6 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Playground</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Write and edit Python strategies in a live code editor. Run backtests on equities and ETFs with slippage, 
                commissions, and full trade logs. View equity curves, drawdowns, and metrics.
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 group-hover:gap-2 transition-all">
                Open Playground
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>

            <Link
              href="/competitions"
              className="group rounded-2xl border border-slate-200 bg-white p-8 hover:border-amber-200 hover:shadow-lg hover:shadow-amber-900/5 transition"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mb-5 group-hover:bg-amber-500/20 transition">
                <Trophy className="h-6 w-6 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Competitions</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Enter strategies into time-bound competitions. Same data and rules for everyone. Rankings by Sharpe, 
                return, drawdown, or custom metrics. Earn badges. Completed competitions auto-archive to the forum.
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-amber-700 group-hover:gap-2 transition-all">
                View competitions
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>

            <Link
              href="/community"
              className="group rounded-2xl border border-slate-200 bg-white p-8 hover:border-slate-300 hover:shadow-lg transition"
            >
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-5 group-hover:bg-slate-200 transition">
                <MessageSquare className="h-6 w-6 text-slate-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Community</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Forum with topics for current competitions, past archives, strategy help, and education. 
                Search threads, @mention others, get notifications. Discuss, vote on strategies, and fork public ones.
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-slate-700 group-hover:gap-2 transition-all">
                Browse Community
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* Competitions detail */}
      <section className="py-20 bg-slate-50 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-12">
            <div className="max-w-xl">
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">Competitions</h2>
              <p className="text-slate-600 leading-relaxed mb-6">
                Compete on equal footing. Every entry runs on the same symbol, date range, and capital. 
                Rankings are transparent. When a competition ends, the site automatically posts the top 25 
                results to Past Competition Archives so the community can learn from them.
              </p>
              <Link
                href="/competitions"
                className="inline-flex items-center gap-2 text-emerald-700 hover:text-emerald-800 font-medium"
              >
                Browse Competitions
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="flex-1 max-w-md lg:ml-12">
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-4">Example leaderboard</div>
                <div className="space-y-3">
                  {[
                    { rank: 1, name: 'momentum_v2', user: 'alice', sharpe: '1.82' },
                    { rank: 2, name: 'mean_reversion', user: 'bob', sharpe: '1.67' },
                    { rank: 3, name: 'sma_crossover', user: 'charlie', sharpe: '1.54' },
                  ].map((r) => (
                    <div
                      key={r.rank}
                      className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                            r.rank === 1 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {r.rank}
                        </span>
                        <div>
                          <span className="text-slate-900 text-sm font-medium">{r.name}</span>
                          <span className="text-slate-500 text-xs block">{r.user}</span>
                        </div>
                      </div>
                      <span className="text-sm font-mono font-medium text-emerald-700">{r.sharpe}</span>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-slate-500 mt-2">Ranked by Sharpe ratio</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold text-slate-900 mb-3">How it works</h2>
          <p className="text-slate-600 mb-12 max-w-2xl">
            Start in the Playground, validate your strategy, then compete or discuss in the Community.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="flex gap-5">
              <span className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-semibold">
                1
              </span>
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Write your strategy</h3>
                <p className="text-sm text-slate-600">
                  Python in the Playground. Use our StrategyBase API, built-in indicators, and parameters. Save versions.
                </p>
              </div>
            </div>
            <div className="flex gap-5">
              <span className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-semibold">
                2
              </span>
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Run a backtest</h3>
                <p className="text-sm text-slate-600">
                  Choose symbol, date range, and capital. Get equity curve, trade log, Sharpe, return, drawdown, win rate.
                </p>
              </div>
            </div>
            <div className="flex gap-5">
              <span className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-semibold">
                3
              </span>
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Compete & discuss</h3>
                <p className="text-sm text-slate-600">
                  Submit to active competitions, earn badges, or discuss in the forum. Vote, fork, and build on others&apos; work.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Community features */}
      <section className="py-20 bg-slate-50 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold text-slate-900 mb-3">Community</h2>
          <p className="text-slate-600 mb-10 max-w-2xl">
            The forum brings everything together: Current Competitions, Past Archives, Strategy Showcase, dev help, and more.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center mb-4">
                <Search className="h-5 w-5 text-slate-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-1">Search</h3>
              <p className="text-sm text-slate-600">Search threads by keywords, author, section, and date range.</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center mb-4">
                <AtSign className="h-5 w-5 text-slate-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-1">@mentions</h3>
              <p className="text-sm text-slate-600">Tag users in posts. Get notified when someone mentions you.</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center mb-4">
                <GitFork className="h-5 w-5 text-slate-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-1">Fork strategies</h3>
              <p className="text-sm text-slate-600">Fork public strategies into your Playground and iterate.</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center mb-4">
                <Shield className="h-5 w-5 text-slate-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-1">Private by default</h3>
              <p className="text-sm text-slate-600">Strategies stay private until you share or enter a competition.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-semibold text-slate-900 mb-3">Ready to start?</h2>
          <p className="text-slate-600 mb-8 max-w-xl mx-auto">
            Create an account to use the Playground, enter competitions, and join the Community.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-medium rounded-lg shadow-lg shadow-emerald-900/20 transition"
            >
              Create account
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 px-6 py-3 border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium rounded-lg transition"
            >
              <FileCode className="h-4 w-4" />
              Docs
            </Link>
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 px-6 py-3 border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium rounded-lg transition"
            >
              <BookOpen className="h-4 w-4" />
              Blog
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-center text-slate-500 text-sm">
            Ceap Council — backtest, compete, learn.
          </p>
        </div>
      </footer>
    </div>
  );
}
