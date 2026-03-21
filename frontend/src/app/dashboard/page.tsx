'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import {
  Mail, User, Shield, Loader2, Bell, AlertCircle,
  CheckCircle2, ExternalLink, KeyRound, Calendar, Trash2,
} from 'lucide-react';
import { PasswordStrengthMeter } from '@/components/auth/PasswordStrengthMeter';
import { QRCodeSVG } from 'qrcode.react';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  } catch {
    return '';
  }
}

type Tab = 'account' | 'security' | 'notifications';

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-emerald-500' : 'bg-gray-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, fetchUser, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('account');

  // Email form
  const [emailForm, setEmailForm] = useState({ newEmail: '', currentPassword: '' });
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);

  // Password form
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Notifications
  const [notifyOnMention, setNotifyOnMention] = useState(true);
  const [emailOnMention, setEmailOnMention] = useState(false);
  const [emailMarketing, setEmailMarketing] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSuccess, setNotifSuccess] = useState(false);

  // TOTP
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpLoading, setTotpLoading] = useState(true);
  const [totpPhase, setTotpPhase] = useState<'idle' | 'qr' | 'confirm' | 'done'>('idle');
  const [totpQrUri, setTotpQrUri] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpConfirmCode, setTotpConfirmCode] = useState('');
  const [totpRecoveryCodes, setTotpRecoveryCodes] = useState<string[]>([]);
  const [totpDisablePassword, setTotpDisablePassword] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [totpDisableCode, setTotpDisableCode] = useState('');
  const [totpError, setTotpError] = useState('');
  const [totpActionLoading, setTotpActionLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated && !isLoading) router.push('/login');
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchUser();
      api.totpStatus()
        .then((r) => setTotpEnabled(r.totp_enabled))
        .catch(() => setTotpEnabled(false))
        .finally(() => setTotpLoading(false));
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
        <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
      </div>
    );
  }

  const initials = (user?.username ?? 'U').slice(0, 2).toUpperCase();

  const navItems: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'account', label: 'Account', icon: <User className="h-4 w-4" /> },
    { id: 'security', label: 'Security', icon: <Shield className="h-4 w-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50">


      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex gap-6 items-start">

          {/* sidebar */}
          <nav className="w-48 flex-shrink-0 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {navItems.map((item, i) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition text-left ${
                  i < navItems.length - 1 ? 'border-b border-gray-100' : ''
                } ${
                  activeTab === item.id
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span className={activeTab === item.id ? 'text-emerald-600' : 'text-gray-400'}>
                  {item.icon}
                </span>
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex-1 min-w-0 space-y-5">

            {/* account */}
            {activeTab === 'account' && (
              <>
                <SectionCard title="Account details">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-3 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <Mail className="h-4 w-4 text-gray-500" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Email</p>
                          <p className="text-gray-900 font-medium">{user?.email}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-3 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <User className="h-4 w-4 text-gray-500" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Username</p>
                          <p className="text-gray-900 font-medium">{user?.username}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <Calendar className="h-4 w-4 text-gray-500" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Member since</p>
                          <p className="text-gray-900 font-medium">{user?.created_at ? formatDate(user.created_at) : '—'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </SectionCard>

                <Link
                  href={user?.username ? `/profile/${user.username}` : '/profile'}
                  className="flex items-center justify-between bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-4 hover:border-emerald-300 hover:shadow-md transition group"
                >
                  <div>
                    <h3 className="font-semibold text-gray-900 group-hover:text-emerald-700 transition">Public profile</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Edit your avatar, bio, and display name</p>
                  </div>
                  <ExternalLink className="h-5 w-5 text-gray-400 group-hover:text-emerald-500 transition flex-shrink-0" />
                </Link>
              </>
            )}

            {/* security */}
            {activeTab === 'security' && (
              <>
                <div className="grid md:grid-cols-2 gap-5">
                  {/* email */}
                  <SectionCard title="Change email">
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
                      className="space-y-3"
                    >
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">New email</label>
                        <input
                          type="email"
                          value={emailForm.newEmail}
                          onChange={(e) => setEmailForm((f) => ({ ...f, newEmail: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                          placeholder="you@example.com"
                          autoComplete="email"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Current password</label>
                        <input
                          type="password"
                          value={emailForm.currentPassword}
                          onChange={(e) => setEmailForm((f) => ({ ...f, currentPassword: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                          placeholder="••••••••"
                          autoComplete="current-password"
                        />
                      </div>
                      {emailError && (
                        <div className="flex items-center gap-2 text-red-600 text-xs">
                          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                          {emailError}
                        </div>
                      )}
                      {emailSuccess && (
                        <div className="flex items-center gap-2 text-emerald-600 text-xs">
                          <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                          Email updated successfully.
                        </div>
                      )}
                      <button
                        type="submit"
                        disabled={emailLoading}
                        className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition flex items-center justify-center gap-2"
                      >
                        {emailLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                        Update email
                      </button>
                    </form>
                  </SectionCard>

                  {/* password */}
                  <SectionCard title="Change password">
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
                      className="space-y-3"
                    >
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Current password</label>
                        <input
                          type="password"
                          value={passwordForm.currentPassword}
                          onChange={(e) => setPasswordForm((f) => ({ ...f, currentPassword: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                          placeholder="••••••••"
                          autoComplete="current-password"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">New password</label>
                        <input
                          type="password"
                          value={passwordForm.newPassword}
                          onChange={(e) => setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                          placeholder="Use a strong password"
                          autoComplete="new-password"
                        />
                        <PasswordStrengthMeter password={passwordForm.newPassword} className="mt-1" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Confirm new password</label>
                        <input
                          type="password"
                          value={passwordForm.confirmPassword}
                          onChange={(e) => setPasswordForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                          placeholder="••••••••"
                          autoComplete="new-password"
                        />
                      </div>
                      {passwordError && (
                        <div className="flex items-center gap-2 text-red-600 text-xs">
                          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                          {passwordError}
                        </div>
                      )}
                      {passwordSuccess && (
                        <div className="flex items-center gap-2 text-emerald-600 text-xs">
                          <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                          Password updated successfully.
                        </div>
                      )}
                      <button
                        type="submit"
                        disabled={passwordLoading}
                        className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition flex items-center justify-center gap-2"
                      >
                        {passwordLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                        Update password
                      </button>
                    </form>
                  </SectionCard>
                </div>

                {/* 2fa */}
                <SectionCard title="Two-factor authentication">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <KeyRound className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-medium text-gray-900">Authenticator app</h3>
                        {!totpLoading && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            totpEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {totpEnabled ? <><CheckCircle2 className="h-3 w-3" /> Enabled</> : 'Not enabled'}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mb-4">Protect your account with a time-based one-time password.</p>

                      {totpError && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
                          <AlertCircle className="h-4 w-4 flex-shrink-0" />
                          {totpError}
                        </div>
                      )}

                      {totpLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                      ) : totpPhase === 'done' ? (
                        <div>
                          <div className="flex items-center gap-2 text-emerald-600 mb-3">
                            <CheckCircle2 className="h-5 w-5" />
                            <span className="font-medium">2FA enabled successfully</span>
                          </div>
                          <p className="text-sm text-gray-600 mb-3">Save these recovery codes in a secure place. You won&apos;t be able to see them again.</p>
                          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 font-mono text-sm grid grid-cols-2 gap-1 mb-3">
                            {totpRecoveryCodes.map((c, i) => (
                              <div key={i} className="text-gray-700">{c}</div>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => { setTotpPhase('idle'); setTotpRecoveryCodes([]); }}
                            className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
                          >
                            I&apos;ve saved these codes →
                          </button>
                        </div>
                      ) : totpPhase === 'qr' ? (
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            setTotpError('');
                            setTotpActionLoading(true);
                            try {
                              const r = await api.totpConfirm(totpConfirmCode);
                              setTotpRecoveryCodes(r.recovery_codes);
                              setTotpEnabled(true);
                              setTotpPhase('done');
                            } catch {
                              setTotpError('Invalid code. Please try again.');
                            } finally {
                              setTotpActionLoading(false);
                            }
                          }}
                          className="space-y-4 max-w-xs"
                        >
                          <p className="text-sm text-gray-600">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)</p>
                          <div className="flex justify-center p-4 bg-white rounded-lg border border-gray-200 w-fit">
                            <QRCodeSVG value={totpQrUri} size={160} level="M" />
                          </div>
                          <p className="text-xs text-gray-500">
                            Can&apos;t scan? Enter manually: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">{totpSecret}</code>
                          </p>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Enter the 6-digit code to confirm</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={6}
                              value={totpConfirmCode}
                              onChange={(e) => setTotpConfirmCode(e.target.value.replace(/\D/g, ''))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-lg tracking-widest text-center focus:ring-2 focus:ring-emerald-500 outline-none"
                              placeholder="000000"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={totpActionLoading || totpConfirmCode.length !== 6}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition flex items-center gap-2"
                          >
                            {totpActionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                            Verify &amp; enable 2FA
                          </button>
                        </form>
                      ) : totpEnabled ? (
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            setTotpError('');
                            setTotpActionLoading(true);
                            try {
                              await api.totpDisable(totpDisablePassword, totpDisableCode);
                              setTotpEnabled(false);
                              setTotpDisablePassword('');
                              setTotpDisableCode('');
                            } catch {
                              setTotpError('Invalid password or code.');
                            } finally {
                              setTotpActionLoading(false);
                            }
                          }}
                          className="space-y-3 max-w-xs"
                        >
                          <p className="text-sm text-gray-600">Enter your password and authenticator code to disable 2FA.</p>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
                            <input
                              type="password"
                              value={totpDisablePassword}
                              onChange={(e) => setTotpDisablePassword(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-400 outline-none"
                              placeholder="Your password"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">6-digit code</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={6}
                              value={totpDisableCode}
                              onChange={(e) => setTotpDisableCode(e.target.value.replace(/\D/g, ''))}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono tracking-widest text-center focus:ring-2 focus:ring-red-400 outline-none"
                              placeholder="000000"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={totpActionLoading || !totpDisablePassword || totpDisableCode.length !== 6}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition flex items-center gap-2"
                          >
                            {totpActionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                            Disable 2FA
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={async () => {
                            setTotpError('');
                            setTotpActionLoading(true);
                            try {
                              const r = await api.totpSetup();
                              setTotpQrUri(r.qr_uri);
                              setTotpSecret(r.secret);
                              setTotpPhase('qr');
                            } catch {
                              setTotpError('Failed to start 2FA setup. Please try again.');
                            } finally {
                              setTotpActionLoading(false);
                            }
                          }}
                          disabled={totpActionLoading}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition flex items-center gap-2"
                        >
                          {totpActionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                          Set up 2FA
                        </button>
                      )}
                    </div>
                  </div>
                </SectionCard>

                {/* delete account */}
                <SectionCard title="Delete account">
                  <p className="text-sm text-gray-500 mb-4">
                    Permanently delete your account and all associated data. This action cannot be undone.
                  </p>
                  {deleteError && (
                    <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      {deleteError}
                    </div>
                  )}
                  {!deleteConfirmOpen ? (
                    <button
                      onClick={() => setDeleteConfirmOpen(true)}
                      className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition"
                    >
                      Delete my account
                    </button>
                  ) : (
                    <div className="border border-red-200 rounded-lg p-4 bg-red-50 space-y-3">
                      <p className="text-sm font-medium text-red-700">Are you sure? This will permanently delete your account, strategies, backtests, and all your data.</p>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={async () => {
                            setDeleteLoading(true);
                            setDeleteError(null);
                            try {
                              await api.deleteAccount();
                              logout();
                              router.push('/');
                            } catch {
                              setDeleteError('Failed to delete account. Please try again.');
                              setDeleteLoading(false);
                            }
                          }}
                          disabled={deleteLoading}
                          className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition disabled:opacity-50"
                        >
                          {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Yes, delete permanently'}
                        </button>
                        <button
                          onClick={() => { setDeleteConfirmOpen(false); setDeleteError(null); }}
                          className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </SectionCard>
              </>
            )}

            {/* notifications */}
            {activeTab === 'notifications' && (
              <SectionCard title="Notification preferences">
                <div className="space-y-6">
                  <p className="text-sm text-gray-500">Choose how and when you want to be notified.</p>

                  <div className="space-y-1">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">In-app</h3>
                    <div className="flex items-start justify-between py-4 border-b border-gray-100">
                      <div className="pr-8">
                        <p className="text-sm font-medium text-gray-900">Mentions</p>
                        <p className="text-xs text-gray-500 mt-0.5">Show a notification when someone @mentions you in the community</p>
                      </div>
                      <Toggle checked={notifyOnMention} onChange={setNotifyOnMention} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Email</h3>
                    <div className="flex items-start justify-between py-4 border-b border-gray-100">
                      <div className="pr-8">
                        <p className="text-sm font-medium text-gray-900">Mention emails</p>
                        <p className="text-xs text-gray-500 mt-0.5">Receive an email when you&apos;re @mentioned, in addition to the in-app notification</p>
                      </div>
                      <Toggle checked={emailOnMention} onChange={setEmailOnMention} />
                    </div>
                    <div className="flex items-start justify-between py-4">
                      <div className="pr-8">
                        <p className="text-sm font-medium text-gray-900">Product updates</p>
                        <p className="text-xs text-gray-500 mt-0.5">News, feature announcements, and product updates from Ceap Council</p>
                      </div>
                      <Toggle checked={emailMarketing} onChange={setEmailMarketing} />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={async () => {
                        setNotifSaving(true);
                        setNotifSuccess(false);
                        try {
                          await api.updateNotificationPreferences({
                            notify_on_mention: notifyOnMention,
                            email_on_mention: emailOnMention,
                            email_marketing: emailMarketing,
                          });
                          await fetchUser();
                          setNotifSuccess(true);
                          setTimeout(() => setNotifSuccess(false), 3000);
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
                    {notifSuccess && (
                      <div className="flex items-center gap-1.5 text-emerald-600 text-sm">
                        <CheckCircle2 className="h-4 w-4" />
                        Saved
                      </div>
                    )}
                  </div>
                </div>
              </SectionCard>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
