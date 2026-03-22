'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import type { Badge } from '@/types';
import { ArrowLeft, Camera, Save, Loader2, Trophy, X } from 'lucide-react';
import { safeProfilePath } from '@/lib/safePaths';

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
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarError(null);

    // Client-side validation
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setAvatarError('Only JPEG, PNG, or WebP images are allowed.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError('Image must be 2 MB or smaller.');
      return;
    }

    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleAvatarUpload = async () => {
    if (!avatarFile) return;
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const updated = await api.uploadAvatar(avatarFile);
      setAvatarUrl(updated.avatar_url ?? '');
      setAvatarPreview(null);
      setAvatarFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchUser();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setAvatarError(typeof msg === 'string' ? msg : 'Upload failed. Please try again.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleCancelAvatarSelect = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await api.updateCurrentUser({
        full_name: fullName || undefined,
        bio: bio || undefined,
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
          href={user ? safeProfilePath(user.username) : '/profile'}
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
            {/* Avatar upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Profile photo</label>
              <div className="flex items-start gap-5">
                {/* Avatar preview */}
                <div className="relative flex-shrink-0">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-2xl font-bold text-white overflow-hidden ring-2 ring-white shadow-sm">
                    {(avatarPreview || avatarUrl) ? (
                      <img
                        src={avatarPreview ?? avatarUrl}
                        alt="Avatar preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      user?.username?.charAt(0).toUpperCase() ?? '?'
                    )}
                  </div>
                </div>

                {/* Controls */}
                <div className="flex-1 space-y-3">
                  {!avatarFile ? (
                    <>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                      >
                        <Camera className="h-4 w-4" />
                        {avatarUrl ? 'Change photo' : 'Upload photo'}
                      </button>
                      <p className="text-xs text-gray-400">JPEG, PNG or WebP · max 2 MB</p>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-gray-600 truncate max-w-xs">{avatarFile.name}</p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleAvatarUpload}
                          disabled={avatarUploading}
                          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 transition"
                        >
                          {avatarUploading ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
                          ) : (
                            'Save photo'
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelAvatarSelect}
                          disabled={avatarUploading}
                          className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition"
                          title="Cancel"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {avatarError && (
                    <p className="text-sm text-red-600">{avatarError}</p>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleAvatarFileChange}
                  />
                </div>
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
