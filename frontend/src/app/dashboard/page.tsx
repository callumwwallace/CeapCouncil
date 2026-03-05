'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import { Mail, User, Shield, ChevronRight, Loader2, Bell } from 'lucide-react';

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  } catch {
    return '';
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, fetchUser } = useAuthStore();
  const [emailForm, setEmailForm] = useState({ newEmail: '', currentPassword: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [emailLoading, setEmailLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [notifyOnMention, setNotifyOnMention] = useState(true);
  const [emailOnMention, setEmailOnMention] = useState(false);
  const [emailMarketing, setEmailMarketing] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);

  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchUser();
    }
  }, [isAuthenticated, fetchUser]);

  useEffect(() => {
    if (user) {
      setNotifyOnMention(user.notify_on_mention ?? true);
      setEmailOnMention(user.email_on_mention ?? false);
      setEmailMarketing(user.email_marketing ?? false);
    }
  }, [user]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <h1 className="text-xl font-bold text-gray-900 mb-5">Account Management</h1>

        <div className="grid lg:grid-cols-2 gap-5 items-start">
          {/* Left: Account details + My Profile */}
          <div className="flex flex-col gap-5 min-h-0">
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Account details</h2>
              </div>
              <div className="p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">Email</p>
                    <p className="text-gray-900 truncate">{user?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">Username</p>
                    <p className="text-gray-900">{user?.username}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-400">Member since {user?.created_at ? formatDate(user.created_at) : '—'}</p>
              </div>
            </section>

            <Link
              href={user?.username ? `/profile/${user.username}` : '/profile'}
              className="flex flex-1 items-center justify-between bg-white rounded-xl border border-gray-200 p-4 hover:border-emerald-200 hover:shadow-md transition min-h-0"
            >
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900">My Profile</h3>
                <p className="text-sm text-gray-600 mt-0.5 truncate">Avatar, bio, display name</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0 ml-3" />
            </Link>

            {/* Notifications */}
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-2">
                <Bell className="h-5 w-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900">Notifications</h2>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-sm text-gray-600">Choose what notifications you receive and whether to get email copies.</p>
                <div className="max-h-52 overflow-y-auto pr-1 space-y-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyOnMention}
                      onChange={(e) => setNotifyOnMention(e.target.checked)}
                      className="mt-1 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">In-app: When someone tags you in a post</p>
                      <p className="text-xs text-gray-500">Show a notification when you're @mentioned in the community</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={emailOnMention}
                      onChange={(e) => setEmailOnMention(e.target.checked)}
                      className="mt-1 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Email: Also email me when I'm tagged</p>
                      <p className="text-xs text-gray-500">Receive an email in addition to the in-app notification</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={emailMarketing}
                      onChange={(e) => setEmailMarketing(e.target.checked)}
                      className="mt-1 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Ceap Council brand emails</p>
                      <p className="text-xs text-gray-500">News, updates, and product announcements from Ceap Council</p>
                    </div>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    setNotifSaving(true);
                    try {
                      await api.updateNotificationPreferences({
                        notify_on_mention: notifyOnMention,
                        email_on_mention: emailOnMention,
                        email_marketing: emailMarketing,
                      });
                      await fetchUser();
                    } finally {
                      setNotifSaving(false);
                    }
                  }}
                  disabled={notifSaving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition flex items-center gap-2"
                >
                  {notifSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save preferences
                </button>
              </div>
            </section>
          </div>

          {/* Right: Security */}
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-2">
              <Shield className="h-5 w-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900">Security</h2>
            </div>
            <div className="p-5 grid md:grid-cols-2 gap-6">
              {/* Change email */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">Change email</h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setEmailError(null);
                  setEmailSuccess(false);
                  if (!emailForm.newEmail || !emailForm.currentPassword) {
                    setEmailError('Please fill in all fields');
                    return;
                  }
                  setEmailLoading(true);
                  try {
                    await api.changeEmail(emailForm.newEmail, emailForm.currentPassword);
                    await fetchUser();
                    setEmailSuccess(true);
                    setEmailForm({ newEmail: '', currentPassword: '' });
                  } catch (err: unknown) {
                    const msg = (err as { response?: { data?: { detail?: string | string[] } } })?.response?.data?.detail;
                    setEmailError(Array.isArray(msg) ? msg[0] : typeof msg === 'string' ? msg : 'Failed to change email');
                  } finally {
                    setEmailLoading(false);
                  }
                }}
                className="space-y-2"
              >
                <div>
                  <label className="block text-xs text-gray-600 mb-0.5">New email</label>
                  <input
                    type="email"
                    value={emailForm.newEmail}
                    onChange={(e) => setEmailForm((f) => ({ ...f, newEmail: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-0.5">Current password</label>
                  <input
                    type="password"
                    value={emailForm.currentPassword}
                    onChange={(e) => setEmailForm((f) => ({ ...f, currentPassword: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Current password"
                    autoComplete="current-password"
                  />
                </div>
                {emailError && <p className="text-xs text-red-600">{emailError}</p>}
                {emailSuccess && <p className="text-xs text-emerald-600">Email updated.</p>}
                <button
                  type="submit"
                  disabled={emailLoading}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition flex items-center gap-1.5"
                >
                  {emailLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Update email
                </button>
              </form>
              </div>

              {/* Change password */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">Change password</h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setPasswordError(null);
                  setPasswordSuccess(false);
                  if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
                    setPasswordError('Please fill in all fields');
                    return;
                  }
                  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
                    setPasswordError('New passwords do not match');
                    return;
                  }
                  if (passwordForm.newPassword.length < 8) {
                    setPasswordError('Password must be at least 8 characters');
                    return;
                  }
                  setPasswordLoading(true);
                  try {
                    await api.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
                    setPasswordSuccess(true);
                    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                  } catch (err: unknown) {
                    const msg = (err as { response?: { data?: { detail?: string | string[] } } })?.response?.data?.detail;
                    setPasswordError(Array.isArray(msg) ? msg[0] : typeof msg === 'string' ? msg : 'Failed to change password');
                  } finally {
                    setPasswordLoading(false);
                  }
                }}
                className="space-y-2"
              >
                <div>
                  <label className="block text-xs text-gray-600 mb-0.5">Current password</label>
                  <input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm((f) => ({ ...f, currentPassword: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Current password"
                    autoComplete="current-password"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-0.5">New password</label>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="8+ chars, upper, lower, number"
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-0.5">Confirm</label>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Confirm new password"
                    autoComplete="new-password"
                  />
                </div>
                {passwordError && <p className="text-xs text-red-600">{passwordError}</p>}
                {passwordSuccess && <p className="text-xs text-emerald-600">Password updated.</p>}
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition flex items-center gap-1.5"
                >
                  {passwordLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Update password
                </button>
              </form>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
