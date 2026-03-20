'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BarChart3, Mail, AlertCircle } from 'lucide-react';
import api from '@/lib/api';

export default function CheckEmailPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.resendVerification(email);
      setSent(true);
    } catch {
      setError('Failed to send verification email. Try again later.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link href="/" className="flex items-center justify-center gap-2">
          <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
            <BarChart3 className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-gray-900">Ceap Council</span>
        </Link>
        <h2 className="mt-6 text-center text-2xl font-bold text-gray-900">Check your email</h2>
        <p className="mt-2 text-center text-gray-600">
          We&apos;ve sent a verification link to your email. Click the link to verify your account.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-gray-200 rounded-xl">
          <div className="flex justify-center mb-4">
            <Mail className="h-12 w-12 text-emerald-500" />
          </div>
          <p className="text-center text-gray-700 mb-6">
            Didn&apos;t receive the email? Enter your address below and we&apos;ll send another link.
          </p>
          <form onSubmit={handleResend} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}
            {sent && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm">
                Verification email sent.
              </div>
            )}
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
            />
            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700"
            >
              Resend verification email
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
