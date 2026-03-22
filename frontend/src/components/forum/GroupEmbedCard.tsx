'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  GitBranch, FolderOpen, Loader2, Copy, Check, Share2,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { GroupEmbedResponse } from '@/types';

interface GroupEmbedCardProps {
  shareToken: string;
  title: string;
  className?: string;
}

export default function GroupEmbedCard({ shareToken, title, className = '' }: GroupEmbedCardProps) {
  const { isAuthenticated } = useAuthStore();
  const [group, setGroup] = useState<GroupEmbedResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forking, setForking] = useState(false);
  const [forkSuccess, setForkSuccess] = useState<{ count: number } | null>(null);
  const [forkError, setForkError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    setError(null);
    setLoading(true);
    api
      .getGroupByToken(shareToken)
      .then(setGroup)
      .catch((err) => {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setError(typeof msg === 'string' ? msg : 'Could not load group — it may be private');
      })
      .finally(() => setLoading(false));
  }, [shareToken]);

  const handleFork = async () => {
    if (!isAuthenticated) return;
    setForking(true);
    setForkSuccess(null);
    setForkError(null);
    try {
      const result = await api.forkGroup(shareToken);
      setForkSuccess({ count: result.forked_count });
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setForkError(typeof msg === 'string' ? msg : 'Could not fork group');
    } finally {
      setForking(false);
    }
  };

  const handleCopyLink = () => {
    const embed = `[group:${shareToken}|${title}]`;
    navigator.clipboard.writeText(embed);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  if (loading) {
    return (
      <div
        className={`my-3 rounded-xl border border-gray-200 bg-gradient-to-b from-gray-50 to-white p-6 flex items-center justify-center gap-2 text-gray-500 ${className}`}
        data-group-embed
      >
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading group...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`my-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 ${className}`}
        data-group-embed
      >
        {error}
      </div>
    );
  }

  if (!group) return null;

  const hasPublicStrategies = group.strategy_count > 0;

  return (
    <div
      className={`my-3 rounded-xl border border-gray-200 bg-gradient-to-b from-gray-50 to-white overflow-hidden ${className}`}
      data-group-embed
    >
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <FolderOpen className="h-4 w-4 text-amber-600" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 text-sm truncate">{group.name}</div>
            <div className="text-xs text-gray-500">by {group.author_username} · {group.strategy_count} strategies</div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleCopyLink}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition"
          title="Copy embed"
        >
          {linkCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Share2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="px-4 pb-3 flex flex-wrap gap-2">
        {isAuthenticated ? (
          <>
            <button
              type="button"
              onClick={handleFork}
              disabled={forking || !hasPublicStrategies}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {forking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <GitBranch className="h-3.5 w-3.5" />
              )}
              Fork entire group
            </button>
          </>
        ) : (
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition shadow-sm"
          >
            Sign in to fork
          </Link>
        )}
      </div>

      {!hasPublicStrategies && (
        <div className="px-4 pb-3 text-xs text-amber-700">
          No strategies in this group.
        </div>
      )}

      {forkSuccess && (
        <div className="mx-4 mb-3 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
          Forked {forkSuccess.count} strategies into My Strategies.{' '}
          <Link href="/lab" className="font-medium underline hover:text-emerald-900">
            Open Lab
          </Link>
          {' · '}
          <Link href="/playground" className="font-medium underline hover:text-emerald-900">
            Open Playground
          </Link>
        </div>
      )}
      {forkError && (
        <div className="mx-4 mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {forkError}
        </div>
      )}

      {group.strategies.length > 0 && (
        <div className="border-t border-gray-200 px-4 py-2">
          <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1.5">Strategies</div>
          <div className="flex flex-wrap gap-1.5">
            {group.strategies.slice(0, 8).map((s) => (
              <span key={s.id} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-md truncate max-w-[140px]" title={s.title}>
                {s.title}
              </span>
            ))}
            {group.strategies.length > 8 && (
              <span className="text-xs text-gray-500">+{group.strategies.length - 8} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
