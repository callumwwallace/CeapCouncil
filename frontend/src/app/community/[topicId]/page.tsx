'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import type { ForumTopicResponse, ForumThreadSummary } from '@/types';
import { ArrowLeft, MessageSquare, Plus, Loader2, ChevronUp, ChevronDown, Lightbulb, X } from 'lucide-react';
import ForumEditor from '@/components/forum/ForumEditor';

const PROPOSAL_TOPIC_SLUG = 'competition-ideas';
const ARCHIVES_TOPIC_SLUG = 'archives';
const RANKING_METRICS = [
  { value: 'sharpe_ratio', label: 'Sharpe Ratio' },
  { value: 'total_return', label: 'Total Return' },
  { value: 'sortino_ratio', label: 'Sortino Ratio' },
  { value: 'calmar_ratio', label: 'Calmar Ratio' },
  { value: 'win_rate', label: 'Win Rate' },
  { value: 'max_drawdown', label: 'Min Drawdown' },
];
const ALL_SYMBOLS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META',
  'SPY', 'QQQ', 'IWM', 'DIA', 'VTI',
  'BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'DOGE-USD',
  'EUR-USD', 'GBP-USD', 'USD-JPY', 'AUD-USD',
  'GC=F', 'CL=F', 'SI=F', 'NG=F',
];

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (diff < 604800000) return d.toLocaleDateString('en-US', { weekday: 'short' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

function ThreadRow({
  t,
  topicId,
  isProposalTopic,
  onVote,
}: {
  t: ForumThreadSummary;
  topicId: string;
  isProposalTopic: boolean;
  onVote: (threadId: number, value: 1 | -1 | 0) => void;
}) {
  const handleVote = (value: 1 | -1 | 0) => () => onVote(t.id, value);

  return (
    <div className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
      {isProposalTopic && (
        <div className="flex flex-col items-center gap-0 w-12 flex-shrink-0">
          <button
            type="button"
            onClick={handleVote(t.your_vote === 1 ? 0 : 1)}
            className={`p-0.5 rounded hover:bg-gray-100 transition ${
              t.your_vote === 1 ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600'
            }`}
            title="Upvote"
          >
            <ChevronUp className="h-5 w-5" />
          </button>
          <span className="text-sm font-medium text-gray-700 tabular-nums">{t.vote_score ?? 0}</span>
          <button
            type="button"
            onClick={handleVote(t.your_vote === -1 ? 0 : -1)}
            className={`p-0.5 rounded hover:bg-gray-100 transition ${
              t.your_vote === -1 ? 'text-red-500' : 'text-gray-400 hover:text-gray-600'
            }`}
            title="Downvote"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
      )}
      <Link href={`/community/${topicId}/${t.id}`} className="flex-1 min-w-0 flex items-center gap-4 group">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate group-hover:text-emerald-700">{t.title}</p>
          <p className="text-sm text-gray-500">by {t.author_username}</p>
          {t.proposal_data && (
            <p className="text-xs text-gray-400 mt-0.5">
              {(t.proposal_data.symbols ?? [t.proposal_data.symbol]).filter(Boolean).join(', ')} · {t.proposal_data.backtest_start} → {t.proposal_data.backtest_end}
              {(t.proposal_data.ranking_metrics?.length ?? 0) > 1 && ` · ${t.proposal_data.ranking_metrics!.length} metrics`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-6 flex-shrink-0">
          <span className="text-sm text-gray-500">{t.post_count} posts</span>
          <span className="text-sm text-gray-400">{formatDate(t.updated_at)}</span>
        </div>
      </Link>
    </div>
  );
}

export default function CommunityTopicPage() {
  const params = useParams();
  const router = useRouter();
  const topicId = params?.topicId as string;
  const { isAuthenticated } = useAuthStore();
  const [topic, setTopic] = useState<ForumTopicResponse | null>(null);
  const [threads, setThreads] = useState<ForumThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showNewThread, setShowNewThread] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myStrategies, setMyStrategies] = useState<{ id: number; title: string }[]>([]);

  // Proposal form state
  const [proposalSymbols, setProposalSymbols] = useState<string[]>(['SPY']);
  const [symbolSearch, setSymbolSearch] = useState('');
  const [symbolDropdownOpen, setSymbolDropdownOpen] = useState(false);
  const [proposalBacktestStart, setProposalBacktestStart] = useState('2023-01-01');
  const [proposalBacktestEnd, setProposalBacktestEnd] = useState('2024-01-01');
  const [proposalCapital, setProposalCapital] = useState(10000);
  const [proposalMetrics, setProposalMetrics] = useState<string[]>(['sharpe_ratio']);

  const isProposalTopic = topicId === PROPOSAL_TOPIC_SLUG;
  const isArchivesTopic = topicId === ARCHIVES_TOPIC_SLUG;

  useEffect(() => {
    if (isAuthenticated) {
      api.getMyStrategies().then((s) => setMyStrategies(s.map((x) => ({ id: x.id, title: x.title })))).catch(() => {});
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!topicId) return;
    setLoading(true);
    setNotFound(false);
    const sortBy = isProposalTopic ? 'vote_score' : 'updated_at';
    Promise.all([
      api.listForumTopics(),
      api.listForumThreads(topicId, { sort_by: sortBy }),
    ])
      .then(([topics, threadList]) => {
        const t = topics.find((x) => x.slug === topicId);
        if (!t) {
          setNotFound(true);
          return;
        }
        setTopic(t);
        setThreads(threadList);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [topicId, isProposalTopic]);

  const handleVote = async (threadId: number, value: 1 | -1 | 0) => {
    if (!isAuthenticated) return;
    try {
      const res = await api.voteForumThread(threadId, value);
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? { ...t, vote_score: res.vote_score, your_vote: res.your_vote ?? undefined }
            : t
        )
      );
    } catch {
      // Silently fail
    }
  };

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topicId || !newTitle.trim() || !newBody.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      let created: ForumThreadSummary;
      if (isProposalTopic) {
        const symbols = proposalSymbols.length > 0 ? proposalSymbols : ['SPY'];
        const metrics = proposalMetrics.length > 0 ? proposalMetrics : ['sharpe_ratio'];
        created = await api.createProposalThread(topicId, {
          title: newTitle.trim(),
          body: newBody.trim(),
          symbols: symbols.map((s) => s.trim().toUpperCase()).filter(Boolean),
          backtest_start: proposalBacktestStart,
          backtest_end: proposalBacktestEnd,
          initial_capital: proposalCapital,
          ranking_metric: metrics[0],
          ranking_metrics: metrics.length > 1 ? metrics : null,
        });
      } else {
        created = await api.createForumThread(topicId, newTitle.trim(), newBody.trim());
      }
      setNewTitle('');
      setNewBody('');
      setShowNewThread(false);
      router.push(`/community/${topicId}/${created.id}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string | string[] } } })?.response?.data?.detail;
      setError(Array.isArray(msg) ? msg[0] : typeof msg === 'string' ? msg : 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  };

  if (!topicId) return null;
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }
  if (notFound || !topic) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Topic not found</p>
          <Link href="/community" className="text-emerald-600 hover:underline">Back to Community</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <Link
          href="/community"
          className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Community
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              {isProposalTopic && <Lightbulb className="h-6 w-6 text-amber-500" />}
              {topic.name}
            </h1>
            {topic.description && <p className="text-gray-600 mt-1">{topic.description}</p>}
          </div>
          {isAuthenticated && !isArchivesTopic && (
            <button
              onClick={() => setShowNewThread(!showNewThread)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition"
            >
              <Plus className="h-4 w-4" />
              {isProposalTopic ? 'New proposal' : 'New thread'}
            </button>
          )}
        </div>

        {showNewThread && (
          <form onSubmit={handleCreateThread} className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">
                {isProposalTopic ? 'Create competition proposal' : 'Create thread'}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {isProposalTopic ? 'Top 5 proposals each week become live competitions.' : 'Start a new discussion.'}
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-gray-400"
                  placeholder={isProposalTopic ? 'e.g. Q1 2024 Momentum Challenge' : 'Thread title'}
                  maxLength={200}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {isProposalTopic ? 'Description' : 'Message'} *
                </label>
                <ForumEditor
                  value={newBody}
                  onChange={setNewBody}
                  placeholder="Write your message..."
                  rows={4}
                  maxLength={10000}
                  disabled={submitting}
                  strategies={myStrategies}
                />
              </div>

              {isProposalTopic && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-gray-100">
                  <div className="relative">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Assets (up to 5) *</label>
                    <div className="flex flex-wrap gap-1.5 p-2 min-h-[38px] border border-gray-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-gray-400 focus-within:border-gray-400">
                      {proposalSymbols.map((s) => (
                        <span
                          key={s}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded"
                        >
                          {s}
                          <button
                            type="button"
                            onClick={() => setProposalSymbols((prev) => prev.filter((x) => x !== s))}
                            className="p-0.5 -mr-0.5 rounded hover:bg-gray-200"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}
                      {proposalSymbols.length < 5 && (
                        <div className="relative inline-block">
                          <input
                            type="text"
                            value={symbolSearch}
                            onChange={(e) => {
                              setSymbolSearch(e.target.value);
                              setSymbolDropdownOpen(true);
                            }}
                            onFocus={() => setSymbolDropdownOpen(true)}
                            placeholder="Search or type..."
                            className="min-w-[80px] px-1 py-0.5 text-xs border-0 focus:ring-0 focus:outline-none"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const sym = symbolSearch.trim().toUpperCase();
                                if (sym && proposalSymbols.length < 5 && !proposalSymbols.includes(sym)) {
                                  setProposalSymbols((prev) => [...prev, sym]);
                                  setSymbolSearch('');
                                  setSymbolDropdownOpen(false);
                                }
                              } else if (e.key === 'Escape') {
                                setSymbolDropdownOpen(false);
                              }
                            }}
                          />
                          {symbolDropdownOpen && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setSymbolDropdownOpen(false)}
                                aria-hidden
                              />
                              <div className="absolute left-0 top-full mt-0.5 z-20 max-h-40 overflow-y-auto w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                                {(symbolSearch
                                  ? ALL_SYMBOLS.filter(
                                      (sym) =>
                                        sym.toLowerCase().includes(symbolSearch.toLowerCase()) &&
                                        !proposalSymbols.includes(sym)
                                    )
                                  : ALL_SYMBOLS.filter((sym) => !proposalSymbols.includes(sym))
                                )
                                  .slice(0, 12)
                                  .map((sym) => (
                                    <button
                                      key={sym}
                                      type="button"
                                      onClick={() => {
                                        if (proposalSymbols.length < 5) {
                                          setProposalSymbols((prev) => [...prev, sym]);
                                          setSymbolSearch('');
                                          setSymbolDropdownOpen(false);
                                        }
                                      }}
                                      className="w-full px-2 py-1.5 text-left text-xs hover:bg-gray-50"
                                    >
                                      {sym}
                                    </button>
                                  ))}
                                {symbolSearch && !ALL_SYMBOLS.some((s) => s.toUpperCase() === symbolSearch.trim().toUpperCase()) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const sym = symbolSearch.trim().toUpperCase();
                                      if (sym && proposalSymbols.length < 5 && !proposalSymbols.includes(sym)) {
                                        setProposalSymbols((prev) => [...prev, sym]);
                                        setSymbolSearch('');
                                        setSymbolDropdownOpen(false);
                                      }
                                    }}
                                    className="w-full px-2 py-1.5 text-left text-xs text-gray-500 hover:bg-gray-50 border-t border-gray-100"
                                  >
                                    + Add &quot;{symbolSearch.trim().toUpperCase()}&quot;
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Ranking metrics *</label>
                    <div className="flex flex-wrap gap-1">
                      {RANKING_METRICS.map((m) => {
                        const selected = proposalMetrics.includes(m.value);
                        return (
                          <button
                            key={m.value}
                            type="button"
                            onClick={() => {
                              if (selected) {
                                setProposalMetrics((prev) => (prev.length > 1 ? prev.filter((x) => x !== m.value) : prev));
                              } else {
                                setProposalMetrics((prev) => [...prev, m.value]);
                              }
                            }}
                            className={`px-2 py-1 text-[11px] rounded border transition ${
                              selected ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Backtest period *</label>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={proposalBacktestStart}
                        onChange={(e) => setProposalBacktestStart(e.target.value)}
                        className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                      />
                      <input
                        type="date"
                        value={proposalBacktestEnd}
                        onChange={(e) => setProposalBacktestEnd(e.target.value)}
                        className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Initial capital ($)</label>
                    <input
                      type="number"
                      value={proposalCapital}
                      onChange={(e) => setProposalCapital(Number(e.target.value))}
                      min={1000}
                      step={1000}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="p-2 rounded bg-red-50 border border-red-200 text-xs text-red-700">
                  {error}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={submitting || !newTitle.trim() || !newBody.trim() || (isProposalTopic && proposalSymbols.length === 0)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center gap-2"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isProposalTopic ? 'Submit proposal' : 'Post'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewThread(false); setError(null); setSymbolDropdownOpen(false); }}
                  className="px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        )}

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-gray-500" />
            <span className="font-medium text-gray-900">Threads</span>
            {isProposalTopic && (
              <span className="text-xs text-gray-500">(sorted by votes)</span>
            )}
          </div>
          {threads.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              {isArchivesTopic ? (
                <>
                  <p>No archived competitions yet.</p>
                  <p className="text-sm mt-1">Results are posted here automatically when competitions complete.</p>
                </>
              ) : (
                <>
                  <p>No threads yet. Be the first to start a discussion!</p>
                  {isProposalTopic && (
                    <p className="text-sm mt-1">Top 5 proposals each week become hosted competitions.</p>
                  )}
                  {isAuthenticated && (
                    <button
                      onClick={() => setShowNewThread(true)}
                      className="mt-4 text-emerald-600 hover:text-emerald-700 font-medium"
                    >
                      {isProposalTopic ? 'Create a proposal' : 'Create a thread'}
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {threads.map((t) => (
                <ThreadRow
                  key={t.id}
                  t={t}
                  topicId={topicId}
                  isProposalTopic={isProposalTopic}
                  onVote={handleVote}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
