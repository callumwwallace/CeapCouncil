import Link from 'next/link';
import { 
  BarChart3, 
  Users, 
  Zap, 
  TrendingUp, 
  Code2, 
  Share2, 
  MessageSquare, 
  ThumbsUp,
  GitFork,
  LineChart,
  Shield,
  ArrowRight,
  CheckCircle2,
  PlayCircle
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
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                </span>
                Now in Early Access
              </div>
              
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
                Backtest Strategies.<br />
                <span className="text-emerald-600">Grow Together.</span>
              </h1>
              
              <p className="text-xl text-gray-600 mb-8 leading-relaxed">
                Build, test, and share trading strategies—whether you&apos;re a beginner 
                learning the ropes or an experienced trader refining your edge.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition shadow-lg shadow-emerald-600/20"
                >
                  Start Free
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link
                  href="/demo"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-lg border border-gray-300 transition"
                >
                  <PlayCircle className="h-5 w-5" />
                  Watch Demo
                </Link>
              </div>

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
                    <div className="text-lg font-bold text-gray-900">—</div>
                    <div className="text-xs text-gray-500">Sharpe</div>
                  </div>
                  <div className="px-4 py-3 text-center">
                    <div className="text-lg font-bold text-gray-900">—</div>
                    <div className="text-xs text-gray-500">Max DD</div>
                  </div>
                  <div className="px-4 py-3 text-center">
                    <div className="text-lg font-bold text-gray-900">—</div>
                    <div className="text-xs text-gray-500">Win Rate</div>
                  </div>
                  <div className="px-4 py-3 text-center">
                    <div className="text-lg font-bold text-gray-900">—</div>
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

      {/* Value Props Bar */}
      <div className="border-y border-gray-200 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            <div className="flex items-center gap-2 text-gray-600">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <span className="font-medium">100% Free to Start</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <span className="font-medium">Real Market Data</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <span className="font-medium">Python-Based Strategies</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <span className="font-medium">Open Source Friendly</span>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">How It Works</h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            From idea to validated strategy in three simple steps
          </p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8">
          {/* Step 1 */}
          <div className="relative">
            <div className="absolute -left-4 top-0 w-8 h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</div>
            <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm hover:shadow-md transition h-full ml-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mb-6">
                <Code2 className="h-6 w-6 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Write Your Strategy</h3>
              <p className="text-gray-600 leading-relaxed">
                Use Python to define your trading logic. Set entry signals, exit rules, position sizing, and risk management parameters.
              </p>
            </div>
          </div>
          
          {/* Step 2 */}
          <div className="relative">
            <div className="absolute -left-4 top-0 w-8 h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-sm">2</div>
            <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm hover:shadow-md transition h-full ml-4">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-6">
                <LineChart className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Backtest & Analyze</h3>
              <p className="text-gray-600 leading-relaxed">
                Run your strategy against years of market data. Get detailed analytics: returns, Sharpe ratio, drawdowns, and trade-by-trade breakdown.
              </p>
            </div>
          </div>
          
          {/* Step 3 */}
          <div className="relative">
            <div className="absolute -left-4 top-0 w-8 h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-sm">3</div>
            <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm hover:shadow-md transition h-full ml-4">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-6">
                <Share2 className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Share & Collaborate</h3>
              <p className="text-gray-600 leading-relaxed">
                Publish to the community, get feedback, fork successful strategies, and build your reputation as a quant.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Community Section */}
      <div className="bg-gray-50 border-y border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
                Built for Traders
                <span className="block text-emerald-600">At Every Level</span>
              </h2>
              <p className="text-xl text-gray-600 mb-8 leading-relaxed">
                Whether you&apos;re just learning or already profitable, QuantGuild helps you 
                test ideas, learn from others, and improve your trading systematically.
              </p>
              
              <div className="space-y-5">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <ThumbsUp className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <h4 className="text-gray-900 font-semibold mb-1">Vote on Strategies</h4>
                    <p className="text-gray-600">Surface the best ideas. Upvote strategies that deliver real alpha.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="text-gray-900 font-semibold mb-1">Discuss & Debate</h4>
                    <p className="text-gray-600">Get feedback from experienced traders. Refine your approach.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <GitFork className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <h4 className="text-gray-900 font-semibold mb-1">Fork & Improve</h4>
                    <p className="text-gray-600">Build on public strategies. Credit the original, make it better.</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* What You Get Cards */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center mb-3">
                  <Zap className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="font-semibold text-gray-900 mb-1">Fast Backtests</div>
                <div className="text-sm text-gray-600">Cloud-powered execution in seconds</div>
              </div>
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-3">
                  <BarChart3 className="h-5 w-5 text-blue-600" />
                </div>
                <div className="font-semibold text-gray-900 mb-1">Detailed Analytics</div>
                <div className="text-sm text-gray-600">Sharpe, drawdown, trade analysis</div>
              </div>
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-3">
                  <Users className="h-5 w-5 text-purple-600" />
                </div>
                <div className="font-semibold text-gray-900 mb-1">Community</div>
                <div className="text-sm text-gray-600">Share, discuss, and learn together</div>
              </div>
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center mb-3">
                  <Shield className="h-5 w-5 text-amber-600" />
                </div>
                <div className="font-semibold text-gray-900 mb-1">Your IP Protected</div>
                <div className="text-sm text-gray-600">Private by default, share when ready</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Everything You Need</h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Powerful tools made accessible for traders of all experience levels
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl p-6 border border-gray-200 hover:border-emerald-200 hover:shadow-md transition group">
            <div className="w-12 h-12 bg-emerald-100 group-hover:bg-emerald-200 rounded-xl flex items-center justify-center mb-4 transition">
              <BarChart3 className="h-6 w-6 text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Advanced Backtesting</h3>
            <p className="text-gray-600">
              Realistic simulation with slippage, commissions, and position limits.
            </p>
          </div>
          
          <div className="bg-white rounded-xl p-6 border border-gray-200 hover:border-emerald-200 hover:shadow-md transition group">
            <div className="w-12 h-12 bg-blue-100 group-hover:bg-blue-200 rounded-xl flex items-center justify-center mb-4 transition">
              <TrendingUp className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Real Market Data</h3>
            <p className="text-gray-600">
              Years of historical data for stocks, ETFs, crypto, and forex.
            </p>
          </div>
          
          <div className="bg-white rounded-xl p-6 border border-gray-200 hover:border-emerald-200 hover:shadow-md transition group">
            <div className="w-12 h-12 bg-yellow-100 group-hover:bg-yellow-200 rounded-xl flex items-center justify-center mb-4 transition">
              <Zap className="h-6 w-6 text-yellow-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Cloud Execution</h3>
            <p className="text-gray-600">
              Run backtests in seconds, not hours. Scale without limits.
            </p>
          </div>
          
          <div className="bg-white rounded-xl p-6 border border-gray-200 hover:border-emerald-200 hover:shadow-md transition group">
            <div className="w-12 h-12 bg-purple-100 group-hover:bg-purple-200 rounded-xl flex items-center justify-center mb-4 transition">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Supportive Community</h3>
            <p className="text-gray-600">
              Learn from others, share your journey, get feedback.
            </p>
          </div>
          
          <div className="bg-white rounded-xl p-6 border border-gray-200 hover:border-emerald-200 hover:shadow-md transition group">
            <div className="w-12 h-12 bg-red-100 group-hover:bg-red-200 rounded-xl flex items-center justify-center mb-4 transition">
              <Shield className="h-6 w-6 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Private by Default</h3>
            <p className="text-gray-600">
              Your strategies stay private until you choose to share.
            </p>
          </div>
          
          <div className="bg-white rounded-xl p-6 border border-gray-200 hover:border-emerald-200 hover:shadow-md transition group">
            <div className="w-12 h-12 bg-cyan-100 group-hover:bg-cyan-200 rounded-xl flex items-center justify-center mb-4 transition">
              <Code2 className="h-6 w-6 text-cyan-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Python-Powered</h3>
            <p className="text-gray-600">
              Use familiar tools: pandas, numpy, and our strategy API.
            </p>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Ready to Build Your Edge?
            </h2>
            <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
              Start backtesting your ideas and join a growing community of traders learning and building together.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition"
            >
              Get Started Free
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-50 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <p className="text-center text-gray-500 italic">
            "Test your ideas. Share your edge. Grow together."
          </p>
        </div>
      </footer>
    </div>
  );
}
