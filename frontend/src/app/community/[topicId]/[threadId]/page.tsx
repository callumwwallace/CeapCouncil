'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import type { ForumThreadDetail } from '@/types';
import { ArrowLeft, Loader2, MessageSquare, Quote, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import ForumEditor from '@/components/forum/ForumEditor';
import MarkdownContent from '@/components/forum/MarkdownContent';

const METRIC_LABELS: Record<string, string> = {
  sharpe_ratio: 'Sharpe Ratio',
  total_return: 'Total Return',
  sortino_ratio: 'Sortino Ratio',
  calmar_ratio: 'Calmar Ratio',
  win_rate: 'Win Rate',
  max_drawdown: 'Min Drawdown',
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function CommunityThreadPage() {
  const params = useParams();
  const topicId = params?.topicId as string;
  const threadId = parseInt(params?.threadId as string, 10);
  const { user, isAuthenticated } = useAuthStore();
  const [thread, setThread] = useState<ForumThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myStrategies, setMyStrategies] = useState<{ id: number; title: string }[]>([]);

  useEffect(() => {
    if (isAuthenticated) {
      api.getMyStrategies().then((s) => setMyStrategies(s.map((x) => ({ id: x.id, title: x.title })))).catch(() => {});
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!topicId || isNaN(threadId)) return;
    setLoading(true);
    api
      .getForumThread(threadId)
      .then(setThread)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [topicId, threadId]);

  const replyFormRef = React.useRef<HTMLFormElement>(null);

  const handleDeletePost = async (postId: number) => {
    if (!confirm('Delete this post?')) return;
    setDeletingId(postId);
    try {
      await api.deleteForumPost(postId);
      setThread((prev) =>
        prev ? { ...prev, posts: prev.posts.filter((p) => p.id !== postId), post_count: prev.post_count - 1 } : null
      );
    } catch {
      setError('Failed to delete post');
    } finally {
      setDeletingId(null);
    }
  };

  const handleVote = async (value: 1 | -1 | 0) => {
    if (!isAuthenticated) return;
    try {
      const res = await api.voteForumThread(threadId, value);
      setThread((prev) => (prev ? { ...prev, vote_score: res.vote_score, your_vote: res.your_vote ?? undefined } : null));
    } catch {
      // Silently fail
    }
  };

  const handleQuote = (authorUsername: string, content: string) => {
    const lines = content.split('\n');
    const blockquote = lines.map((l) => `> ${l}`).join('\n');
    const insert = `> @${authorUsername} wrote:\n> \n${blockquote}\n\n`;
    setReplyContent((prev) => prev + (prev && !prev.endsWith('\n') ? '\n' : '') + insert);
    replyFormRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const post = await api.createForumPost(threadId, replyContent.trim());
      setThread((prev) =>
        prev
          ? {
              ...prev,
              posts: [...prev.posts, post],
              post_count: prev.post_count + 1,
            }
          : null
      );
      setReplyContent('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string | string[] } } })?.response?.data?.detail;
      setError(Array.isArray(msg) ? msg[0] : typeof msg === 'string' ? msg : 'Failed to post');
    } finally {
      setSubmitting(false);
    }
  };

  if (!topicId || isNaN(threadId)) return null;
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }
  if (notFound || !thread) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Thread not found</p>
          <Link href="/community" className="text-emerald-600 hover:underline">Back to Community</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <Link
          href={`/community/${topicId}`}
          className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {topicId.replace(/-/g, ' ')}
        </Link>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-200 flex items-start gap-4">
            {thread.proposal_data && (
              <div className="flex flex-col items-center gap-0 flex-shrink-0">
                {isAuthenticated && user?.username !== thread.author_username ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleVote(thread.your_vote === 1 ? 0 : 1)}
                      className={`p-0.5 rounded hover:bg-gray-100 transition ${
                        thread.your_vote === 1 ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600'
                      }`}
                      title="Upvote"
                    >
                      <ChevronUp className="h-6 w-6" />
                    </button>
                    <span className="text-base font-semibold text-gray-700 tabular-nums">{thread.vote_score ?? 0}</span>
                    <button
                      type="button"
                      onClick={() => handleVote(thread.your_vote === -1 ? 0 : -1)}
                      className={`p-0.5 rounded hover:bg-gray-100 transition ${
                        thread.your_vote === -1 ? 'text-red-500' : 'text-gray-400 hover:text-gray-600'
                      }`}
                      title="Downvote"
                    >
                      <ChevronDown className="h-6 w-6" />
                    </button>
                  </>
                ) : (
                  <span className="text-base font-semibold text-gray-700 tabular-nums py-2">{thread.vote_score ?? 0}</span>
                )}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900">{thread.title}</h1>
              <p className="text-sm text-gray-500 mt-1">
                Started by {thread.author_username} · {formatDate(thread.created_at)} · {thread.post_count} posts
              </p>
              {thread.proposal_data && (
                <p className="text-sm text-gray-600 mt-2">
                  <span className="font-medium">
                    {(thread.proposal_data.symbols ?? [thread.proposal_data.symbol]).filter(Boolean).join(', ')}
                  </span>
                  {' · '}
                  {thread.proposal_data.backtest_start} → {thread.proposal_data.backtest_end}
                  {' · '}
                  ${thread.proposal_data.initial_capital?.toLocaleString()}
                  {' · '}
                  {(thread.proposal_data.ranking_metrics ?? [thread.proposal_data.ranking_metric])
                    .filter(Boolean)
                    .map((m) => METRIC_LABELS[m] || m)
                    .join(', ')}
                </p>
              )}
            </div>
          </div>

          {/* Main post */}
          {thread.posts[0] && (
            <div className="px-6 py-5">
              <div className="flex items-start gap-4">
                <Link
                  href={`/profile/${thread.posts[0].author_username}`}
                  className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-medium"
                >
                  {thread.posts[0].author_username.charAt(0).toUpperCase()}
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/profile/${thread.posts[0].author_username}`}
                      className="font-medium text-gray-900 hover:text-emerald-600"
                    >
                      {thread.posts[0].author_username}
                    </Link>
                    <span className="text-sm text-gray-400">{formatDate(thread.posts[0].created_at)}</span>
                    <div className="flex items-center gap-2">
                      {isAuthenticated && (
                        <button
                          type="button"
                          onClick={() => handleQuote(thread.posts[0].author_username, thread.posts[0].content)}
                          className="text-xs text-gray-500 hover:text-emerald-600 flex items-center gap-1"
                          title="Quote"
                        >
                          <Quote className="h-3.5 w-3.5" />
                          Quote
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-2">
                    <MarkdownContent content={thread.posts[0].content} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Replies */}
          {thread.posts.length > 1 && (
            <div className="px-4 pt-4 pb-4 border-t border-gray-200">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                Replies ({thread.posts.length - 1})
              </h2>
              <div className="divide-y divide-gray-100 space-y-0">
                {thread.posts.slice(1).map((post) => (
                  <div key={post.id} className="py-4 first:pt-0">
                    <div className="flex items-start gap-4">
                      <Link
                        href={`/profile/${post.author_username}`}
                        className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-medium text-sm"
                      >
                        {post.author_username.charAt(0).toUpperCase()}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/profile/${post.author_username}`}
                            className="font-medium text-gray-900 hover:text-emerald-600 text-sm"
                          >
                            {post.author_username}
                          </Link>
                          <span className="text-sm text-gray-400">{formatDate(post.created_at)}</span>
                          <div className="flex items-center gap-2">
                            {isAuthenticated && (
                              <button
                                type="button"
                                onClick={() => handleQuote(post.author_username, post.content)}
                                className="text-xs text-gray-500 hover:text-emerald-600 flex items-center gap-1"
                                title="Quote"
                              >
                                <Quote className="h-3.5 w-3.5" />
                                Quote
                              </button>
                            )}
                            {isAuthenticated && user?.username === post.author_username && (
                              <button
                                type="button"
                                onClick={() => handleDeletePost(post.id)}
                                disabled={deletingId === post.id}
                                className="text-xs text-gray-500 hover:text-red-600 flex items-center gap-1"
                                title="Delete"
                              >
                                {deletingId === post.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="mt-2">
                          <MarkdownContent content={post.content} className="text-sm" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isAuthenticated && (
            <form ref={replyFormRef} onSubmit={handleReply} className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <label className="block text-sm font-medium text-gray-700 mb-2">Reply</label>
              <ForumEditor
                value={replyContent}
                onChange={setReplyContent}
                placeholder="Write a reply..."
                rows={3}
                maxLength={10000}
                disabled={submitting}
                strategies={myStrategies}
              />
              {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
              <button
                type="submit"
                disabled={submitting || !replyContent.trim()}
                className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium rounded-lg flex items-center gap-2"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                <MessageSquare className="h-4 w-4" />
                Post reply
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
