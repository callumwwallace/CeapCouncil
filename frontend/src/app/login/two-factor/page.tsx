'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BarChart3, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

function TwoFactorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pendingToken = searchParams.get('pending_token');

  const { totpVerify, isLoading } = useAuthStore();
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!pendingToken || !code.trim()) {
      setError('Please enter your verification code');
      return;
    }
    try {
      await totpVerify(pendingToken, code.trim());
      router.push('/dashboard');
    } catch {
      setError('Invalid code. Please try again.');
    }
  };

  if (!pendingToken) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <p className="text-gray-700">Invalid session. Please sign in again.</p>
          <Link href="/login" className="mt-4 inline-block text-emerald-600 hover:text-emerald-500">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link href="/" className="flex items-center justify-center gap-2">
          <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
            <BarChart3 className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-gray-900">Ceap Council</span>
        </Link>
        <h2 className="mt-6 text-center text-2xl font-bold text-gray-900">Two-factor authentication</h2>
        <p className="mt-2 text-center text-gray-600">
          Enter the 6-digit code from your authenticator app{useRecovery ? ' or a recovery code' : ''}.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-gray-200 rounded-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700">
                {useRecovery ? 'Recovery code' : 'Verification code'}
              </label>
              <input
                id="code"
                type="text"
                inputMode={useRecovery ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                placeholder={useRecovery ? 'XXXX-XXXX' : '000000'}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 font-mono text-lg tracking-widest"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setUseRecovery(!useRecovery);
                setCode('');
                setError('');
              }}
              className="text-sm text-emerald-600 hover:text-emerald-500"
            >
              {useRecovery ? 'Use authenticator app instead' : 'Use recovery code instead'}
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center gap-2 py-2.5 px-4 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {isLoading ? 'Verifying...' : (
                <>
                  Verify
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-gray-500">
            <Link href="/login" className="font-medium text-emerald-600 hover:text-emerald-500">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function TwoFactorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <TwoFactorContent />
    </Suspense>
  );
}
