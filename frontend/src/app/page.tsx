import Link from 'next/link';
import { 
  BarChart3, 
  Users, 
  TrendingUp, 
  MessageSquare, 
  ThumbsUp,
  GitFork,
  LineChart,
  Shield,
  ArrowRight
} from 'lucide-react';

export default function Home() {
  return (
    <div className="bg-white">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] bg-[size:4rem_4rem]" />
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-emerald-50 to-transparent" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
                Backtest Strategies.<br />
                <span className="text-emerald-600">Grow Together.</span>
              </h1>
              
              <p className="text-xl text-gray-600 leading-relaxed">
                Build, test, and share trading strategies. Whether you&apos;re a beginner 
                learning the ropes or an experienced trader refining your edge.
              </p>

            </div>

            {/* Hero Visual - Example Strategy Card */}
            <div className="relative lg:pl-8">
              <div className="absolute -inset-4 bg-gradient-to-r from-emerald-100 to-teal-100 rounded-3xl blur-2xl opacity-60" />
              <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
                {/* Card Header */}
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                        <TrendingUp className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">Your Strategy</div>
                        <div className="text-sm text-gray-500">Example Preview</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-emerald-600">+XX.X%</div>
                      <div className="text-xs text-gray-500">Total Return</div>
                    </div>
                  </div>
                </div>

                {/* Fake Chart Area */}
                <div className="px-6 py-4">
                  <div className="h-32 flex items-end gap-1">
                    {[40, 45, 35, 50, 48, 55, 52, 60, 58, 65, 70, 68, 75, 72, 80, 85, 82, 90, 88, 95].map((h, i) => (
                      <div 
                        key={i} 
                        className="flex-1 bg-gradient-to-t from-emerald-500 to-emerald-400 rounded-t"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-2">
                    <span>Jan 2024</span>
                    <span>Dec 2024</span>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 divide-x divide-gray-200 border-t border-gray-200">
                  <div className="px-4 py-3 text-center">
                    <div className="text-lg font-bold text-gray-900">-</div>
                    <div className="text-xs text-gray-500">Sharpe</div>
                  </div>
                  <div className="px-4 py-3 text-center">
                    <div className="text-lg font-bold text-gray-900">-</div>
                    <div className="text-xs text-gray-500">Max DD</div>
                  </div>
                  <div className="px-4 py-3 text-center">
                    <div className="text-lg font-bold text-gray-900">-</div>
                    <div className="text-xs text-gray-500">Win Rate</div>
                  </div>
                  <div className="px-4 py-3 text-center">
                    <div className="text-lg font-bold text-gray-900">-</div>
                    <div className="text-xs text-gray-500">Trades</div>
                  </div>
                </div>

                {/* Strategy Actions */}
                <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 text-gray-600">
                      <ThumbsUp className="h-4 w-4" />
                      <span className="text-sm font-medium">Vote</span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-600">
                      <MessageSquare className="h-4 w-4" />
                      <span className="text-sm font-medium">Discuss</span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-600">
                      <GitFork className="h-4 w-4" />
                      <span className="text-sm font-medium">Fork</span>
                    </div>
                  </div>
                  <button className="text-sm font-medium text-emerald-600 hover:text-emerald-700">
                    View Details →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Platform Overview */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 mb-4">
            Systematic backtesting. Ranked competitions. A community that learns.
          </h2>
          <p className="text-gray-600 leading-relaxed">
            QuantGuild is where quantitative traders validate ideas, benchmark against peers, 
            and level up through feedback and competition.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="border border-gray-200 rounded-lg p-8 bg-white hover:border-gray-300 transition">
            <div className="w-11 h-11 rounded-lg bg-gray-100 flex items-center justify-center mb-5">
              <LineChart className="h-5 w-5 text-gray-700" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Backtesting</h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              Run strategies on historical market data. Slippage, commissions, margin, and execution realism built in.
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-8 bg-white hover:border-gray-300 transition">
            <div className="w-11 h-11 rounded-lg bg-gray-100 flex items-center justify-center mb-5">
              <BarChart3 className="h-5 w-5 text-gray-700" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Competitions</h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              Enter strategies into time-bound contests. Leaderboards rank by Sharpe, return, or custom metrics.
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-8 bg-white hover:border-gray-300 transition">
            <div className="w-11 h-11 rounded-lg bg-gray-100 flex items-center justify-center mb-5">
              <Users className="h-5 w-5 text-gray-700" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Community & Learning</h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              Share strategies, fork others&apos; work, discuss ideas. Learn from feedback and build reputation over time.
            </p>
          </div>
        </div>
      </div>

      {/* Competitions */}
      <div className="bg-gray-50 border-y border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-12">
            <div className="max-w-xl">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Competitions</h2>
              <p className="text-gray-600 leading-relaxed mb-6">
                Compete on equal footing. Submit a strategy, run it on the same data and timeframe as everyone else. 
                Rankings are transparent (Sharpe, return, drawdown) so you know exactly where you stand.
              </p>
              <Link
                href="/competitions"
                className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-medium text-sm"
              >
                View competitions
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="flex-1 max-w-md lg:ml-12">
              <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">Example leaderboard</div>
                <div className="space-y-3">
                  {[
                    { rank: 1, name: 'Strategy Alpha', metric: '1.82' },
                    { rank: 2, name: 'Momentum v2', metric: '1.67' },
                    { rank: 3, name: 'Mean Reversion', metric: '1.54' },
                  ].map((r) => (
                    <div key={r.rank} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600">{r.rank}</span>
                        <span className="text-gray-900 text-sm">{r.name}</span>
                      </div>
                      <span className="text-sm font-medium text-emerald-600">{r.metric}</span>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-gray-400 mt-2">Ranked by Sharpe ratio</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Learning & Workflow */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h2 className="text-2xl font-semibold text-gray-900 mb-3">How it works</h2>
        <p className="text-gray-600 mb-12 max-w-2xl">
          Write Python strategies in the Playground, backtest on real data, then share or enter competitions.
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="flex gap-4">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-medium">1</span>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Write strategy</h3>
              <p className="text-sm text-gray-600">Define logic with Python: signals, sizing, risk. Use our API and built-in indicators.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-medium">2</span>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Backtest</h3>
              <p className="text-sm text-gray-600">Run on equities, ETFs, or crypto. Get full metrics and trade-level detail.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-medium">3</span>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Compete or share</h3>
              <p className="text-sm text-gray-600">Enter competitions, publish to the community, fork and iterate.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Community */}
      <div className="bg-gray-50 border-y border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div>
              <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center mb-4">
                <ThumbsUp className="h-5 w-5 text-gray-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Vote</h3>
              <p className="text-sm text-gray-600">Upvote strategies that perform. Surface what works.</p>
            </div>
            <div>
              <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center mb-4">
                <MessageSquare className="h-5 w-5 text-gray-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Discuss</h3>
              <p className="text-sm text-gray-600">Comment on strategies. Get and give feedback.</p>
            </div>
            <div>
              <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center mb-4">
                <GitFork className="h-5 w-5 text-gray-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Fork</h3>
              <p className="text-sm text-gray-600">Start from public strategies. Build on others&apos; work.</p>
            </div>
            <div>
              <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center mb-4">
                <Shield className="h-5 w-5 text-gray-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Private by default</h3>
              <p className="text-sm text-gray-600">Strategies stay private until you choose to share.</p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-3">Start backtesting</h2>
          <p className="text-gray-600 mb-8 max-w-xl mx-auto">
            Create an account to use the Playground, enter competitions, and join the community.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition"
          >
            Create account
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-center text-gray-500 text-sm">
            QuantGuild: backtest, compete, learn.
          </p>
        </div>
      </footer>
    </div>
  );
}
