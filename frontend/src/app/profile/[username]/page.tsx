'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import type { User, Badge, CompetitionHistoryEntry, ForumActivityItem, FollowStats, SkillEndorsement } from '@/types';
import {
  User as UserIcon,
  Trophy,
  Pencil,
  Calendar,
  Award,
  ThumbsUp,
  Plus,
  Minus,
  Loader2,
  TrendingUp,
  MessageSquare,
  FileText,
  Target,
  Activity,
  UserPlus,
  UserMinus,
  Users,
  Star,
  CheckCircle,
} from 'lucide-react';

const BADGE_TIER_STYLES: Record<string, string> = {
  winner: 'bg-amber-100 text-amber-800 border-amber-200',
  top_10: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  top_25: 'bg-blue-100 text-blue-800 border-blue-200',
  participant: 'bg-gray-100 text-gray-700 border-gray-200',
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

type Tab = 'competition-history' | 'achievements' | 'activity' | 'about';

export default function ProfileViewPage() {
  const params = useParams();
  const router = useRouter();
  const username = params?.username as string;
  const { user: currentUser, isAuthenticated } = useAuthStore();
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [competitionHistory, setCompetitionHistory] = useState<CompetitionHistoryEntry[]>([]);
  const [forumStats, setForumStats] = useState<{ thread_count: number; post_count: number } | null>(null);
  const [forumActivity, setForumActivity] = useState<ForumActivityItem[]>([]);
  const [strategyCount, setStrategyCount] = useState<number | null>(null);
  const [repScore, setRepScore] = useState<number>(0);
  const [yourVote, setYourVote] = useState<number | null>(null);
  const [repLoading, setRepLoading] = useState(false);
  const [repError, setRepError] = useState<string | null>(null);
  const [followStats, setFollowStats] = useState<FollowStats>({ follower_count: 0, following_count: 0, is_following: false });
  const [followLoading, setFollowLoading] = useState(false);
  const [endorsements, setEndorsements] = useState<SkillEndorsement[]>([]);
  const [endorseLoading, setEndorseLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('about');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const isOwnProfile = isAuthenticated && currentUser?.username === username;

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    setNotFound(false);
    const reqs = [
      api.getUserByUsername(username),
      api.getUserBadges(username),
      api.getUserCompetitionHistory(username),
      api.getUserForumStats(username).catch(() => ({ thread_count: 0, post_count: 0 })),
      api.getUserForumActivity(username).catch(() => []),
      api.getUserRep(username),
      api.getUserStrategyCount(username),
      api.getFollowStats(username).catch(() => ({ follower_count: 0, following_count: 0, is_following: false })),
      api.getUserEndorsements(username).catch(() => []),
    ];
    Promise.all(reqs)
      .then(([u, b, history, fStats, fActivity, rep, strat, fFollow, endorse]) => {
        setProfileUser(u);
        setBadges(b);
        setCompetitionHistory(history);
        setForumStats(fStats);
        setForumActivity(fActivity);
        setRepScore(rep.score);
        setYourVote(rep.your_vote);
        setStrategyCount(strat.count);
        setFollowStats(fFollow);
        setEndorsements(endorse);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [username]);

  const handleRep = async (value: 1 | -1) => {
    if (!username || repLoading) return;
    setRepLoading(true);
    setRepError(null);
    try {
      const res = await api.giveRep(username, value);
      setRepScore(res.score);
      setYourVote(res.your_vote);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string | string[] } } })?.response?.data?.detail;
      setRepError(Array.isArray(msg) ? msg[0] : (typeof msg === 'string' ? msg : 'Failed to update rep'));
    } finally {
      setRepLoading(false);
    }
  };

  const handleFollow = async () => {
    if (!username || followLoading) return;
    setFollowLoading(true);
    try {
      const res = followStats.is_following
        ? await api.unfollowUser(username)
        : await api.followUser(username);
      setFollowStats(res);
    } catch {
      // silently fail
    } finally {
      setFollowLoading(false);
    }
  };

  const handleEndorse = async (skill: string, currentlyEndorsed: boolean) => {
    if (!username || endorseLoading) return;
    setEndorseLoading(skill);
    try {
      const res = currentlyEndorsed
        ? await api.removeEndorsement(username, skill)
        : await api.endorseSkill(username, skill);
      setEndorsements((prev) =>
        prev.map((e) => (e.skill === skill ? { ...e, count: res.count, endorsed_by_you: res.endorsed_by_you } : e))
      );
    } catch {
      // silently fail
    } finally {
      setEndorseLoading(null);
    }
  };

  if (!username) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (notFound || !profileUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">User not found</p>
          <Link href="/" className="text-emerald-600 hover:underline">Go home</Link>
        </div>
      </div>
    );
  }

  const displayName = profileUser.full_name || profileUser.username;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Profile header - compact */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-5">
          <div className="p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-5">
              <div className="flex-shrink-0">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-lg sm:text-xl font-bold text-white overflow-hidden">
                  {profileUser.avatar_url ? (
                    <img
                      src={profileUser.avatar_url}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    profileUser.username.charAt(0).toUpperCase()
                  )}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-lg font-bold text-gray-900">{displayName}</h1>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                        Member
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">@{profileUser.username} · Joined {profileUser.created_at ? formatDate(profileUser.created_at) : '—'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isOwnProfile && (
                      <Link
                        href="/profile/edit"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Link>
                    )}
                    {!isOwnProfile && isAuthenticated && (
                      <button
                        onClick={handleFollow}
                        disabled={followLoading}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition ${
                          followStats.is_following
                            ? 'bg-gray-100 text-gray-700 hover:bg-red-50 hover:text-red-600 border border-gray-200'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      >
                        {followLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : followStats.is_following ? (
                          <UserMinus className="h-3.5 w-3.5" />
                        ) : (
                          <UserPlus className="h-3.5 w-3.5" />
                        )}
                        {followStats.is_following ? 'Unfollow' : 'Follow'}
                      </button>
                    )}
                    {!isOwnProfile && isAuthenticated && (
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleRep(1)}
                            disabled={repLoading}
                            title="Give +1 rep"
                            className={`p-2 rounded-lg transition ${
                              yourVote === 1
                                ? 'bg-emerald-200 text-emerald-800'
                                : 'bg-gray-100 text-gray-500 hover:bg-emerald-100 hover:text-emerald-600'
                            }`}
                          >
                            {repLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => handleRep(-1)}
                            disabled={repLoading}
                            title="Give -1 rep"
                            className={`p-2 rounded-lg transition ${
                              yourVote === -1
                                ? 'bg-red-200 text-red-800'
                                : 'bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-600'
                            }`}
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                        </div>
                        {repError && (
                          <p className="text-xs text-red-600 text-right max-w-[280px] sm:max-w-xs leading-tight">
                            {repError}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span className="flex items-center gap-1.5 text-gray-600">
                    <Users className="h-3.5 w-3.5 text-indigo-600" />
                    <strong className="text-gray-900">{followStats.follower_count}</strong> Followers
                  </span>
                  <span className="flex items-center gap-1.5 text-gray-600">
                    <UserPlus className="h-3.5 w-3.5 text-indigo-500" />
                    <strong className="text-gray-900">{followStats.following_count}</strong> Following
                  </span>
                  <span className="flex items-center gap-1.5 text-gray-600">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                    <strong className="text-gray-900">{strategyCount ?? 0}</strong> Strategies
                  </span>
                  <span className="flex items-center gap-1.5 text-gray-600">
                    <Award className="h-3.5 w-3.5 text-amber-600" />
                    <strong className="text-gray-900">{badges.length}</strong> Badges
                  </span>
                  <span className="flex items-center gap-1.5 text-gray-600">
                    <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
                    <strong className="text-gray-900">{forumStats?.thread_count ?? 0}</strong> Threads
                  </span>
                  <span className="flex items-center gap-1.5 text-gray-600">
                    <FileText className="h-3.5 w-3.5 text-purple-600" />
                    <strong className="text-gray-900">{forumStats?.post_count ?? 0}</strong> Posts
                  </span>
                  <span className={`flex items-center gap-1.5 ${repScore >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    <ThumbsUp className={`h-3.5 w-3.5 ${repScore >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
                    <strong>{repScore >= 0 ? '+' : ''}{repScore}</strong> Rep
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-4">
          <nav className="flex flex-wrap justify-center gap-6">
            <button
              onClick={() => setActiveTab('about')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'about'
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              About
            </button>
            <button
              onClick={() => setActiveTab('competition-history')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'competition-history'
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Competition history
            </button>
            <button
              onClick={() => setActiveTab('achievements')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'achievements'
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Achievements
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'activity'
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Latest activity
            </button>
          </nav>
        </div>

        {/* Tab content */}
        {activeTab === 'competition-history' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
              <Target className="h-5 w-5 text-emerald-500" />
              <h2 className="font-semibold text-gray-900">Competition history</h2>
            </div>
            <div className="p-6">
              {competitionHistory.length === 0 ? (
                <div className="text-center py-12">
                  <Target className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No competition entries yet.</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Enter competitions to see your history here.
                  </p>
                  <Link
                    href="/competitions"
                    className="inline-block mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition"
                  >
                    Browse competitions
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {competitionHistory.map((entry) => (
                    <Link
                      key={entry.id}
                      href={`/competitions/${entry.competition_id}`}
                      className="flex items-center justify-between gap-4 p-4 rounded-lg border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 truncate">{entry.competition_title}</p>
                        <p className="text-sm text-gray-500 truncate">{entry.strategy_title}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          Submitted {entry.submitted_at ? formatDate(entry.submitted_at) : '—'}
                          {entry.competition_status && (
                            <span className="ml-2 capitalize">· {entry.competition_status}</span>
                          )}
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        {entry.rank != null && (
                          <span className="text-sm font-semibold text-emerald-600">Rank #{entry.rank}</span>
                        )}
                        {entry.score != null && entry.rank == null && (
                          <span className="text-sm text-gray-600">Score {entry.score.toFixed(2)}</span>
                        )}
                        {entry.total_return != null && (
                          <p className={`text-xs font-medium ${entry.total_return >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {entry.total_return >= 0 ? '+' : ''}{(entry.total_return * 100).toFixed(1)}%
                          </p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'achievements' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              <h2 className="font-semibold text-gray-900">Achievements</h2>
            </div>
            <div className="p-6">
              {badges.length === 0 ? (
                <div className="text-center py-12">
                  <Award className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No achievements yet.</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Enter competitions to earn badges.
                  </p>
                  <Link
                    href="/competitions"
                    className="inline-block mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition"
                  >
                    Browse competitions
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {badges.map((b) => (
                    <div
                      key={b.id}
                      className={`flex items-center gap-4 p-4 rounded-lg border ${
                        BADGE_TIER_STYLES[b.badge_tier] ?? BADGE_TIER_STYLES.participant
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-white/80 flex items-center justify-center">
                        <Trophy className="h-5 w-5 text-amber-600" />
                      </div>
                      <div>
                        <p className="font-medium capitalize">
                          {b.badge_tier.replace('_', ' ')}
                        </p>
                        <p className="text-sm opacity-90">{b.competition_title}</p>
                        {b.earned_at && (
                          <p className="text-xs opacity-75 mt-1">
                            Earned {formatDate(b.earned_at)}
                          </p>
                        )}
                      </div>
                      {b.rank != null && (
                        <span className="ml-auto text-sm font-medium">Rank #{b.rank}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-500" />
              <h2 className="font-semibold text-gray-900">Latest activity</h2>
            </div>
            <div className="p-6">
              {forumActivity.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No activity yet.</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Threads and posts will appear here.
                  </p>
                  <Link href="/community" className="inline-block mt-4 text-emerald-600 hover:text-emerald-700">
                    Visit Community
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {forumActivity.map((item) => (
                    <Link
                      key={`${item.type}-${item.id}`}
                      href={
                        item.type === 'thread' && item.topic_slug
                          ? `/community/${item.topic_slug}/${item.id}`
                          : item.type === 'post' && item.topic_slug && item.thread_id
                            ? `/community/${item.topic_slug}/${item.thread_id}`
                            : '/community'
                      }
                      className="block p-4 rounded-lg border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition"
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600 capitalize">
                          {item.type}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900">
                            {item.type === 'thread' ? item.title : item.thread_title}
                          </p>
                          {item.type === 'post' && item.content_preview && (
                            <p className="text-sm text-gray-500 truncate mt-0.5">{item.content_preview}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            {item.created_at ? formatDate(item.created_at) : ''}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'about' && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
                <UserIcon className="h-5 w-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900">About</h2>
              </div>
              <div className="p-6">
                {profileUser.bio ? (
                  <p className="text-gray-700 whitespace-pre-wrap">{profileUser.bio}</p>
                ) : (
                  <p className="text-gray-500">No bio yet.</p>
                )}
              </div>
            </div>

            {/* Skill Endorsements */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
                <Star className="h-5 w-5 text-amber-500" />
                <h2 className="font-semibold text-gray-900">Skill Endorsements</h2>
              </div>
              <div className="p-6">
                {endorsements.length === 0 ? (
                  <p className="text-gray-500 text-sm">No endorsements yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {endorsements.map((e) => {
                      const hasEndorsements = e.count > 0;
                      const canEndorse = isAuthenticated && !isOwnProfile;
                      return (
                        <button
                          key={e.skill}
                          onClick={() => canEndorse && handleEndorse(e.skill, e.endorsed_by_you)}
                          disabled={!canEndorse || endorseLoading === e.skill}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                            e.endorsed_by_you
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                              : hasEndorsements
                                ? 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                                : 'bg-white border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-500'
                          } ${!canEndorse ? 'cursor-default' : 'cursor-pointer'}`}
                          title={canEndorse ? (e.endorsed_by_you ? `Remove endorsement for ${e.label}` : `Endorse ${e.label}`) : ''}
                        >
                          {endorseLoading === e.skill ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : e.endorsed_by_you ? (
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Plus className="h-3 w-3" />
                          )}
                          {e.label}
                          {e.count > 0 && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                              e.endorsed_by_you ? 'bg-emerald-200 text-emerald-800' : 'bg-gray-200 text-gray-600'
                            }`}>
                              {e.count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
