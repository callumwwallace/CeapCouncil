'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import SignInPrompt from '@/components/auth/SignInPrompt';
import { safeProfilePath } from '@/lib/safePaths';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Trophy,
  TrendingUp,
  BarChart3,
  Loader2,
  Calendar,
  DollarSign,
  Target,
  Users,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Timer,
  ArrowUpRight,
  AlertCircle,
  Crown,
  Medal,
  Swords,
  Shield,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import { MiniSparkline } from '@/components/leaderboard/CompetitionEquityChart';
import type {
  CompetitionDetail,
  LeaderboardResponse,
  LeaderboardEntry,
  EquityCurvesResponse,
  Strategy,
} from '@/types';

const METRIC_LABELS: Record<string, string> = {
  sharpe_ratio: 'Sharpe',
  total_return: 'Return',
  calmar_ratio: 'Calmar',
  sortino_ratio: 'Sortino',
  win_rate: 'Win Rate',
  max_drawdown: 'Max DD',
};

const RANK_COLORS = [
  'text-amber-600',
  'text-gray-500',
  'text-amber-700',
];

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Countdown hook ──────────────────────────────────────────────────
function useCountdown(endDate: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, new Date(endDate).getTime() - now);
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    mins: Math.floor((diff % 3600000) / 60000),
    secs: Math.floor((diff % 60000) / 1000),
    ended: diff <= 0,
  };
}

function CountdownBlock({ endDate }: { endDate: string }) {
  const { days, hours, mins, secs, ended } = useCountdown(endDate);
  if (ended) return <span className="text-gray-500 text-sm font-medium">Competition Ended</span>;
  const units = [
    { val: days, label: 'Days' },
    { val: hours, label: 'Hours' },
    { val: mins, label: 'Min' },
    { val: secs, label: 'Sec' },
  ];
  return (
    <div className="flex items-center gap-2">
      {units.map((u, i) => (
        <div key={u.label} className="flex items-center gap-2">
          <div className="text-center">
            <div className="bg-gray-900 text-white rounded-lg px-2.5 py-1.5 min-w-[44px]">
              <span className="text-lg font-mono font-bold tabular-nums">{String(u.val).padStart(2, '0')}</span>
            </div>
            <span className="text-[9px] text-gray-400 uppercase tracking-wider font-medium mt-1 block">{u.label}</span>
          </div>
          {i < units.length - 1 && <span className="text-gray-300 font-bold text-lg -mt-4">:</span>}
        </div>
      ))}
    </div>
  );
}

export default function CompetitionDetailPage() {
  const params = useParams();
  const competitionId = Number(params.id);
  const { user, isAuthenticated } = useAuthStore();

  const [competition, setCompetition] = useState<CompetitionDetail | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [equityCurves, setEquityCurves] = useState<EquityCurvesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [myStrategies, setMyStrategies] = useState<Strategy[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitStrategyId, setSubmitStrategyId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showSubmitForm, setShowSubmitForm] = useState(false);

  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // Map username → curve data for O(1) lookup in expanded rows
  const curvesByUsername = useMemo(() => {
    if (!equityCurves) return {} as Record<string, { date: string; equity: number }[]>;
    return Object.fromEntries(equityCurves.curves.map((c) => [c.username, c.equity_curve]));
  }, [equityCurves]);

  const myEntry = useMemo(() => {
    if (!user || !leaderboard) return null;
    return leaderboard.leaderboard.find((e) => e.user_id === user.id) || null;
  }, [user, leaderboard]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [comp, lb] = await Promise.all([
        api.getCompetition(competitionId),
        api.getLeaderboard(competitionId),
      ]);
      setCompetition(comp);
      setLeaderboard(lb);
      // Load equity curves independently — don't block on failure
      api.getCompetitionEquityCurves(competitionId)
        .then(setEquityCurves)
        .catch(() => null);
    } catch {
      setError('Competition not found');
    } finally {
      setLoading(false);
    }
  }, [competitionId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (isAuthenticated) {
      api.getMyStrategies().then(setMyStrategies).catch(() => setMyStrategies([]));
    }
  }, [isAuthenticated]);

  const handleEnter = async (strategyId: number) => {
    setSubmitting(true);
    setSubmitStrategyId(strategyId);
    setMessage(null);
    try {
      const res = await api.enterCompetition(competitionId, strategyId);
      setMessage({ type: 'success', text: res.message || 'Entry submitted! Evaluation will run shortly.' });
      setShowSubmitForm(false);
      setTimeout(() => loadData(), 3000);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setMessage({ type: 'error', text: typeof detail === 'string' ? detail : 'Failed to submit' });
    } finally {
      setSubmitting(false);
      setSubmitStrategyId(null);
    }
  };

  const fmtPct = (v: number | null | undefined) =>
    v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '—';
  const fmtNum = (v: number | null | undefined) =>
    v != null ? v.toFixed(2) : '—';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <p className="text-sm text-gray-400">Loading competition...</p>
      </div>
    );
  }

  if (error || !competition) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-gray-300" />
          </div>
          <p className="text-lg text-gray-500 font-medium">{error || 'Competition not found'}</p>
          <Link href="/competitions" className="mt-4 inline-flex items-center gap-1 text-emerald-600 hover:underline text-sm font-medium">
            <ChevronLeft className="h-4 w-4" /> Back to competitions
          </Link>
        </div>
      </div>
    );
  }

  const ended = new Date(competition.end_date).getTime() <= Date.now();
  const isActive = competition.status === 'active' && !ended;
  const isCompleted = competition.status === 'completed' || (competition.status === 'active' && ended);
  const rankingLabel = competition.ranking_metrics && competition.ranking_metrics.length > 1
    ? competition.ranking_metrics.map((m) => METRIC_LABELS[m] || m).join(' + ')
    : METRIC_LABELS[competition.ranking_metric] || competition.ranking_metric;
  const isMultiMetric = !!(competition.ranking_metrics && competition.ranking_metrics.length > 1);

  const topThree = leaderboard ? leaderboard.leaderboard.slice(0, 3) : [];
  const restOfLeaderboard = leaderboard ? leaderboard.leaderboard.slice(3) : [];

  const podiumGridClass =
    topThree.length === 1 ? 'grid-cols-1 max-w-xs' :
    topThree.length === 2 ? 'grid-cols-2 max-w-md' :
    'grid-cols-3';

  return (
    <div className="min-h-screen bg-gray-50/80">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* Breadcrumb */}
        <Link
          href="/competitions"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition font-medium"
        >
          <ChevronLeft className="h-4 w-4" />
          All Competitions
        </Link>

        {/* ═══ Hero Card ═══ */}
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden mb-6 shadow-sm">
          <div className={`h-1 ${
            isActive ? 'bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-400' :
            isCompleted ? 'bg-gradient-to-r from-gray-300 to-gray-400' :
            'bg-gradient-to-r from-blue-300 to-blue-400'
          }`} />

          <div className="p-6 sm:p-8">
            {/* Title row */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
                {competition.title}
              </h1>
              <div className="flex items-center gap-2 shrink-0">
                {isCompleted && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-full">
                    <CheckCircle2 className="h-3 w-3" /> Completed
                  </span>
                )}
                {!isActive && !isCompleted && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
                    <Timer className="h-3 w-3" /> Draft
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 text-sm text-gray-500 bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-full">
                  <Users className="h-3.5 w-3.5 text-gray-400" />
                  <span className="font-semibold text-gray-800">{competition.entry_count}</span>
                  {competition.entry_count === 1 ? 'entry' : 'entries'}
                  {competition.max_entries && (
                    <span className="text-gray-400">/ {competition.max_entries}</span>
                  )}
                </span>
              </div>
            </div>

            {competition.description && (
              <p className="text-gray-500 mb-5 leading-relaxed max-w-2xl">{competition.description}</p>
            )}

            {/* Countdown (active only) */}
            {isActive && (
              <div className="flex items-center gap-2 mb-5">
                <span className="text-xs text-gray-400 font-medium">Ends in</span>
                <CountdownBlock endDate={competition.end_date} />
              </div>
            )}

            {/* Stats strip */}
            <div className="flex flex-wrap gap-2.5 mb-1">
              <div className="flex items-center gap-1.5 text-sm bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5">
                <Target className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-gray-400 text-xs">Symbol</span>
                <span className="font-semibold text-gray-900">
                  {(competition.symbols && competition.symbols.length > 1
                    ? competition.symbols
                    : [competition.symbol]
                  ).join(', ')}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-sm bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5">
                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-gray-400 text-xs">Period</span>
                <span className="font-semibold text-gray-900">
                  {new Date(competition.backtest_start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  {' → '}
                  {new Date(competition.backtest_end).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-sm bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5">
                <DollarSign className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-gray-400 text-xs">Capital</span>
                <span className="font-semibold text-gray-900">${competition.initial_capital.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5">
                <BarChart3 className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-gray-400 text-xs">Ranked by</span>
                <span className="font-semibold text-gray-900">{rankingLabel}</span>
              </div>
            </div>

            {/* Rules */}
            {competition.rules && Object.keys(competition.rules).length > 0 && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-xs font-semibold text-amber-800 mb-1.5 flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" /> Rules & Requirements
                </p>
                <ul className="text-sm text-amber-700 space-y-0.5">
                  {Object.entries(competition.rules).map(([k, v]) => (
                    <li key={k}><span className="font-medium">{k}:</span> {String(v)}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Submit section */}
            {isAuthenticated && isActive && (
              <div className="mt-5 pt-5 border-t border-gray-100">
                {myEntry ? (
                  <div className="flex items-center justify-between gap-4 bg-emerald-50 border border-emerald-200 px-5 py-3.5 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      </div>
                      <span className="font-semibold text-emerald-800 text-sm">You&apos;re entered</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      {myEntry.rank && (
                        <span className="text-emerald-700 font-medium">#{myEntry.rank} place</span>
                      )}
                      <span className={`font-semibold tabular-nums ${myEntry.total_return != null && myEntry.total_return >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {fmtPct(myEntry.total_return)}
                      </span>
                    </div>
                  </div>
                ) : !showSubmitForm ? (
                  <button
                    onClick={() => setShowSubmitForm(true)}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold rounded-xl transition shadow-lg shadow-emerald-600/20"
                  >
                    <Swords className="h-4 w-4" />
                    Submit a Strategy
                  </button>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                    <p className="text-sm font-semibold text-gray-700 mb-3">Choose a strategy to submit:</p>
                    {myStrategies.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No strategies yet.{' '}
                        <Link href="/playground" className="text-emerald-600 hover:underline font-medium">
                          Create one in the Playground
                        </Link>
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {myStrategies.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => handleEnter(s.id)}
                            disabled={submitting}
                            className="px-4 py-2.5 rounded-xl border-2 border-emerald-500 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 text-sm font-semibold flex items-center gap-2 transition"
                          >
                            {submitting && submitStrategyId === s.id && (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            )}
                            {s.title}
                          </button>
                        ))}
                        <button
                          onClick={() => setShowSubmitForm(false)}
                          className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 text-sm transition"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {!isAuthenticated && isActive && (
              <div className="mt-6 pt-5 border-t border-gray-100">
                <SignInPrompt
                  title="Sign in to compete"
                  subtitle="Submit your strategy and climb the leaderboard."
                />
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        {message && (
          <div className={`mb-6 px-5 py-4 rounded-xl flex items-center gap-3 text-sm ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {message.type === 'success'
              ? <CheckCircle2 className="h-5 w-5 shrink-0" />
              : <AlertCircle className="h-5 w-5 shrink-0" />}
            {message.text}
          </div>
        )}

        {/* ═══ Podium (Top 3) ═══ */}
        {topThree.length > 0 && (
          <div className="mb-6">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2 mb-4">
              <Crown className="h-5 w-5 text-amber-500" />
              Top Performers
            </h3>
            <div className={`grid gap-3 ${podiumGridClass}`}>
              {topThree.map((entry, i) => {
                const isMe = user && entry.user_id === user.id;
                const isGold = i === 0;
                const curve = curvesByUsername[entry.username];
                return (
                  <div
                    key={entry.user_id}
                    className={`relative rounded-2xl border p-5 transition-all hover:shadow-md ${
                      isGold
                        ? 'bg-gradient-to-b from-amber-50 to-yellow-50/60 border-amber-200'
                        : i === 1
                          ? 'bg-gradient-to-b from-gray-50 to-slate-50/60 border-gray-200'
                          : 'bg-gradient-to-b from-orange-50/60 to-amber-50/40 border-amber-200/60'
                    }`}
                  >
                    {/* Rank icon */}
                    <div className="flex items-center justify-between mb-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                        isGold ? 'bg-amber-100' : i === 1 ? 'bg-gray-100' : 'bg-amber-50'
                      }`}>
                        {isGold
                          ? <Crown className="h-4 w-4 text-amber-500" />
                          : <Medal className={`h-4 w-4 ${RANK_COLORS[i]}`} />}
                      </div>
                      <span className={`text-[11px] font-bold ${RANK_COLORS[i] || 'text-gray-500'}`}>#{entry.rank}</span>
                    </div>

                    {/* Username */}
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <Link
                        href={safeProfilePath(entry.username)}
                        className="text-base font-bold text-gray-900 hover:text-emerald-600 transition"
                      >
                        {entry.username}
                      </Link>
                      {isMe && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">
                          You
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mb-3">{entry.strategy_title}</p>

                    {/* Sparkline */}
                    {curve && curve.length > 1 && (
                      <div className="mb-3">
                        <MiniSparkline
                          data={curve}
                          color={isGold ? '#f59e0b' : i === 1 ? '#6b7280' : '#d97706'}
                          width={160}
                          height={36}
                        />
                      </div>
                    )}

                    {/* Metrics */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white/70 rounded-lg px-2.5 py-2 border border-white/80">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Return</p>
                        <p className={`text-sm font-bold ${
                          entry.total_return != null && entry.total_return >= 0
                            ? 'text-emerald-600'
                            : 'text-red-600'
                        }`}>
                          {fmtPct(entry.total_return)}
                        </p>
                      </div>
                      <div className="bg-white/70 rounded-lg px-2.5 py-2 border border-white/80">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Sharpe</p>
                        <p className="text-sm font-bold text-gray-900">{fmtNum(entry.sharpe_ratio)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ Full Leaderboard ═══ */}
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <TrendingUp className="h-4.5 w-4.5 text-emerald-600" />
              Leaderboard
            </h3>
            {leaderboard && leaderboard.leaderboard.length > 0 && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full font-medium">
                {leaderboard.leaderboard.length} {leaderboard.leaderboard.length === 1 ? 'entry' : 'entries'}
              </span>
            )}
          </div>

          {!leaderboard || leaderboard.leaderboard.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Users className="h-7 w-7 text-gray-300" />
              </div>
              <p className="text-gray-700 font-semibold">No entries yet</p>
              <p className="text-sm text-gray-400 mt-1">Be the first to submit a strategy!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100">
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-12">#</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">User</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Strategy</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      {isMultiMetric ? 'Avg Rank' : 'Score'}
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Return</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Sharpe</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Max DD</th>
                    <th className="px-4 py-3 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {leaderboard.leaderboard.map((e, i) => {
                    const isMe = user && e.user_id === user.id;
                    const isExpanded = expandedRow === i;
                    const curve = curvesByUsername[e.username];
                    return (
                      <React.Fragment key={`${e.user_id}-${e.strategy_id}`}>
                        <tr
                          onClick={() => setExpandedRow(isExpanded ? null : i)}
                          className={`cursor-pointer transition-colors ${
                            e.rank === 1 ? 'bg-amber-50/50 hover:bg-amber-100/60' :
                            e.rank === 2 ? 'bg-gray-50/40 hover:bg-gray-100/50' :
                            e.rank === 3 ? 'bg-amber-50/30 hover:bg-amber-50/60' :
                            isMe ? 'bg-emerald-50/30 hover:bg-emerald-50/50' :
                            'hover:bg-gray-50/70'
                          }`}
                        >
                          <td className="px-4 py-3.5">
                            {e.rank == null ? (
                              <span className="text-sm text-gray-300 font-medium">—</span>
                            ) : e.rank === 1 ? (
                              <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center">
                                <Crown className="h-3.5 w-3.5 text-amber-600" />
                              </div>
                            ) : (
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                                e.rank === 2 ? 'bg-gray-100 text-gray-500' :
                                e.rank === 3 ? 'bg-amber-50 text-amber-700' :
                                'text-gray-400'
                              }`}>
                                {e.rank <= 3 ? e.rank : <span className="text-gray-400 font-medium">{e.rank}</span>}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <Link
                              href={safeProfilePath(e.username)}
                              onClick={(ev) => ev.stopPropagation()}
                              className="font-semibold text-gray-900 hover:text-emerald-600 transition text-sm"
                            >
                              {e.username}
                            </Link>
                            {isMe && (
                              <span className="ml-1.5 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">
                                You
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-gray-600 text-sm">{e.strategy_title}</td>
                          <td className="px-4 py-3.5 text-right font-mono text-sm text-gray-700">
                            {e.score != null
                              ? isMultiMetric
                                ? `${(-e.score).toFixed(1)}`
                                : fmtNum(e.score)
                              : '—'}
                          </td>
                          <td className={`px-4 py-3.5 text-right font-mono text-sm font-semibold ${
                            e.total_return != null && e.total_return >= 0
                              ? 'text-emerald-600'
                              : 'text-red-500'
                          }`}>
                            {fmtPct(e.total_return)}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono text-sm text-gray-700">
                            {fmtNum(e.sharpe_ratio)}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono text-sm text-red-500">
                            {e.max_drawdown != null ? `${e.max_drawdown.toFixed(1)}%` : '—'}
                          </td>
                          <td className="px-4 py-3.5 text-gray-300">
                            {isExpanded
                              ? <ChevronUp className="h-4 w-4" />
                              : <ChevronDown className="h-4 w-4" />}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-gray-50/60">
                            <td colSpan={8} className="px-6 py-5">
                              <EntryDetailRow
                                entry={e}
                                curveData={curve}
                                color={i === 0 ? '#f59e0b' : i === 1 ? '#6b7280' : i === 2 ? '#d97706' : '#10b981'}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Expandable detail row ──────────────────────────────────────────
function EntryDetailRow({
  entry,
  curveData,
  color,
}: {
  entry: LeaderboardEntry;
  curveData?: { date: string; equity: number }[];
  color: string;
}) {
  const metrics = [
    {
      label: 'Total Return',
      value: entry.total_return != null
        ? `${entry.total_return >= 0 ? '+' : ''}${entry.total_return.toFixed(2)}%`
        : '—',
      color: entry.total_return != null && entry.total_return >= 0 ? 'text-emerald-600' : 'text-red-500',
    },
    { label: 'Sharpe Ratio', value: entry.sharpe_ratio?.toFixed(2) ?? '—' },
    { label: 'Sortino Ratio', value: entry.sortino_ratio?.toFixed(2) ?? '—' },
    {
      label: 'Max Drawdown',
      value: entry.max_drawdown != null ? `${entry.max_drawdown.toFixed(1)}%` : '—',
      color: 'text-red-500',
    },
    { label: 'Win Rate', value: entry.win_rate != null ? `${entry.win_rate.toFixed(1)}%` : '—' },
    { label: 'Total Trades', value: entry.total_trades?.toString() ?? '—' },
  ];

  return (
    <div className="flex gap-5 items-start flex-wrap sm:flex-nowrap">
      {curveData && curveData.length > 1 && (
        <div className="shrink-0">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-2">Equity Curve</p>
          <MiniSparkline data={curveData} color={color} width={160} height={52} />
        </div>
      )}

      <div className="flex-1 grid grid-cols-3 sm:grid-cols-6 gap-2">
        {metrics.map((m) => (
          <div key={m.label} className="bg-white rounded-xl px-3 py-2.5 border border-gray-100">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">{m.label}</p>
            <p className={`text-sm font-bold ${m.color || 'text-gray-900'}`}>{m.value}</p>
          </div>
        ))}
      </div>

      <div className="shrink-0 flex flex-col items-end gap-2">
        <Link
          href={safeProfilePath(entry.username)}
          className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1"
        >
          View Profile
          <ArrowUpRight className="h-3 w-3" />
        </Link>
        {entry.submitted_at && (
          <p className="text-[10px] text-gray-400">
            Submitted {new Date(entry.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </p>
        )}
      </div>
    </div>
  );
}
