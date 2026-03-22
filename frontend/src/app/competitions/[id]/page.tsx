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
  Award,
  Calendar,
  DollarSign,
  Target,
  Clock,
  Users,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Flame,
  CheckCircle2,
  Timer,
  ArrowUpRight,
  AlertCircle,
  Crown,
  Medal,
  Zap,
  Star,
  Shield,
  Swords,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import { MiniSparkline } from '@/components/leaderboard/CompetitionEquityChart';
import type {
  CompetitionDetail,
  LeaderboardResponse,
  LeaderboardEntry,
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

const PODIUM_STYLES = [
  { bg: 'bg-gradient-to-br from-amber-50 to-yellow-50', border: 'border-amber-200', icon: Crown, iconColor: 'text-amber-500', ring: 'ring-amber-200' },
  { bg: 'bg-gradient-to-br from-gray-50 to-slate-50', border: 'border-gray-200', icon: Medal, iconColor: 'text-gray-400', ring: 'ring-gray-200' },
  { bg: 'bg-gradient-to-br from-amber-50/60 to-orange-50/60', border: 'border-amber-200/60', icon: Medal, iconColor: 'text-amber-600', ring: 'ring-amber-200/60' },
];

// ─── Countdown hook ──────────────────────────────────────────────────
function useCountdown(endDate: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, new Date(endDate).getTime() - now);
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return { days, hours, mins, secs, ended: diff <= 0 };
}

function CountdownBlock({ endDate }: { endDate: string }) {
  const { days, hours, mins, secs, ended } = useCountdown(endDate);
  if (ended) return <span className="text-gray-400 text-sm font-medium">Competition Ended</span>;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Submission
  const [myStrategies, setMyStrategies] = useState<Strategy[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitStrategyId, setSubmitStrategyId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showSubmitForm, setShowSubmitForm] = useState(false);

  // Expandable row
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

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

  const formatPct = (v: number | null | undefined) =>
    v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '—';
  const formatNum = (v: number | null | undefined) =>
    v != null ? v.toFixed(2) : '—';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <p className="text-sm text-gray-400">Loading competition...</p>
      </div>
    );
  }

  if (error || !competition) {
    return (
      <div className="min-h-screen bg-slate-50">
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

  const topThree = leaderboard ? leaderboard.leaderboard.slice(0, 3) : [];
  const restOfLeaderboard = leaderboard ? leaderboard.leaderboard.slice(3) : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Breadcrumb */}
        <Link
          href="/competitions"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6 transition font-medium"
        >
          <ChevronLeft className="h-4 w-4" />
          All Competitions
        </Link>

        {/* ═══ Hero Card ═══ */}
        <div className="relative rounded-2xl border border-gray-200 bg-white overflow-hidden mb-8 shadow-sm">
          {/* Top accent */}
          <div className={`h-1.5 ${isActive ? 'bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-400' : isCompleted ? 'bg-gradient-to-r from-gray-300 to-gray-400' : 'bg-gradient-to-r from-blue-300 to-blue-400'}`} />

          <div className="p-6 sm:p-8">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
              <div className="flex-1 min-w-0">
                {/* Status badges */}
                <div className="flex items-center gap-3 mb-4">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ${
                    isActive ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                    isCompleted ? 'bg-gray-50 border-gray-200 text-gray-600' :
                    'bg-blue-50 border-blue-200 text-blue-600'
                  }`}>
                    {isActive ? <><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live</> :
                     isCompleted ? <><CheckCircle2 className="h-3 w-3" /> Completed</> :
                     <><Timer className="h-3 w-3" /> Draft</>}
                  </span>
                  {isActive && (
                    <CountdownBlock endDate={competition.end_date} />
                  )}
                </div>

                <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">{competition.title}</h1>
                {competition.description && (
                  <p className="text-gray-600 text-lg mb-6 max-w-2xl">{competition.description}</p>
                )}

                {/* Stats grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { icon: Target, label: competition.symbols && competition.symbols.length > 1 ? 'Symbols' : 'Symbol', value: (competition.symbols && competition.symbols.length > 1 ? competition.symbols : [competition.symbol]).join(', '), color: 'text-emerald-600' },
                    { icon: Calendar, label: 'Backtest', value: `${competition.backtest_start.slice(0, 10)} → ${competition.backtest_end.slice(0, 10)}`, small: true },
                    { icon: DollarSign, label: 'Capital', value: `$${competition.initial_capital.toLocaleString()}`, color: 'text-emerald-600' },
                    { icon: BarChart3, label: 'Ranked By', value: rankingLabel },
                  ].map((s) => (
                    <div key={s.label} className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                        <s.icon className="h-3 w-3" /> {s.label}
                      </div>
                      <p className={`font-semibold text-gray-900 ${s.small ? 'text-sm' : ''}`}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Rules */}
                {competition.rules && Object.keys(competition.rules).length > 0 && (
                  <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-xs font-semibold text-amber-800 mb-1.5 flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5" /> Rules & Requirements
                    </p>
                    <ul className="text-sm text-amber-700 space-y-0.5">
                      {Object.entries(competition.rules).map(([k, v]) => (
                        <li key={k}>
                          <span className="font-medium">{k}:</span> {String(v)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Right side - entries + CTA */}
              <div className="flex flex-col items-center lg:items-end gap-5 shrink-0">
                <div className="text-center lg:text-right bg-gray-50 rounded-xl px-6 py-4 border border-gray-100">
                  <div className="text-4xl font-bold text-gray-900">{competition.entry_count}</div>
                  <div className="text-sm text-gray-500 flex items-center gap-1 justify-center lg:justify-end">
                    <Users className="h-3.5 w-3.5" />
                    entr{competition.entry_count === 1 ? 'y' : 'ies'}
                  </div>
                  {competition.max_entries && (
                    <div className="text-[10px] text-gray-400 mt-1">
                      max {competition.max_entries}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Submit section */}
            {isAuthenticated && isActive && (
              <div className="mt-6 pt-5 border-t border-gray-200">
                {myEntry ? (
                  <div className="flex items-center gap-3 text-sm bg-emerald-50 border border-emerald-200 px-5 py-4 rounded-xl">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <span className="font-semibold text-emerald-800">You&apos;re entered!</span>
                      <span className="text-emerald-700 ml-1">
                        Ranked #{myEntry.rank || '—'} with {formatPct(myEntry.total_return)} return
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    {!showSubmitForm ? (
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
                            No strategies found.{' '}
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
                  </>
                )}
              </div>
            )}

            {!isAuthenticated && isActive && (
              <div className="mt-6 pt-5 border-t border-gray-200">
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
          <div className={`mb-6 px-5 py-4 rounded-xl flex items-center gap-3 ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
            {message.text}
          </div>
        )}

        {/* ═══ Podium (Top 3) ═══ */}
        {topThree.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
              <Crown className="h-5 w-5 text-amber-500" />
              Top Performers
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              {topThree.map((entry, i) => {
                const style = PODIUM_STYLES[i];
                const isMe = user && entry.user_id === user.id;
                return (
                  <div
                    key={entry.user_id}
                    className={`relative rounded-2xl border ${style.border} ${style.bg} p-5 transition-all hover:shadow-md`}
                  >
                    {/* Rank badge */}
                    <div className="flex items-center justify-between mb-3">
                      <div className={`flex items-center gap-2`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          i === 0 ? 'bg-amber-100' : i === 1 ? 'bg-gray-100' : 'bg-amber-50'
                        }`}>
                          <style.icon className={`h-4 w-4 ${style.iconColor}`} />
                        </div>
                        <span className="text-sm font-bold text-gray-500">#{entry.rank}</span>
                      </div>
                    </div>

                    <Link
                      href={safeProfilePath(entry.username)}
                      className="text-lg font-bold text-gray-900 hover:text-emerald-600 transition"
                    >
                      {entry.username}
                    </Link>
                    {isMe && (
                      <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">
                        You
                      </span>
                    )}
                    <p className="text-sm text-gray-500 mt-0.5">{entry.strategy_title}</p>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="bg-white/60 rounded-lg px-2.5 py-2 border border-white/80">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Return</p>
                        <p className={`text-sm font-bold ${
                          entry.total_return != null && entry.total_return >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}>
                          {formatPct(entry.total_return)}
                        </p>
                      </div>
                      <div className="bg-white/60 rounded-lg px-2.5 py-2 border border-white/80">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Sharpe</p>
                        <p className="text-sm font-bold text-gray-900">{formatNum(entry.sharpe_ratio)}</p>
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
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-bold text-gray-900 flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              Leaderboard
            </h3>
            {leaderboard && leaderboard.leaderboard.length > 0 && (
              <span className="text-xs text-gray-400 font-medium bg-gray-100 px-2.5 py-1 rounded-full">
                {leaderboard.leaderboard.length} entries
              </span>
            )}
          </div>

          {!leaderboard || leaderboard.leaderboard.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Users className="h-8 w-8 text-gray-300" />
              </div>
              <p className="text-lg text-gray-700 font-semibold">No entries yet</p>
              <p className="text-sm text-gray-400 mt-1">Be the first to submit a strategy!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-12">#</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Strategy</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Score</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Return</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Sharpe</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">DD%</th>
                    <th className="px-4 py-3 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.leaderboard.map((e, i) => {
                    const isMe = user && e.user_id === user.id;
                    const isExpanded = expandedRow === i;
                    return (
                      <React.Fragment key={`${e.user_id}-${e.strategy_id}`}>
                        <tr
                          onClick={() => setExpandedRow(isExpanded ? null : i)}
                          className={`border-b border-gray-100 cursor-pointer transition-colors ${
                            e.rank === 1 ? 'bg-amber-50/60 hover:bg-amber-100/60' :
                            e.rank === 2 ? 'bg-gray-50/40 hover:bg-gray-100/50' :
                            e.rank === 3 ? 'bg-amber-50/30 hover:bg-amber-50/50' :
                            isMe ? 'bg-emerald-50/30 hover:bg-emerald-50/50' :
                            'hover:bg-gray-50'
                          }`}
                        >
                          <td className="px-4 py-3.5">
                            {e.rank == null ? (
                              <span className="text-sm text-gray-300 font-medium pl-1">—</span>
                            ) : e.rank === 1 ? (
                              <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center">
                                <Crown className="h-3.5 w-3.5 text-amber-600" />
                              </div>
                            ) : e.rank === 2 ? (
                              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                                <span className="text-xs font-bold text-gray-500">2</span>
                              </div>
                            ) : e.rank === 3 ? (
                              <div className="w-7 h-7 rounded-full bg-amber-50 flex items-center justify-center">
                                <span className="text-xs font-bold text-amber-700">3</span>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400 font-medium pl-1">{e.rank}</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <Link
                              href={safeProfilePath(e.username)}
                              onClick={(ev) => ev.stopPropagation()}
                              className="text-gray-900 font-semibold hover:text-emerald-600 transition"
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
                          <td className="px-4 py-3.5 text-right font-mono text-sm">
                            {e.score != null
                              ? leaderboard.ranking_metrics && leaderboard.ranking_metrics.length > 1
                                ? `Avg: ${(-e.score).toFixed(1)}`
                                : formatNum(e.score)
                              : '—'}
                          </td>
                          <td className={`px-4 py-3.5 text-right font-mono text-sm font-semibold ${
                            e.total_return != null && e.total_return >= 0 ? 'text-emerald-600' : 'text-red-600'
                          }`}>
                            {formatPct(e.total_return)}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono text-sm">
                            {formatNum(e.sharpe_ratio)}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono text-sm text-red-500">
                            {e.max_drawdown != null ? `${e.max_drawdown.toFixed(1)}%` : '—'}
                          </td>
                          <td className="px-4 py-3.5 text-gray-400">
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-gray-50/80">
                            <td colSpan={8} className="px-6 py-5">
                              <EntryDetailRow entry={e} color="#9ca3af" />
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

// ─── Expandable detail row ─────────────────────────────────────────

interface EntryDetailRowProps {
  entry: LeaderboardEntry;
  curveData?: { date: string; equity: number }[];
  color: string;
}

function EntryDetailRow({ entry, curveData, color }: EntryDetailRowProps) {
  const metrics = [
    { label: 'Total Return', value: entry.total_return != null ? `${entry.total_return >= 0 ? '+' : ''}${entry.total_return.toFixed(2)}%` : '—', color: entry.total_return != null && entry.total_return >= 0 ? 'text-emerald-600' : 'text-red-600' },
    { label: 'Sharpe Ratio', value: entry.sharpe_ratio?.toFixed(2) ?? '—' },
    { label: 'Sortino Ratio', value: entry.sortino_ratio?.toFixed(2) ?? '—' },
    { label: 'Max Drawdown', value: entry.max_drawdown != null ? `${entry.max_drawdown.toFixed(1)}%` : '—', color: 'text-red-500' },
    { label: 'Win Rate', value: entry.win_rate != null ? `${entry.win_rate.toFixed(1)}%` : '—' },
    { label: 'Total Trades', value: entry.total_trades?.toString() ?? '—' },
  ];

  return (
    <div className="flex gap-6 items-start">
      {curveData && curveData.length > 0 && (
        <div className="shrink-0">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5 font-semibold">Equity Curve</p>
          <MiniSparkline data={curveData} color={color} width={160} height={48} />
        </div>
      )}

      <div className="flex-1 grid grid-cols-3 sm:grid-cols-6 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="bg-white rounded-lg px-3 py-2 border border-gray-100">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{m.label}</p>
            <p className={`text-sm font-bold ${m.color || 'text-gray-900'}`}>{m.value}</p>
          </div>
        ))}
      </div>

      <div className="shrink-0">
        <Link
          href={safeProfilePath(entry.username)}
          className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1"
        >
          View Profile
          <ArrowUpRight className="h-3 w-3" />
        </Link>
        {entry.submitted_at && (
          <p className="text-[10px] text-gray-400 mt-1">
            Submitted {new Date(entry.submitted_at).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
}
