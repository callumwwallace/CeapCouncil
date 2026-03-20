'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  GitBranch, Code2, Loader2, Play, Copy, Check,
  ChevronDown, ChevronUp, Eye, Share2,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface StrategyEmbedCardProps {
  shareToken: string;
  title: string;
  className?: string;
}

export default function StrategyEmbedCard({ shareToken, title, className = '' }: StrategyEmbedCardProps) {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [expanded, setExpanded] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [strategyId, setStrategyId] = useState<number | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [forking, setForking] = useState(false);
  const [forkSuccess, setForkSuccess] = useState<{ id: number; title: string } | null>(null);
  const [forkError, setForkError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const loadCode = useCallback(() => {
    if (code !== null) return; // Already loaded
    setCodeError(null);
    setCodeLoading(true);
    api
      .getStrategyByToken(shareToken)
      .then((s) => {
        setCode(s.code);
        setStrategyId(s.id);
      })
      .catch((err) => {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setCodeError(typeof msg === 'string' ? msg : 'Could not load strategy — it may be private');
      })
      .finally(() => setCodeLoading(false));
  }, [shareToken, code]);

  const handleToggleCode = () => {
    if (!expanded) loadCode();
    setExpanded(!expanded);
  };

  const handleFork = async () => {
    if (!isAuthenticated || !strategyId) return;
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

  const handleOpenInPlayground = () => {
    // Load code first if needed, then inject into playground
    if (code) {
      sessionStorage.setItem('playground_inject_code', code);
      sessionStorage.setItem('playground_inject_template', 'custom');
      router.push('/playground');
    } else {
      // Need to fetch first
      setCodeLoading(true);
      api
        .getStrategyByToken(shareToken)
        .then((s) => {
          setCode(s.code);
          setStrategyId(s.id);
          sessionStorage.setItem('playground_inject_code', s.code);
          sessionStorage.setItem('playground_inject_template', 'custom');
          router.push('/playground');
        })
        .catch((err) => {
          const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
          setCodeError(typeof msg === 'string' ? msg : 'Could not load strategy');
        })
        .finally(() => setCodeLoading(false));
    }
  };

  const handleCopyCode = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = () => {
    const embed = `[strategy:${shareToken}|${title}]`;
    navigator.clipboard.writeText(embed);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // Count lines for preview
  const codeLines = code?.split('\n').length ?? 0;
  const codePreview = code?.split('\n').slice(0, 12).join('\n');
  const hasMoreLines = codeLines > 12;

  return (
    <div
      className={`my-3 rounded-xl border border-gray-200 bg-gradient-to-b from-gray-50 to-white overflow-hidden ${className}`}
      data-strategy-embed
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
            <Code2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 text-sm truncate">{title}</div>
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

      {/* Action buttons */}
      <div className="px-4 pb-3 flex flex-wrap gap-2">
        {isAuthenticated ? (
          <>
            {/* Primary CTA: Open in Playground */}
            <button
              type="button"
              onClick={handleOpenInPlayground}
              disabled={codeLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition shadow-sm disabled:opacity-50"
            >
              {codeLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Open in Playground
            </button>

            {/* Fork — only enabled after code is loaded */}
            <button
              type="button"
              onClick={() => { if (!strategyId) { loadCode(); } else { handleFork(); } }}
              disabled={forking}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition disabled:opacity-50"
            >
              {forking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <GitBranch className="h-3.5 w-3.5" />
              )}
              Fork
            </button>

            {/* View code toggle */}
            <button
              type="button"
              onClick={handleToggleCode}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 rounded-lg border border-gray-200 transition"
            >
              <Eye className="h-3.5 w-3.5" />
              {expanded ? 'Hide code' : 'View code'}
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition shadow-sm"
            >
              <Play className="h-3.5 w-3.5" />
              Sign in to try it
            </Link>
            <button
              type="button"
              onClick={handleToggleCode}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 rounded-lg border border-gray-200 transition"
            >
              <Eye className="h-3.5 w-3.5" />
              {expanded ? 'Hide code' : 'Preview code'}
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </>
        )}
      </div>

      {/* Success/error messages */}
      {forkSuccess && (
        <div className="mx-4 mb-3 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
          Forked as &quot;{forkSuccess.title}&quot;.{' '}
          <Link href="/playground" className="font-medium underline hover:text-emerald-900">
            Open Playground &rarr;
          </Link>
        </div>
      )}
      {forkError && (
        <div className="mx-4 mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {forkError}
        </div>
      )}

      {/* Expandable code preview */}
      {expanded && (
        <div className="border-t border-gray-200">
          {codeLoading && (
            <div className="flex items-center gap-2 text-gray-500 px-4 py-6 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading strategy code...
            </div>
          )}
          {codeError && (
            <div className="px-4 py-4 text-sm text-red-600">{codeError}</div>
          )}
          {code != null && (
            <div className="relative group">
              <button
                type="button"
                onClick={handleCopyCode}
                className="absolute top-2 right-2 p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                title="Copy code"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <pre className="bg-gray-900 text-gray-100 px-4 py-3 text-xs font-mono overflow-x-auto leading-relaxed max-h-[400px] overflow-y-auto">
                <code>{expanded && !hasMoreLines ? code : codePreview}</code>
                {hasMoreLines && !expanded && (
                  <span className="text-gray-500 block mt-1">... {codeLines - 12} more lines</span>
                )}
              </pre>
              {codeLines > 0 && (
                <div className="flex items-center justify-between px-4 py-2 bg-gray-800 text-[10px] text-gray-400">
                  <span>{codeLines} lines &middot; Python</span>
                  <button
                    type="button"
                    onClick={handleOpenInPlayground}
                    className="text-emerald-400 hover:text-emerald-300 font-medium transition"
                  >
                    Run in Playground &rarr;
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
