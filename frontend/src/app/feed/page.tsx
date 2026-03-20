'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import type { FeedItem } from '@/types';
import {
  Loader2,
  TrendingUp,
  Trophy,
  Rss,
  ArrowUpRight,
  Users,
  MessageSquare,
  FileText,
} from 'lucide-react';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function FeedPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadFeed = useCallback(async (skip = 0, append = false) => {
    if (skip === 0) setLoading(true);
    else setLoadingMore(true);
    try {
      const data = await api.getFeed(skip, 20);
      if (append) {
        setItems((prev) => [...prev, ...data]);
      } else {
        setItems(data);
      }
      setHasMore(data.length === 20);
    } catch {
      if (!append) setItems([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      loadFeed();
    } else if (!authLoading && !isAuthenticated) {
      setLoading(false);
    }
  }, [authLoading, isAuthenticated, loadFeed]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <p className="text-sm text-gray-400">Loading feed...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Rss className="h-8 w-8 text-gray-300" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Activity Feed</h1>
          <p className="text-gray-500 mb-6">Sign in and follow users to see their strategies and competition entries here.</p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Rss className="h-6 w-6 text-emerald-600" />
            Activity Feed
          </h1>
        </div>

        {items.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Users className="h-8 w-8 text-gray-300" />
            </div>
            <p className="text-lg text-gray-700 font-semibold">No activity yet</p>
            <p className="text-sm text-gray-400 mt-1">Follow users to see their strategies and competition entries here.</p>
            <Link
              href="/leaderboard"
              className="inline-block mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition"
            >
              Discover users
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={`${item.type}-${item.id}`}
                className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:border-emerald-200 transition"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    item.type === 'strategy'
                      ? 'bg-emerald-50 text-emerald-600'
                      : item.type === 'competition_entry'
                        ? 'bg-amber-50 text-amber-600'
                        : item.type === 'thread'
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-purple-50 text-purple-600'
                  }`}>
                    {item.type === 'strategy' ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : item.type === 'competition_entry' ? (
                      <Trophy className="h-4 w-4" />
                    ) : item.type === 'thread' ? (
                      <MessageSquare className="h-4 w-4" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <Link
                        href={`/profile/${item.username}`}
                        className="font-semibold text-gray-900 hover:text-emerald-600 transition"
                      >
                        {item.username}
                      </Link>
                      <span className="text-gray-400">
                        {item.type === 'strategy' ? 'shared a strategy'
                          : item.type === 'competition_entry' ? 'entered a competition'
                          : item.type === 'thread' ? 'started a thread'
                          : 'replied in a thread'}
                      </span>
                      <span className="text-gray-300 text-xs ml-auto shrink-0">{formatDate(item.created_at)}</span>
                    </div>
                    <Link href={item.link} className="group">
                      <p className="font-medium text-gray-800 mt-1 group-hover:text-emerald-600 transition flex items-center gap-1">
                        {item.title}
                        <ArrowUpRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-emerald-500 transition" />
                      </p>
                      {item.description && (
                        <p className="text-sm text-gray-500 mt-0.5">{item.description}</p>
                      )}
                    </Link>
                    {item.extra && (
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        {item.type === 'strategy' && (
                          <>
                            {(item.extra.vote_count as number) > 0 && (
                              <span>{item.extra.vote_count as number} votes</span>
                            )}
                            {(item.extra.fork_count as number) > 0 && (
                              <span>{item.extra.fork_count as number} forks</span>
                            )}
                          </>
                        )}
                        {item.type === 'competition_entry' && (
                          <>
                            {item.extra.rank != null && (
                              <span className="text-emerald-600 font-medium">Rank #{item.extra.rank as number}</span>
                            )}
                            {item.extra.total_return != null && (
                              <span className={(item.extra.total_return as number) >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                                {(item.extra.total_return as number) >= 0 ? '+' : ''}
                                {((item.extra.total_return as number) * 100).toFixed(1)}%
                              </span>
                            )}
                          </>
                        )}
                        {(item.type === 'thread' || item.type === 'post') &&
                          typeof item.extra?.topic_name === 'string' && (
                            <span className="text-gray-500">in {item.extra.topic_name}</span>
                          )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {hasMore && (
              <div className="text-center pt-4">
                <button
                  onClick={() => loadFeed(items.length, true)}
                  disabled={loadingMore}
                  className="px-5 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg transition border border-emerald-200"
                >
                  {loadingMore ? (
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  ) : null}
                  Load more
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
