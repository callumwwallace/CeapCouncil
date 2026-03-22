'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  MessageSquare,
  Users,
  BookOpen,
  Trophy,
  HelpCircle,
  Megaphone,
  FileCode,
  MessageCircle,
  Sparkles,
  BarChart3,
  Lightbulb,
  GraduationCap,
  FlaskConical,
  Bug,
  Zap,
  Loader2,
  Search,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import api from '@/lib/api';
import type { ForumTopicResponse, ForumSearchResult } from '@/types';
import GroupEmbedCard from '@/components/forum/GroupEmbedCard';

const SECTION_CONFIG: Record<string, { title: string; icon: React.ReactNode }> = {
  official: { title: 'Official', icon: <Megaphone className="h-5 w-5 text-emerald-600" /> },
  community: { title: 'Community', icon: <MessageSquare className="h-5 w-5 text-gray-600" /> },
  competitions: { title: 'Competitions', icon: <Trophy className="h-5 w-5 text-amber-500" /> },
  education: { title: 'Education & Learning', icon: <GraduationCap className="h-5 w-5 text-teal-600" /> },
  support: { title: 'Support', icon: <Bug className="h-5 w-5 text-red-500" /> },
};

const TOPIC_ICONS: Record<string, React.ReactNode> = {
  news: <Megaphone className="h-5 w-5 text-emerald-600" />,
  'api-docs': <FileCode className="h-5 w-5 text-emerald-600" />,
  feedback: <MessageCircle className="h-5 w-5 text-emerald-600" />,
  general: <MessageSquare className="h-5 w-5 text-gray-600" />,
  showcase: <Sparkles className="h-5 w-5 text-gray-600" />,
  'dev-help': <HelpCircle className="h-5 w-5 text-gray-600" />,
  backtesting: <BarChart3 className="h-5 w-5 text-gray-600" />,
  current: <Trophy className="h-5 w-5 text-amber-500" />,
  archives: <BookOpen className="h-5 w-5 text-amber-500" />,
  'competition-ideas': <Lightbulb className="h-5 w-5 text-amber-500" />,
  fundamentals: <GraduationCap className="h-5 w-5 text-teal-600" />,
  advanced: <FlaskConical className="h-5 w-5 text-teal-600" />,
  bugs: <Bug className="h-5 w-5 text-red-500" />,
  features: <Zap className="h-5 w-5 text-amber-500" />,
};

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatLatestDate(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return 'Today';
    if (diff < 172800000) return 'Yesterday';
    if (diff < 604800000) return d.toLocaleDateString('en-US', { weekday: 'short' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

const SECTION_OPTIONS = [
  { id: 'official', label: 'Official' },
  { id: 'community', label: 'Community' },
  { id: 'competitions', label: 'Competitions' },
  { id: 'education', label: 'Education & Learning' },
  { id: 'support', label: 'Support' },
];

export default function CommunityPage() {
  const searchParams = useSearchParams();
  const groupToken = searchParams.get('group');
  const [topics, setTopics] = useState<ForumTopicResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ForumSearchResult[] | null>(null);
  const [searchForm, setSearchForm] = useState({
    q: '',
    sections: [] as string[],
    date_from: '',
    date_to: '',
    posted_by: '',
  });

  const handleSearch = async () => {
    setSearching(true);
    setSearchResults(null);
    try {
      const results = await api.searchForumThreads({
        q: searchForm.q.trim() || undefined,
        sections: searchForm.sections.length ? searchForm.sections : undefined,
        date_from: searchForm.date_from || undefined,
        date_to: searchForm.date_to || undefined,
        posted_by: searchForm.posted_by.trim() || undefined,
      });
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const toggleSection = (id: string) => {
    setSearchForm((f) => ({
      ...f,
      sections: f.sections.includes(id) ? f.sections.filter((s) => s !== id) : [...f.sections, id],
    }));
  };

  useEffect(() => {
    api
      .listForumTopics()
      .then(setTopics)
      .catch(() => setTopics([]))
      .finally(() => setLoading(false));
  }, []);

  const sections = ['official', 'community', 'competitions', 'education', 'support'] as const;
  const topicsBySection = sections.map((sectionId) => {
    const config = SECTION_CONFIG[sectionId] ?? { title: sectionId, icon: <MessageSquare className="h-5 w-5" /> };
    const sectionTopics = topics.filter((t) => t.section === sectionId);
    return { id: sectionId, ...config, topics: sectionTopics };
  }).filter((s) => s.topics.length > 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Users className="h-8 w-8 text-emerald-600" />
            Community
          </h1>
          <p className="mt-2 text-gray-600">
            Discuss strategies, share ideas, get help, and connect with other Ceap Council traders.
          </p>
        </div>

        {groupToken && (
          <div className="mb-8">
            <GroupEmbedCard shareToken={groupToken} title="Shared group" />
          </div>
        )}

        {/* Advanced search */}
        <div className="mb-8 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setSearchExpanded(!searchExpanded)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <span className="font-semibold text-gray-900 flex items-center gap-2">
              <Search className="h-5 w-5 text-emerald-600" />
              Advanced search
            </span>
            {searchExpanded ? <ChevronUp className="h-5 w-5 text-gray-500" /> : <ChevronDown className="h-5 w-5 text-gray-500" />}
          </button>
          {searchExpanded && (
            <div className="px-6 pb-6 pt-0 border-t border-gray-100">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Keywords</label>
                  <input
                    type="text"
                    value={searchForm.q}
                    onChange={(e) => setSearchForm((f) => ({ ...f, q: e.target.value }))}
                    placeholder="Search in titles and posts..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Posted by</label>
                  <input
                    type="text"
                    value={searchForm.posted_by}
                    onChange={(e) => setSearchForm((f) => ({ ...f, posted_by: e.target.value }))}
                    placeholder="Username"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date from</label>
                  <input
                    type="date"
                    value={searchForm.date_from}
                    onChange={(e) => setSearchForm((f) => ({ ...f, date_from: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date to</label>
                  <input
                    type="date"
                    value={searchForm.date_to}
                    onChange={(e) => setSearchForm((f) => ({ ...f, date_to: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Sections</label>
                <div className="flex flex-wrap gap-3">
                  {SECTION_OPTIONS.map((s) => (
                    <label key={s.id} className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={searchForm.sections.includes(s.id)}
                        onChange={() => toggleSection(s.id)}
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm text-gray-700">{s.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleSearch}
                  disabled={searching}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium rounded-lg flex items-center gap-2"
                >
                  {searching && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Search className="h-4 w-4" />
                  Search
                </button>
                <button
                  onClick={() => {
                    setSearchForm({ q: '', sections: [], date_from: '', date_to: '', posted_by: '' });
                    setSearchResults(null);
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Search results */}
        {searchResults !== null && (
          <div className="mb-8 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <span className="font-medium text-gray-900">Search results ({searchResults.length})</span>
              <button onClick={() => setSearchResults(null)} className="text-sm text-emerald-600 hover:text-emerald-700">
                Show all topics
              </button>
            </div>
            {searchResults.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <Search className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p>No threads match your search.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {searchResults.map((r) => (
                  <Link
                    key={r.id}
                    href={`/community/${r.topic_slug}/${r.id}`}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{r.title}</p>
                      <p className="text-sm text-gray-500">
                        {r.topic_name} · by {r.author_username}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 capitalize">{r.section}</span>
                      <span className="text-sm text-gray-500">{r.post_count} posts</span>
                      <span className="text-sm text-gray-400">{formatLatestDate(r.updated_at)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {searchResults === null && (
        <div className="space-y-8">
          {topicsBySection.map((section) => (
            <section key={section.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <h2 className="px-6 py-4 text-lg font-bold text-gray-900 border-b border-gray-200 bg-gray-50">
                {section.title}
              </h2>
              <div className="divide-y divide-gray-100">
                {section.topics.map((topic) => (
                  <div
                    key={topic.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <Link
                      href={`/community/${topic.slug}`}
                      className="flex items-start gap-4 flex-1 min-w-0"
                    >
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                        {TOPIC_ICONS[topic.slug] ?? <MessageSquare className="h-5 w-5 text-gray-600" />}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900">{topic.name}</h3>
                        {topic.description && (
                          <p className="text-sm text-gray-500 mt-0.5">{topic.description}</p>
                        )}
                      </div>
                    </Link>

                    <div className="flex sm:items-center gap-6 sm:gap-8">
                      <div className="flex gap-6 text-sm text-gray-500 flex-shrink-0">
                        <span>{formatCount(topic.thread_count)} Threads</span>
                        <span>{formatCount(topic.post_count)} Messages</span>
                      </div>

                      {topic.latest_thread && (
                        <Link
                          href={`/community/${topic.slug}/${topic.latest_thread.id}`}
                          className="flex items-center gap-3 min-w-0 sm:max-w-[220px] hover:opacity-80"
                        >
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                            <span className="text-sm font-medium text-emerald-700">
                              {topic.latest_thread.author_username.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{topic.latest_thread.title}</p>
                            <p className="text-xs text-gray-500">
                              {formatLatestDate(topic.latest_thread.updated_at)} · {topic.latest_thread.author_username}
                            </p>
                          </div>
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        )}

        {searchResults === null && topicsBySection.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
            <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p>No forum topics available.</p>
          </div>
        )}
      </div>
    </div>
  );
}
