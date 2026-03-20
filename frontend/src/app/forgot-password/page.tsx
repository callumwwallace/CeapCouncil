'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BarChart3, ArrowRight, CheckCircle2 } from 'lucide-react';
import api from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.forgotPassword(email);
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again.');
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
        <h2 className="mt-6 text-center text-2xl font-bold text-gray-900">Forgot password?</h2>
        <p className="mt-2 text-center text-gray-600">
          Enter your email and we&apos;ll send you a link to reset your password.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-gray-200 rounded-xl">
          {submitted ? (
            <>
              <div className="flex justify-center mb-4">
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              </div>
              <p className="text-center text-gray-700">
                If an account exists with this email, a password reset link has been sent.
              </p>
              <p className="mt-2 text-center text-sm text-gray-500">
                Check your inbox and spam folder.
              </p>
              <Link
                href="/login"
                className="mt-6 block w-full text-center py-2.5 px-4 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700"
              >
                Back to sign in
              </Link>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <button
                type="submit"
                className="w-full flex justify-center items-center gap-2 py-2.5 px-4 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700"
              >
                Send reset link
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          )}
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
