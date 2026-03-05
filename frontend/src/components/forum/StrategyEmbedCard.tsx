'use client';

import { useState } from 'react';
import Link from 'next/link';
import { GitBranch, Code2, Loader2, X } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface StrategyEmbedCardProps {
  strategyId: number;
  title: string;
  className?: string;
}

export default function StrategyEmbedCard({ strategyId, title, className = '' }: StrategyEmbedCardProps) {
  const { isAuthenticated } = useAuthStore();
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [forking, setForking] = useState(false);
  const [forkSuccess, setForkSuccess] = useState<{ id: number; title: string } | null>(null);
  const [forkError, setForkError] = useState<string | null>(null);

  const loadCode = () => {
    setShowCodeModal(true);
    setCode(null);
    setCodeError(null);
    setCodeLoading(true);
    api
      .getStrategy(strategyId)
      .then((s) => setCode(s.code))
      .catch((err) => {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setCodeError(typeof msg === 'string' ? msg : 'Could not load strategy');
      })
      .finally(() => setCodeLoading(false));
  };

  const handleFork = async () => {
    if (!isAuthenticated) return;
    setForking(true);
    setForkSuccess(null);
    setForkError(null);
    try {
      const forked = await api.forkStrategy(strategyId);
      setForkSuccess({ id: forked.id, title: forked.title });
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setForkError(typeof msg === 'string' ? msg : 'Could not fork strategy');
    } finally {
      setForking(false);
    }
  };

  return (
    <>
      <div
        className={`my-3 rounded-xl border border-gray-200 bg-gray-50 p-4 ${className}`}
        data-strategy-embed
      >
        <div className="flex items-center gap-2 mb-3">
          <Code2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
          <span className="font-semibold text-gray-900 truncate">{title}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAuthenticated ? (
            <>
              <button
                type="button"
                onClick={handleFork}
                disabled={forking}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition disabled:opacity-50"
              >
                {forking ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <GitBranch className="h-3.5 w-3.5" />
                )}
                Fork to my strategies
              </button>
              <button
                type="button"
                onClick={loadCode}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white hover:bg-gray-100 rounded-lg border border-gray-200 transition"
              >
                <Code2 className="h-3.5 w-3.5" />
                View code
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition"
            >
              <GitBranch className="h-3.5 w-3.5" />
              Sign in to fork or view
            </Link>
          )}
        </div>
        {forkSuccess && (
          <p className="mt-2 text-sm text-emerald-600">
            <Link href="/playground" className="font-medium hover:underline">
              Added as &quot;{forkSuccess.title}&quot;. Open Playground →
            </Link>
          </p>
        )}
        {forkError && <p className="mt-2 text-sm text-red-600">{forkError}</p>}
      </div>

      {showCodeModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
          onClick={() => setShowCodeModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">{title} — Code</h3>
              <button
                type="button"
                onClick={() => setShowCodeModal(false)}
                className="p-1 rounded hover:bg-gray-100 text-gray-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {codeLoading && (
                <div className="flex items-center gap-2 text-gray-500 py-8">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading...
                </div>
              )}
              {codeError && <p className="text-red-600 py-4">{codeError}</p>}
              {code != null && (
                <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto whitespace-pre font-mono">
                  <code>{code}</code>
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
