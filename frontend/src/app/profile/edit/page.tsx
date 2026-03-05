'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import type { Badge } from '@/types';
import { ArrowLeft, Save, Loader2, Trophy } from 'lucide-react';

const BADGE_TIER_STYLES: Record<string, string> = {
  winner: 'bg-amber-100 text-amber-800 border-amber-200',
  top_10: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  top_25: 'bg-blue-100 text-blue-800 border-blue-200',
  participant: 'bg-gray-100 text-gray-700 border-gray-200',
};

export default function ProfileEditPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, fetchUser } = useAuthStore();
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [badges, setBadges] = useState<Badge[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchUser();
      api.getMyBadges().then(setBadges).catch(() => setBadges([]));
    }
  }, [isAuthenticated, fetchUser]);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name ?? '');
      setBio(user.bio ?? '');
      setAvatarUrl(user.avatar_url ?? '');
    }
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await api.updateCurrentUser({
        full_name: fullName || undefined,
        bio: bio || undefined,
        avatar_url: avatarUrl || undefined,
      });
      await fetchUser();
      setSuccess(true);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof msg === 'string' ? msg : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <Link
          href={user ? `/profile/${user.username}` : '/profile'}
          className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700 mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to profile
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Edit profile</h1>
        <p className="text-gray-600 mb-8">
          Customize how you appear to others in the community.
        </p>

        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-8">
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Avatar URL</label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-xl font-bold text-white overflow-hidden flex-shrink-0">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    user?.username?.charAt(0).toUpperCase() ?? '?'
                  )}
                </div>
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Display name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name (optional)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="A short bio..."
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-emerald-600">Profile saved.</p>}

            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save profile
            </button>
          </div>
        </section>

        {badges.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              <h2 className="font-semibold text-gray-900">Your badges</h2>
            </div>
            <div className="p-6 flex flex-wrap gap-2">
              {badges.map((b) => (
                <span
                  key={b.id}
                  className={`inline-flex px-3 py-1 rounded-full text-xs font-medium border ${
                    BADGE_TIER_STYLES[b.badge_tier] ?? BADGE_TIER_STYLES.participant
                  }`}
                >
                  {b.badge_tier.replace('_', ' ')} · {b.competition_title}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
