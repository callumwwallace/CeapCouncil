'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Trophy,
  ChevronLeft,
  Loader2,
  AlertCircle,
  Info,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';

const RANKING_METRICS = [
  { value: 'sharpe_ratio', label: 'Sharpe Ratio', desc: 'Risk-adjusted return (higher is better)' },
  { value: 'total_return', label: 'Total Return', desc: 'Raw percentage gain/loss' },
  { value: 'sortino_ratio', label: 'Sortino Ratio', desc: 'Downside risk-adjusted return' },
  { value: 'calmar_ratio', label: 'Calmar Ratio', desc: 'Return relative to max drawdown' },
  { value: 'win_rate', label: 'Win Rate', desc: 'Percentage of winning trades' },
  { value: 'max_drawdown', label: 'Min Drawdown', desc: 'Least peak-to-trough decline wins' },
];

const POPULAR_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'SPY', 'QQQ', 'BTC-USD', 'ETH-USD'];

export default function CreateCompetitionPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [symbol, setSymbol] = useState('SPY');
  const [backtestStart, setBacktestStart] = useState('2023-01-01');
  const [backtestEnd, setBacktestEnd] = useState('2024-01-01');
  const [submissionStart, setSubmissionStart] = useState(new Date().toISOString().slice(0, 10));
  const [submissionEnd, setSubmissionEnd] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  );
  const [initialCapital, setInitialCapital] = useState(10000);
  const [maxEntries, setMaxEntries] = useState<number | ''>('');
  const [rankingMode, setRankingMode] = useState<'single' | 'multi'>('single');
  const [singleMetric, setSingleMetric] = useState('sharpe_ratio');
  const [multiMetrics, setMultiMetrics] = useState<string[]>(['sharpe_ratio', 'total_return']);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleMultiMetric = (m: string) => {
    setMultiMetrics((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    if (!symbol.trim()) { setError('Symbol is required'); return; }
    if (rankingMode === 'multi' && multiMetrics.length < 2) { setError('Select at least 2 metrics for multi-metric ranking'); return; }

    setSubmitting(true);
    setError(null);
    try {
      const res = await api.createCompetition({
        title: title.trim(),
        description: description.trim() || undefined,
        symbol: symbol.trim().toUpperCase(),
        backtest_start: backtestStart,
        backtest_end: backtestEnd,
        start_date: submissionStart,
        end_date: submissionEnd,
        initial_capital: initialCapital,
        ranking_metric: rankingMode === 'single' ? singleMetric : 'sharpe_ratio',
        ranking_metrics: rankingMode === 'multi' ? multiMetrics : undefined,
        max_entries: maxEntries !== '' ? maxEntries : undefined,
      });
      router.push(`/competitions/${res.id}`);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Failed to create competition');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Trophy className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500 mb-4">You need to be signed in to create a competition.</p>
          <Link href="/login" className="text-emerald-600 hover:underline font-medium">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (!user?.is_superuser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <Trophy className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-900 font-semibold text-lg mb-2">Admin Only</p>
          <p className="text-gray-500 mb-4">
            Direct competition creation is restricted to admins. Want to suggest a competition?
            Propose competitions in Community → Competition Proposals. Top 5 each week become hosted competitions!
          </p>
          <div className="space-y-2">
            <Link href="/community/competition-ideas" className="block text-emerald-600 hover:underline font-medium">
              Propose a competition in Community →
            </Link>
            <Link href="/competitions" className="block text-gray-500 hover:underline text-sm">
              ← Back to Competitions
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <Link
          href="/competitions"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6 transition"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Competitions
        </Link>

        <div className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2 mb-6">
            <Trophy className="h-6 w-6 text-amber-500" />
            Create Competition
          </h1>

          {error && (
            <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Q1 2024 Momentum Challenge"
                maxLength={200}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Describe the competition goals, constraints, etc."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm resize-none"
              />
            </div>

            {/* Symbol */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Symbol *</label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="AAPL"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {POPULAR_SYMBOLS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSymbol(s)}
                    className={`px-2 py-0.5 text-xs rounded border transition ${
                      symbol === s ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Backtest period */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Backtest Start *</label>
                <input
                  type="date"
                  value={backtestStart}
                  onChange={(e) => setBacktestStart(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Backtest End *</label>
                <input
                  type="date"
                  value={backtestEnd}
                  onChange={(e) => setBacktestEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                />
              </div>
            </div>

            {/* Submission window */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Submissions Open *</label>
                <input
                  type="date"
                  value={submissionStart}
                  onChange={(e) => setSubmissionStart(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Submissions Close *</label>
                <input
                  type="date"
                  value={submissionEnd}
                  onChange={(e) => setSubmissionEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                />
              </div>
            </div>

            <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Backtest period is the historical data all strategies run against. Submission window is when users can enter. The competition auto-completes when submissions close.
              </span>
            </div>

            {/* Capital */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Initial Capital ($)</label>
                <input
                  type="number"
                  value={initialCapital}
                  onChange={(e) => setInitialCapital(Number(e.target.value))}
                  min={1000}
                  step={1000}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Entries</label>
                <input
                  type="number"
                  value={maxEntries}
                  onChange={(e) => setMaxEntries(e.target.value ? Number(e.target.value) : '')}
                  min={2}
                  placeholder="Unlimited"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                />
              </div>
            </div>

            {/* Ranking */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Ranking Method</label>
              <div className="flex gap-3 mb-3">
                <button
                  type="button"
                  onClick={() => setRankingMode('single')}
                  className={`flex-1 px-4 py-2 rounded-lg border text-sm font-medium transition ${
                    rankingMode === 'single'
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  Single Metric
                </button>
                <button
                  type="button"
                  onClick={() => setRankingMode('multi')}
                  className={`flex-1 px-4 py-2 rounded-lg border text-sm font-medium transition ${
                    rankingMode === 'multi'
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  Multi-Metric (Avg Rank)
                </button>
              </div>

              {rankingMode === 'single' ? (
                <div className="grid grid-cols-2 gap-2">
                  {RANKING_METRICS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setSingleMetric(m.value)}
                      className={`text-left px-3 py-2 rounded-lg border text-sm transition ${
                        singleMetric === m.value
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <span className="font-medium">{m.label}</span>
                      <span className="block text-[10px] text-gray-400 mt-0.5">{m.desc}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {RANKING_METRICS.map((m) => {
                    const selected = multiMetrics.includes(m.value);
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => toggleMultiMetric(m.value)}
                        className={`text-left px-3 py-2 rounded-lg border text-sm transition ${
                          selected
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <span className="font-medium">{m.label}</span>
                        {selected && <span className="ml-1 text-emerald-500">✓</span>}
                        <span className="block text-[10px] text-gray-400 mt-0.5">{m.desc}</span>
                      </button>
                    );
                  })}
                  <p className="col-span-2 text-[10px] text-gray-400 mt-1">
                    Score = average of each participant&apos;s rank across selected metrics. Select 2 or more.
                  </p>
                </div>
              )}
            </div>

            {/* Submit */}
            <div className="pt-4 border-t border-gray-200 flex items-center justify-between">
              <Link href="/competitions" className="text-sm text-gray-500 hover:text-gray-700">
                Cancel
              </Link>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition shadow-sm disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Competition
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
