'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Trophy,
  Clock,
  Users,
  Target,
  Calendar,
  DollarSign,
  BarChart3,
  CheckCircle2,
  Timer,
  ArrowRight,
  ThumbsUp,
  TrendingUp,
} from 'lucide-react';
import SignInPrompt from '@/components/auth/SignInPrompt';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import type { CompetitionSummary, UpcomingPreviewItem } from '@/types';

const METRIC_LABELS: Record<string, string> = {
  sharpe_ratio: 'Sharpe',
  total_return: 'Return',
  calmar_ratio: 'Calmar',
  sortino_ratio: 'Sortino',
  win_rate: 'Win Rate',
  max_drawdown: 'Min DD',
};

function fmtDateShort(s: string): string {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// ─── Live countdown ──────────────────────────────────────────────────
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

function CompactCountdown({ endDate }: { endDate: string }) {
  const { days, hours, mins, ended } = useCountdown(endDate);
  if (ended) return <span className="text-gray-400">Ended</span>;
  if (days > 0) return <span>{days}d {hours}h</span>;
  if (hours > 0) return <span>{hours}h {mins}m</span>;
  return <span className="text-red-600 font-semibold">{mins}m</span>;
}

function CountdownTimer({ endDate }: { endDate: string }) {
  const { days, hours, mins, secs, ended } = useCountdown(endDate);
  if (ended) return <span className="text-gray-400 text-sm">Ended</span>;
  const units = [
    { val: days, label: 'd' },
    { val: hours, label: 'h' },
    { val: mins, label: 'm' },
    { val: secs, label: 's' },
  ];
  return (
    <div className="flex items-center gap-0.5">
      {units.map((u, i) => (
        <span key={u.label}>
          <span className="font-mono font-bold text-gray-900 tabular-nums">{String(u.val).padStart(2, '0')}</span>
          <span className="text-[10px] text-gray-500">{u.label}</span>
          {i < 3 && <span className="text-gray-300 mx-0.5">:</span>}
        </span>
      ))}
    </div>
  );
}

function isEnded(endDate: string): boolean {
  return new Date(endDate).getTime() <= Date.now();
}

function urgencyAccent(endDate: string): string {
  const diff = new Date(endDate).getTime() - Date.now();
  if (diff <= 0) return 'from-gray-200 to-gray-300';
  if (diff < 86400000) return 'from-red-400 to-red-500';
  if (diff < 259200000) return 'from-amber-400 to-amber-500';
  return 'from-emerald-400 to-teal-400';
}

// ─── Competition card ─────────────────────────────────────────────────
function CompetitionCard({
  c,
  getRankingLabel,
}: {
  c: CompetitionSummary;
  getRankingLabel: (c: CompetitionSummary) => string;
}) {
  const ended = isEnded(c.end_date);
  const effectiveCompleted = c.status === 'completed' || (c.status === 'active' && ended);
  const isActive = c.status === 'active' && !ended;
  const isDraft = c.status === 'draft';

  return (
    <Link
      href={`/competitions/${c.id}`}
      className={`group flex flex-col rounded-2xl border bg-white overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${
        isActive
          ? 'border-emerald-200 hover:border-emerald-300 hover:shadow-emerald-100/60'
          : isDraft
            ? 'border-blue-200 hover:border-blue-300 hover:shadow-blue-100/60'
            : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      {/* Top accent stripe */}
      <div className={`h-1 bg-gradient-to-r ${
        isActive ? urgencyAccent(c.end_date) :
        isDraft ? 'from-blue-300 to-blue-400' :
        'from-gray-200 to-gray-300'
      }`} />

      <div className="flex flex-col flex-1 p-5">
        {/* Status row */}
        <div className="flex items-center justify-between mb-3">
          {effectiveCompleted ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
              <CheckCircle2 className="h-3 w-3" />
              Completed
            </span>
          ) : isDraft ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
              <Timer className="h-3 w-3" />
              Upcoming
            </span>
          ) : <div />}
          {isActive && (
            <span className="text-[11px] font-semibold text-gray-500 flex items-center gap-1">
              <Clock className="h-3 w-3 text-gray-400" />
              <CompactCountdown endDate={c.end_date} />
            </span>
          )}
          {isDraft && (
            <span className="text-[11px] text-blue-500 font-medium">
              Starts {new Date(c.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-[15px] font-bold text-gray-900 group-hover:text-emerald-700 transition line-clamp-1 mb-1">
          {c.title}
        </h3>
        {c.description && (
          <p className="text-xs text-gray-500 line-clamp-2 mb-3 leading-relaxed flex-1">{c.description}</p>
        )}

        {/* Chips */}
        <div className="flex items-center gap-2 flex-wrap mt-auto mb-3">
          {(c.symbols && c.symbols.length > 1 ? c.symbols : [c.symbol]).map((sym) => (
            <span key={sym} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-md">
              <Target className="h-2.5 w-2.5 text-gray-400" />
              {sym}
            </span>
          ))}
          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
            <Users className="h-3 w-3" />
            {c.entry_count}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
            <DollarSign className="h-3 w-3" />
            {c.initial_capital >= 1000 ? `${(c.initial_capital / 1000).toFixed(0)}k` : c.initial_capital}
          </span>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-[11px] text-gray-400 pt-3 border-t border-gray-100">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {fmtDateShort(c.backtest_start)} → {fmtDateShort(c.backtest_end)}
          </span>
          <span className="flex items-center gap-1 font-medium text-gray-500">
            <BarChart3 className="h-3 w-3" />
            {getRankingLabel(c)}
          </span>
        </div>
      </div>
    </Link>
  );
}

// ─── Upcoming proposal card ─────────────────────────────────────────
function UpcomingProposalCard({
  p,
  getRankingLabel,
  rank,
}: {
  p: UpcomingPreviewItem;
  getRankingLabel: (p: UpcomingPreviewItem) => string;
  rank: number;
}) {
  const isPlaceholder = p.is_placeholder || p.thread_id == null;

  const cardContent = (
    <>
      <div className={`h-1 bg-gradient-to-r ${isPlaceholder ? 'from-gray-200 to-gray-300' : 'from-blue-300 to-blue-400'}`} />
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${
            rank === 1
              ? 'text-amber-700 bg-amber-50 border border-amber-200'
              : isPlaceholder
                ? 'text-gray-500 bg-gray-100'
                : 'text-blue-600 bg-blue-50'
          }`}>
            #{rank}
          </span>
          {!isPlaceholder && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600">
              <ThumbsUp className="h-3 w-3 text-blue-400" />
              {p.vote_score}
            </span>
          )}
        </div>
        <h3 className={`text-[15px] font-bold line-clamp-1 mb-1 transition ${
          isPlaceholder ? 'text-gray-500' : 'text-gray-900 group-hover:text-blue-700'
        }`}>
          {p.title}
        </h3>
        {!isPlaceholder && p.author_username && (
          <p className="text-xs text-gray-500 mb-3">by {p.author_username}</p>
        )}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {(p.symbols && p.symbols.length > 1 ? p.symbols : [p.symbol]).map((sym) => (
            <span key={sym} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-md">
              <Target className="h-2.5 w-2.5 text-gray-400" />
              {sym}
            </span>
          ))}
          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
            <DollarSign className="h-3 w-3" />
            {p.initial_capital >= 1000 ? `${(p.initial_capital / 1000).toFixed(0)}k` : p.initial_capital}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-gray-400 pt-3 border-t border-gray-100">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {fmtDateShort(p.backtest_start)} → {fmtDateShort(p.backtest_end)}
          </span>
          <span className="flex items-center gap-1 font-medium text-gray-500">
            <BarChart3 className="h-3 w-3" />
            {getRankingLabel(p)}
          </span>
        </div>
      </div>
    </>
  );

  if (isPlaceholder) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white/60 overflow-hidden opacity-60">
        {cardContent}
      </div>
    );
  }

  return (
    <Link
      href={`/community/competition-ideas/${p.thread_id}`}
      className="group block rounded-2xl border border-blue-200 bg-white overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-blue-100/60"
    >
      {cardContent}
    </Link>
  );
}

// ─── Skeleton card ────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden animate-pulse">
      <div className="h-1 bg-gray-200" />
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 w-12 bg-gray-200 rounded-full" />
          <div className="h-4 w-16 bg-gray-100 rounded" />
        </div>
        <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
        <div className="h-4 bg-gray-100 rounded w-full mb-1" />
        <div className="h-4 bg-gray-100 rounded w-2/3 mb-4" />
        <div className="flex gap-2 mb-4">
          <div className="h-5 w-12 bg-gray-100 rounded-md" />
          <div className="h-5 w-8 bg-gray-100 rounded" />
          <div className="h-5 w-10 bg-gray-100 rounded" />
        </div>
        <div className="border-t border-gray-100 pt-3 flex justify-between">
          <div className="h-3 w-28 bg-gray-100 rounded" />
          <div className="h-3 w-14 bg-gray-100 rounded" />
        </div>
      </div>
    </div>
  );
}

export default function CompetitionsPage() {
  const { isAuthenticated } = useAuthStore();
  const [competitions, setCompetitions] = useState<CompetitionSummary[]>([]);
  const [upcomingPreview, setUpcomingPreview] = useState<UpcomingPreviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const [tab, setTab] = useState<'active' | 'upcoming'>('active');
  const [visibleCount, setVisibleCount] = useState(9);

  useEffect(() => {
    api.listCompetitions()
      .then(setCompetitions)
      .catch(() => setCompetitions([]))
      .finally(() => setLoading(false));
  }, []);

  const fetchUpcoming = useCallback(() => {
    setUpcomingLoading(true);
    api.getUpcomingPreview()
      .then(setUpcomingPreview)
      .catch(() => setUpcomingPreview([]))
      .finally(() => setUpcomingLoading(false));
  }, []);

  useEffect(() => {
    if (tab === 'upcoming') {
      fetchUpcoming();
      const id = setInterval(fetchUpcoming, 30000);
      return () => clearInterval(id);
    }
  }, [tab, fetchUpcoming]);

  const activeComps = useMemo(() =>
    competitions.filter((c) => c.status === 'active' && !isEnded(c.end_date)),
  [competitions]);

  const totalEntries = useMemo(() =>
    activeComps.reduce((sum, c) => sum + c.entry_count, 0),
  [activeComps]);

  const allDisplayed = tab === 'active' ? activeComps : upcomingPreview;
  const displayedComps = tab === 'active' ? allDisplayed.slice(0, visibleCount) : allDisplayed;
  const hasMore = tab === 'active' && allDisplayed.length > visibleCount;

  const featuredComp = useMemo(() => {
    if (activeComps.length === 0) return null;
    return [...activeComps].sort((a, b) => b.entry_count - a.entry_count)[0];
  }, [activeComps]);

  const getRankingLabel = (c: CompetitionSummary | UpcomingPreviewItem) =>
    c.ranking_metrics && c.ranking_metrics.length > 1
      ? c.ranking_metrics.map((m) => METRIC_LABELS[m] || m).join(' + ')
      : METRIC_LABELS[c.ranking_metric] || c.ranking_metric;

  return (
    <div className="min-h-screen bg-gray-50/80">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">

        {/* ═══ Page header ═══ */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Trophy className="h-6 w-6 text-emerald-600" />
                Competitions
              </h1>
              <p className="mt-1.5 text-gray-500 ml-1">
                Submit strategies, compete for rankings, and earn badges.
              </p>
            </div>
          </div>

          {/* Stats strip */}
          {!loading && activeComps.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Active Now</p>
                <p className="text-2xl font-bold text-gray-900">{activeComps.length}</p>
                <p className="text-xs text-gray-400">competitions</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Total Entries</p>
                <p className="text-2xl font-bold text-gray-900">{totalEntries}</p>
                <p className="text-xs text-gray-400">this week</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Most Active</p>
                <p className="text-sm font-bold text-gray-900 line-clamp-1">{featuredComp?.title.split('—')[0].trim() ?? '—'}</p>
                <p className="text-xs text-gray-400">{featuredComp?.entry_count ?? 0} entries</p>
              </div>
            </div>
          )}
        </div>

        {/* ═══ Featured live competition ═══ */}
        {featuredComp && (
          <Link
            href={`/competitions/${featuredComp.id}`}
            className="group block rounded-2xl border border-emerald-200 bg-white overflow-hidden hover:shadow-xl hover:shadow-emerald-100/60 hover:-translate-y-0.5 transition-all duration-200 mb-8"
          >
            <div className="h-1.5 bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-400" />
            <div className="grid lg:grid-cols-[1fr_200px]">
              {/* Left: Info */}
              <div className="p-6 sm:p-7">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs text-gray-400">Ends in</span>
                  <CountdownTimer endDate={featuredComp.end_date} />
                </div>

                <h2 className="text-xl font-bold text-gray-900 group-hover:text-emerald-700 transition mb-1.5">
                  {featuredComp.title}
                </h2>
                {featuredComp.description && (
                  <p className="text-sm text-gray-500 line-clamp-2 mb-4 max-w-xl">{featuredComp.description}</p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-800 bg-gray-100 px-2.5 py-1 rounded-md">
                    <Target className="h-3 w-3 text-gray-400" />
                    {(featuredComp.symbols && featuredComp.symbols.length > 1
                      ? featuredComp.symbols
                      : [featuredComp.symbol]
                    ).join(', ')}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-50 border border-gray-200 px-2 py-1 rounded-md">
                    <DollarSign className="h-3 w-3" />${featuredComp.initial_capital.toLocaleString()} capital
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-50 border border-gray-200 px-2 py-1 rounded-md">
                    <BarChart3 className="h-3 w-3" />{getRankingLabel(featuredComp)}
                  </span>
                </div>
              </div>

              {/* Right: CTA panel */}
              <div className="lg:border-l border-t lg:border-t-0 border-gray-100 bg-gray-50/80 p-6 flex flex-col items-center justify-center gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-gray-900">{featuredComp.entry_count}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-1 justify-center mt-0.5">
                    <Users className="h-3 w-3" />
                    {featuredComp.entry_count === 1 ? 'entry' : 'entries'}
                  </div>
                </div>
                <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 group-hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition shadow-sm shadow-emerald-600/20">
                  Enter
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>
          </Link>
        )}

        {/* ═══ Tabs + Grid ═══ */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center gap-0.5 p-1 bg-gray-100 rounded-xl">
              {[
                { key: 'active' as const, label: 'Active', count: activeComps.length, icon: TrendingUp },
                { key: 'upcoming' as const, label: 'Upcoming', count: null, icon: Timer },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => { setTab(t.key); setVisibleCount(9); }}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    tab === t.key
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                  {t.count != null && t.count > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                      tab === t.key ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {t.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Loading skeletons */}
          {(loading || (tab === 'upcoming' && upcomingLoading && upcomingPreview.length === 0)) ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => <SkeletonCard key={i} />)}
            </div>

          ) : displayedComps.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Trophy className="h-7 w-7 text-gray-300" />
              </div>
              <p className="text-gray-700 font-semibold">
                {tab === 'active' ? 'No active competitions right now' : 'No proposals yet this week'}
              </p>
              <p className="text-sm text-gray-400 mt-1.5">
                {tab === 'active'
                  ? 'Check the Upcoming tab to see what\'s coming next Monday'
                  : 'Top 5 proposals go live each Monday — propose and vote in Community.'}
              </p>
              {tab === 'upcoming' && (
                <Link
                  href="/community/competition-ideas"
                  className="mt-4 inline-flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  Go to Competition Proposals <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>

          ) : tab === 'active' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {(displayedComps as CompetitionSummary[]).map((c) => (
                  <CompetitionCard
                    key={c.id}
                    c={c}
                    getRankingLabel={getRankingLabel as (c: CompetitionSummary) => string}
                  />
                ))}
              </div>

              {hasMore && (
                <div className="mt-6 text-center">
                  <button
                    onClick={() => setVisibleCount((prev) => prev + 9)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition"
                  >
                    Show more
                    <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                      {allDisplayed.length - visibleCount}
                    </span>
                  </button>
                </div>
              )}
              {!hasMore && visibleCount > 9 && allDisplayed.length > 9 && (
                <div className="mt-6 text-center">
                  <button
                    onClick={() => { setVisibleCount(9); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="text-sm text-gray-400 hover:text-gray-600 transition"
                  >
                    Show less
                  </button>
                </div>
              )}
            </>

          ) : (
            <>
              <p className="text-sm text-gray-500 mb-4 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                Top 5 proposals by votes. Updates every 30s.
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {(displayedComps as UpcomingPreviewItem[]).map((p, i) => (
                  <UpcomingProposalCard
                    key={p.thread_id ?? `placeholder-${i}`}
                    p={p}
                    getRankingLabel={getRankingLabel as (p: UpcomingPreviewItem) => string}
                    rank={i + 1}
                  />
                ))}
              </div>
              <Link
                href="/community/competition-ideas"
                className="mt-6 block text-center text-sm text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Propose or vote in Community →
              </Link>
            </>
          )}
        </div>

        {/* ═══ Sign-in prompt ═══ */}
        {!isAuthenticated && (
          <div className="mt-12">
            <SignInPrompt
              title="Sign in to enter Competitions"
              subtitle="Submit strategies and compete against the community."
            />
          </div>
        )}
      </div>
    </div>
  );
}
