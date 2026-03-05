'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Trophy,
  TrendingUp,
  BarChart3,
  ChevronRight,
  Loader2,
  Award,
  Calendar,
  DollarSign,
  Target,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import type {
  CompetitionSummary,
  CompetitionDetail,
  LeaderboardResponse,
  Strategy,
} from '@/types';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  active: 'Active',
  judging: 'Judging',
  completed: 'Completed',
};

const METRIC_LABELS: Record<string, string> = {
  sharpe_ratio: 'Sharpe',
  total_return: 'Return',
  calmar_ratio: 'Calmar',
  sortino_ratio: 'Sortino',
  win_rate: 'Win Rate',
  max_drawdown: 'Max Drawdown',
};

export default function LeaderboardPage() {
  const { isAuthenticated } = useAuthStore();
  const [competitions, setCompetitions] = useState<CompetitionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CompetitionDetail | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [myStrategies, setMyStrategies] = useState<Strategy[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitStrategyId, setSubmitStrategyId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    api.listCompetitions()
      .then(setCompetitions)
      .catch(() => setCompetitions([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      api.getMyStrategies().then(setMyStrategies).catch(() => setMyStrategies([]));
    }
  }, [isAuthenticated]);

  const loadCompetition = async (id: number) => {
    setSelected(null);
    setLeaderboard(null);
    try {
      const [comp, lb] = await Promise.all([
        api.getCompetition(id),
        api.getLeaderboard(id),
      ]);
      setSelected(comp);
      setLeaderboard(lb);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load competition' });
    }
  };

  const handleEnter = async (competitionId: number, strategyId: number) => {
    setSubmitting(true);
    setSubmitStrategyId(strategyId);
    setMessage(null);
    try {
      const res = await api.enterCompetition(competitionId, strategyId);
      setMessage({ type: 'success', text: res.message || 'Entry submitted! Evaluation will run shortly.' });
      loadCompetition(competitionId);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setMessage({ type: 'error', text: typeof detail === 'string' ? detail : 'Failed to submit' });
    } finally {
      setSubmitting(false);
      setSubmitStrategyId(null);
    }
  };

  const formatPct = (v: number | null | undefined) =>
    v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '—';
  const formatNum = (v: number | null | undefined) =>
    v != null ? v.toFixed(2) : '—';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Trophy className="h-8 w-8 text-amber-500" />
            Leaderboard
          </h1>
          <p className="mt-2 text-gray-600">
            Compete in strategy competitions. Submit your custom strategies and climb the ranks.
          </p>
        </div>

        {message && (
          <div
            className={`mb-6 px-4 py-3 rounded-lg ${
              message.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Competition list */}
          <div className="lg:col-span-1">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Competitions
            </h2>
            {loading ? (
              <div className="flex items-center gap-2 text-gray-500 py-8">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading...
              </div>
            ) : competitions.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-500">
                No competitions yet. Create one to get started.
              </div>
            ) : (
              <div className="space-y-2">
                {competitions.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => loadCompetition(c.id)}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition flex items-center justify-between ${
                      selected?.id === c.id
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div>
                      <p className="font-medium text-gray-900 truncate">{c.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {c.symbol} · {c.entry_count} entries
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        c.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : c.status === 'completed'
                          ? 'bg-gray-100 text-gray-600'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {STATUS_LABELS[c.status] || c.status}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Detail + Leaderboard */}
          <div className="lg:col-span-2">
            {!selected ? (
              <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-500">
                <Trophy className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                Select a competition to view the leaderboard
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-lg border border-gray-200 bg-white p-6">
                  <h2 className="text-xl font-bold text-gray-900">{selected.title}</h2>
                  {selected.description && (
                    <p className="mt-2 text-gray-600 text-sm">{selected.description}</p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Target className="h-4 w-4" />
                      {selected.symbol}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {selected.backtest_start?.slice(0, 10)} → {selected.backtest_end?.slice(0, 10)}
                    </span>
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-4 w-4" />
                      ${selected.initial_capital?.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <BarChart3 className="h-4 w-4" />
                      {selected.ranking_metrics && selected.ranking_metrics.length > 1
                        ? `Ranked by avg of: ${selected.ranking_metrics?.map((m) => METRIC_LABELS[m] || m).join(', ') ?? ''}`
                        : `Ranked by ${METRIC_LABELS[selected.ranking_metric] || selected.ranking_metric}`}
                    </span>
                  </div>

                  {isAuthenticated && selected.status === 'active' && myStrategies.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-gray-200">
                      <p className="text-sm font-medium text-gray-700 mb-2">Submit a strategy</p>
                      <div className="flex flex-wrap gap-2">
                        {myStrategies.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => handleEnter(selected.id, s.id)}
                            disabled={submitting}
                            className="px-4 py-2 rounded-lg border border-emerald-600 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 flex items-center gap-2"
                          >
                            {submitting && submitStrategyId === s.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : null}
                            {s.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                  <h3 className="px-6 py-3 border-b border-gray-200 font-semibold text-gray-900 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Leaderboard
                  </h3>
                  {!leaderboard || leaderboard.leaderboard.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">No entries yet</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Strategy</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Score</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Return</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sharpe</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">DD%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {leaderboard.leaderboard.map((e, i) => (
                            <tr
                              key={i}
                              className={`border-b border-gray-100 ${
                                e.rank === 1 ? 'bg-amber-50' : ''
                              }`}
                            >
                              <td className="px-4 py-3">
                                {e.rank === 1 ? (
                                  <Award className="h-5 w-5 text-amber-500" />
                                ) : (
                                  <span className="text-gray-600 font-medium">{e.rank}</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-gray-900 font-medium">{e.username}</td>
                              <td className="px-4 py-3 text-gray-700">{e.strategy_title}</td>
                              <td className="px-4 py-3 text-right font-mono text-sm">
                                {e.score != null
                                  ? leaderboard.ranking_metrics && leaderboard.ranking_metrics.length > 1
                                    ? `Avg rank: ${(-e.score).toFixed(1)}`
                                    : formatNum(e.score)
                                  : '—'}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-sm">
                                {formatPct(e.total_return)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-sm">
                                {formatNum(e.sharpe_ratio)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-sm text-red-600">
                                {e.max_drawdown != null ? `${e.max_drawdown.toFixed(1)}%` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {!isAuthenticated && (
          <div className="mt-10 p-6 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
            <p className="text-gray-700">
              <Link href="/login" className="text-emerald-600 hover:underline font-medium">
                Sign in
              </Link>{' '}
              to submit strategies and compete.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
