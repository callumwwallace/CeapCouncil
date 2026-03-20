'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BarChart3, AlertCircle, CheckCircle2 } from 'lucide-react';
import api from '@/lib/api';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Invalid verification link');
      return;
    }
    api
      .verifyEmail(token)
      .then(() => {
        setStatus('success');
        setMessage('Your email has been verified. You can now sign in.');
      })
      .catch(() => {
        setStatus('error');
        setMessage('Invalid or expired verification link.');
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link href="/" className="flex items-center justify-center gap-2">
          <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
            <BarChart3 className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-gray-900">Ceap Council</span>
        </Link>
        <h2 className="mt-6 text-center text-2xl font-bold text-gray-900">Verify your email</h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-gray-200 rounded-xl">
          {status === 'loading' && (
            <p className="text-center text-gray-600">Verifying your email...</p>
          )}
          {status === 'success' && (
            <>
              <div className="flex justify-center mb-4">
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              </div>
              <p className="text-center text-gray-700">{message}</p>
              <Link
                href="/login"
                className="mt-6 block w-full text-center py-2.5 px-4 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700"
              >
                Sign in
              </Link>
            </>
          )}
          {status === 'error' && (
            <>
              <div className="flex justify-center mb-4">
                <AlertCircle className="h-12 w-12 text-red-500" />
              </div>
              <p className="text-center text-gray-700">{message}</p>
              <Link
                href="/login"
                className="mt-6 block w-full text-center py-2.5 px-4 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700"
              >
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
