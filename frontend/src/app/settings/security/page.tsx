'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import { ArrowLeft, Shield, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function SecuritySettingsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();

  const [totpEnabled, setTotpEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [setupPhase, setSetupPhase] = useState<'idle' | 'qr' | 'confirm' | 'done'>('idle');
  const [qrUri, setQrUri] = useState('');
  const [secret, setSecret] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated && !authLoading) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (isAuthenticated) {
      api
        .totpStatus()
        .then((r) => setTotpEnabled(r.totp_enabled))
        .catch(() => setTotpEnabled(false))
        .finally(() => setLoading(false));
    }
  }, [isAuthenticated]);

  const startSetup = async () => {
    setError('');
    setActionLoading(true);
    try {
      const r = await api.totpSetup();
      setQrUri(r.qr_uri);
      setSecret(r.secret);
      setSetupPhase('qr');
    } catch {
      setError('Failed to start 2FA setup');
    } finally {
      setActionLoading(false);
    }
  };

  const confirmSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setActionLoading(true);
    try {
      const r = await api.totpConfirm(confirmCode);
      setRecoveryCodes(r.recovery_codes);
      setTotpEnabled(true);
      setSetupPhase('done');
    } catch {
      setError('Invalid code. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const disable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setActionLoading(true);
    try {
      await api.totpDisable(disablePassword, disableCode);
      setTotpEnabled(false);
      setSetupPhase('idle');
      setDisablePassword('');
      setDisableCode('');
    } catch {
      setError('Invalid password or code.');
    } finally {
      setActionLoading(false);
    }
  };

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-2">
            <Shield className="h-5 w-5 text-gray-500" />
            <h1 className="font-semibold text-gray-900">Two-factor authentication</h1>
          </div>

          <div className="p-5 space-y-6">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : setupPhase === 'done' ? (
              <div>
                <div className="flex items-center gap-2 text-emerald-600 mb-4">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">2FA enabled</span>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  Save these recovery codes in a secure place. Each can be used once to sign in if you lose access to your authenticator app.
                </p>
                <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm break-all">
                  {recoveryCodes.map((c, i) => (
                    <div key={i}>{c}</div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setSetupPhase('idle');
                    setRecoveryCodes([]);
                  }}
                  className="mt-4 text-sm text-emerald-600 hover:text-emerald-500"
                >
                  I&apos;ve saved these
                </button>
              </div>
            ) : setupPhase === 'qr' ? (
              <form onSubmit={confirmSetup} className="space-y-4">
                <p className="text-sm text-gray-600">
                  Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.).
                </p>
                <div className="flex justify-center p-4 bg-white rounded-lg border border-gray-200">
                  <QRCodeSVG value={qrUri} size={180} level="M" />
                </div>
                <p className="text-xs text-gray-500">
                  Or enter this key manually: <code className="bg-gray-100 px-1 rounded">{secret}</code>
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Enter 6-digit code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={confirmCode}
                    onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-lg tracking-widest"
                    placeholder="000000"
                  />
                </div>
                <button
                  type="submit"
                  disabled={actionLoading || confirmCode.length !== 6}
                  className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Enable 2FA
                </button>
              </form>
            ) : totpEnabled ? (
              <form onSubmit={disable2FA} className="space-y-4">
                <p className="text-sm text-gray-600">Two-factor authentication is enabled.</p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="Your password"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Authenticator code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono"
                    placeholder="000000"
                  />
                </div>
                <button
                  type="submit"
                  disabled={actionLoading || !disablePassword || disableCode.length !== 6}
                  className="w-full py-2.5 px-4 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Disable 2FA
                </button>
              </form>
            ) : (
              <div>
                <p className="text-sm text-gray-600 mb-4">
                  Add an extra layer of security to your account by enabling two-factor authentication.
                </p>
                <button
                  onClick={startSetup}
                  disabled={actionLoading}
                  className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Enable 2FA
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
