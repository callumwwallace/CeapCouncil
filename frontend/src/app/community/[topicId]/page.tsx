'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import type { ForumTopicResponse, ForumThreadSummary } from '@/types';
import { ArrowLeft, MessageSquare, Plus, Loader2 } from 'lucide-react';
import ForumEditor from '@/components/forum/ForumEditor';

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

  useEffect(() => {
    if (isAuthenticated) {
      api.getMyStrategies().then((s) => setMyStrategies(s.map((x) => ({ id: x.id, title: x.title })))).catch(() => {});
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!topicId) return;
    setLoading(true);
    setNotFound(false);
    Promise.all([api.listForumTopics(), api.listForumThreads(topicId)])
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
  }, [topicId]);

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topicId || !newTitle.trim() || !newBody.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createForumThread(topicId, newTitle.trim(), newBody.trim());
      setNewTitle('');
      setNewBody('');
      setShowNewThread(false);
      router.push(`/community/${topicId}/${created.id}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string | string[] } } })?.response?.data?.detail;
      setError(Array.isArray(msg) ? msg[0] : typeof msg === 'string' ? msg : 'Failed to create thread');
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
            <h1 className="text-2xl font-bold text-gray-900">{topic.name}</h1>
            {topic.description && <p className="text-gray-600 mt-1">{topic.description}</p>}
          </div>
          {isAuthenticated && (
            <button
              onClick={() => setShowNewThread(!showNewThread)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition"
            >
              <Plus className="h-4 w-4" />
              New thread
            </button>
          )}
        </div>

        {showNewThread && (
          <form onSubmit={handleCreateThread} className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">Create thread</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Thread title"
                  maxLength={200}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Message</label>
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
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting || !newTitle.trim() || !newBody.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium rounded-lg flex items-center gap-2"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Post
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewThread(false); setError(null); }}
                  className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
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
          </div>
          {threads.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p>No threads yet. Be the first to start a discussion!</p>
              {isAuthenticated && (
                <button
                  onClick={() => setShowNewThread(true)}
                  className="mt-4 text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  Create a thread
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {threads.map((t) => (
                <Link
                  key={t.id}
                  href={`/community/${topicId}/${t.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{t.title}</p>
                    <p className="text-sm text-gray-500">by {t.author_username}</p>
                  </div>
                  <div className="flex items-center gap-6 flex-shrink-0">
                    <span className="text-sm text-gray-500">{t.post_count} posts</span>
                    <span className="text-sm text-gray-400">{formatDate(t.updated_at)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
