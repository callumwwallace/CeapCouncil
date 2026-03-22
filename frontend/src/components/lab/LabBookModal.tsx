'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, FileCode, BookOpen, GitBranch, GitMerge, Pencil, Save, RotateCcw, Copy, Loader2, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '@/lib/api';
import type { Strategy } from '@/types';
import { STRATEGY_TEMPLATES, type StrategyTemplateKey } from '@/app/playground/strategyTemplates';
import { extractApiError } from '@/app/playground/utils';

const Editor = dynamic(
  () => import('@monaco-editor/react').then((mod) => mod.default),
  { ssr: false, loading: () => <div className="h-[400px] bg-gray-100 rounded-lg animate-pulse" /> }
);

export type BookModalView = 'documentation' | 'version-control' | 'code';

const VIEWS: { id: BookModalView; label: string; icon: React.ReactNode }[] = [
  { id: 'code', label: 'Code', icon: <FileCode className="h-4 w-4" /> },
  { id: 'documentation', label: 'Documentation', icon: <BookOpen className="h-4 w-4" /> },
  { id: 'version-control', label: 'Version control', icon: <GitBranch className="h-4 w-4" /> },
];

const MOCK_CODE = `# SMA Crossover Strategy
class MyStrategy:
    def init(self):
        self.fast = SMA(period=20)
        self.slow = SMA(period=50)
        self.set_warmup(bars=60)

    def on_data(self, bar):
        if self.is_warming_up:
            return
        if self.fast > self.slow and self.is_flat(bar.symbol):
            self.market_order(bar.symbol, 10)
        elif self.fast < self.slow and self.is_long(bar.symbol):
            self.close_position(bar.symbol)
`;

const MOCK_DOCS = `# SMA Crossover Strategy

## Overview
Simple moving average crossover strategy that goes long when the fast SMA crosses above the slow SMA.

## Parameters
- **Fast period**: 20 (default)
- **Slow period**: 50 (default)
- **Position size**: 10 shares

## Entry
- Fast SMA crosses above Slow SMA
- No existing position

## Exit
- Fast SMA crosses below Slow SMA
- Closes long position
`;

const MOCK_COMMITS = [
  { id: 3, message: 'Add warmup period', hash: 'a1b2c3d', date: '2 hours ago', author: 'You' },
  { id: 2, message: 'Tune SMA periods', hash: 'd4e5f6g', date: '1 day ago', author: 'You' },
  { id: 1, message: 'Initial strategy', hash: 'g7h8i9j', date: '3 days ago', author: 'You' },
];

// Grab the module or first class docstring for the docs panel
function extractDocstring(code: string): string {
  try {
    const tripleQuotes = /"""([\s\S]*?)"""|'''([\s\S]*?)'''/;
    const m = code.match(tripleQuotes);
    if (m) return (m[1] ?? m[2] ?? '').trim();
    return '';
  } catch {
    return '';
  }
}

interface LabBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupName: string;
  strategy: Strategy | null;
  templateName: string | null;
  initialView: BookModalView;
  onSaved?: () => void;
}

type VersionItem = { id: number; version: number; commit_message: string | null; created_at: string | null; code_preview: string };

export default function LabBookModal({
  isOpen,
  onClose,
  groupName,
  strategy,
  templateName,
  initialView,
  onSaved,
}: LabBookModalProps) {
  const [currentView, setCurrentView] = useState<BookModalView>(initialView);
  const [code, setCode] = useState('');
  const [docs, setDocs] = useState('');
  const [docMode, setDocMode] = useState<'preview' | 'edit'>('preview');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [selectedCommitId, setSelectedCommitId] = useState<number | null>(null);
  const [commitSummary, setCommitSummary] = useState('');
  const [commitDescription, setCommitDescription] = useState('');
  const [diffMode, setDiffMode] = useState<'vs-parent' | 'vs-working'>('vs-parent');
  const [diffContent, setDiffContent] = useState('');
  const [diffLoading, setDiffLoading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const [revertLoading, setRevertLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const lastSavedCodeRef = useRef('');
  const lastSavedDocsRef = useRef('');
  const router = useRouter();

  const isRealStrategy = strategy !== null;
  const hasUnsavedChanges = code !== lastSavedCodeRef.current || docs !== lastSavedDocsRef.current;
  const strategyDisplayName = strategy?.title ?? templateName ?? '';

  const selectedCommit = versions.find((c) => c.id === selectedCommitId);

  const loadStrategy = useCallback(async () => {
    if (!strategy?.id) return;
    setLoading(true);
    try {
      const s = await api.getStrategy(strategy.id);
      setCode(s.code);
      setDocs(s.description ?? '');
      lastSavedCodeRef.current = s.code;
      lastSavedDocsRef.current = s.description ?? '';
    } catch {
      setCode('');
      setDocs('');
      lastSavedCodeRef.current = '';
      lastSavedDocsRef.current = '';
    } finally {
      setLoading(false);
    }
  }, [strategy?.id]);

  const loadVersions = useCallback(async () => {
    if (!strategy?.id) return;
    setVersionsLoading(true);
    try {
      const list = await api.listVersions(strategy.id, 0, 20);
      setVersions(list);
      if (list.length > 0 && !selectedCommitId) setSelectedCommitId(list[0].id);
    } catch {
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  }, [strategy?.id]);

  useEffect(() => {
    if (!isOpen) setSaveError(null);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && strategy) {
      loadStrategy();
    } else if (isOpen && templateName) {
      const key = templateName.replace('.py', '') as StrategyTemplateKey;
      const t = STRATEGY_TEMPLATES[key];
      const loadedCode = t?.code ?? MOCK_CODE;
      const loadedDocs = MOCK_DOCS;
      setCode(loadedCode);
      setDocs(loadedDocs);
      lastSavedCodeRef.current = loadedCode;
      lastSavedDocsRef.current = loadedDocs;
    } else if (!isOpen) {
      setCode('');
      setDocs('');
      setVersions([]);
      setSelectedCommitId(null);
    }
  }, [isOpen, strategy, templateName, loadStrategy]);

  useEffect(() => {
    if (isOpen && strategy && currentView === 'version-control') {
      loadVersions();
    }
  }, [isOpen, strategy, currentView, loadVersions]);

  useEffect(() => {
    if (!strategy?.id || !selectedCommit || currentView !== 'version-control') {
      setDiffContent('');
      return;
    }
    setDiffLoading(true);
    setDiffContent('');
    const v = selectedCommit.version;
    const load = async () => {
      try {
        if (diffMode === 'vs-working') {
          const r = await api.diffVersionWorking(strategy.id, v);
          setDiffContent(r.diff || '(No changes)');
        } else {
          const parent = v - 1;
          if (parent < 1) {
            const ver = await api.getVersion(strategy.id, v);
            setDiffContent(ver.code ? `--- /dev/null\n+++ v${v}\n${ver.code.split('\n').map((l) => `+${l}`).join('\n')}` : '(Initial version)');
          } else {
            const r = await api.diffVersions(strategy.id, parent, v);
            setDiffContent(r.diff || '(No changes)');
          }
        }
      } catch {
        setDiffContent('(Failed to load diff)');
      } finally {
        setDiffLoading(false);
      }
    };
    load();
  }, [strategy?.id, selectedCommit?.id, selectedCommit?.version, diffMode, currentView]);

  useEffect(() => {
    setCurrentView(initialView);
  }, [initialView, isOpen]);

  useEffect(() => {
    if (currentView === 'documentation') setDocMode('preview');
  }, [currentView]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const handleSave = async () => {
    if (!strategy?.id) return;
    setSaving(true);
    setSaveStatus('idle');
    setSaveError(null);
    try {
      await api.updateStrategy(strategy.id, { code, description: docs || undefined });
      lastSavedCodeRef.current = code;
      lastSavedDocsRef.current = docs;
      setSaveStatus('saved');
      setSaveError(null);
      onSaved?.();
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: unknown) {
      setSaveStatus('error');
      setSaveError(extractApiError(err, 'Failed to save'));
    } finally {
      setSaving(false);
    }
  };

  const handleCommit = async () => {
    if (!strategy?.id || !commitSummary.trim()) return;
    setCommitLoading(true);
    setSaveError(null);
    try {
      await api.updateStrategy(strategy.id, { code, description: docs || undefined });
      await api.createVersion(strategy.id, commitSummary.trim());
      setCommitSummary('');
      setCommitDescription('');
      await loadVersions();
      await loadStrategy();
    } catch {
      // API handles the error
    } finally {
      setCommitLoading(false);
    }
  };

  const handleReset = async (version: number) => {
    if (!strategy?.id) return;
    try {
      const s = await api.restoreVersion(strategy.id, version);
      setCode(s.code);
      setDocs(s.description ?? '');
      lastSavedCodeRef.current = s.code;
      lastSavedDocsRef.current = s.description ?? '';
      await loadVersions();
    } catch {
      // something went wrong
    }
  };

  const handleRevert = async (version: number) => {
    if (!strategy?.id) return;
    setRevertLoading(true);
    try {
      const s = await api.revertToVersion(strategy.id, version);
      setCode(s.code);
      setDocs(s.description ?? '');
      lastSavedCodeRef.current = s.code;
      lastSavedDocsRef.current = s.description ?? '';
      await loadVersions();
      onSaved?.();
    } catch {
      // something went wrong
    } finally {
      setRevertLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-16 pb-4 px-4"
      role="dialog"
      aria-modal
      aria-labelledby="lab-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-4xl max-h-[calc(100vh-6rem)] flex flex-col bg-white rounded-xl border border-gray-200 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-gray-200 bg-gray-50/50 shrink-0">
          {/* Group & strategy pill */}
          <div
            className="flex flex-col justify-center gap-0.5 min-w-0 shrink-0 w-[200px] sm:w-[240px] h-12 rounded-full bg-gray-200/70 px-4 shadow-sm"
            id="lab-modal-title"
          >
            <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider truncate">
              {groupName}
            </span>
            <span
              className="block font-mono text-sm font-semibold text-gray-900 truncate"
              title={strategyDisplayName}
            >
              {strategyDisplayName}
            </span>
          </div>
          {/* Toggle bar */}
          <div className="flex items-center h-12 rounded-full bg-gray-200/80 p-1.5 shadow-sm shrink-0">
            {VIEWS.map((view) => (
              <button
                key={view.id}
                onClick={() => setCurrentView(view.id)}
                className={`inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all duration-300 ${
                  currentView === view.id
                    ? 'bg-white text-emerald-700 shadow-md'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {view.icon}
                {view.label}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-200 transition-colors shrink-0 ml-auto"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content with animation */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <div
            key={currentView}
            className="h-full animate-lab-fade-slide"
          >
            {currentView === 'code' && (
              <div className="flex flex-col h-[500px] border-t border-gray-100">
                {/* Code view toolbar */}
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50/80 border-b border-gray-200 shrink-0">
                  <div className="flex items-center gap-2">
                    {templateName && !strategy && (
                      hasUnsavedChanges ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('You have unsaved changes. Open in Playground anyway? Your unsaved edits will not appear there.')) {
                              router.push('/playground');
                            }
                          }}
                          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                        >
                          <ExternalLink className="h-4 w-4 shrink-0" />
                          <span className="hidden sm:inline">Open in Playground</span>
                        </button>
                      ) : (
                        <Link
                          href="/playground"
                          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                        >
                          <ExternalLink className="h-4 w-4 shrink-0" />
                          <span className="hidden sm:inline">Open in Playground</span>
                        </Link>
                      )
                    )}
                    {strategy && (
                      hasUnsavedChanges ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('You have unsaved changes. Open in Playground anyway? Your unsaved edits will not appear there.')) {
                              router.push(`/playground?strategy_id=${strategy.id}`);
                            }
                          }}
                          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                        >
                          <ExternalLink className="h-4 w-4 shrink-0" />
                          <span className="hidden sm:inline">Open in Playground</span>
                        </button>
                      ) : (
                        <Link
                          href={`/playground?strategy_id=${strategy.id}`}
                          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                        >
                          <ExternalLink className="h-4 w-4 shrink-0" />
                          <span className="hidden sm:inline">Open in Playground</span>
                        </Link>
                      )
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {saveError && (
                      <span className="text-xs text-red-600 truncate max-w-[140px]" title={saveError}>
                        {saveError}
                      </span>
                    )}
                    {isRealStrategy && (
                      <button
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
                        onClick={handleSave}
                        disabled={saving}
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <Save className="h-4 w-4 shrink-0" />}
                        {saveStatus === 'saved' ? 'Saved' : 'Save'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex-1 min-h-0">
                {loading ? (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : (
                <Editor
                  height="100%"
                  defaultLanguage="python"
                  value={code}
                  onChange={(v) => setCode(v ?? '')}
                  theme="light"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    padding: { top: 16, bottom: 16 },
                    folding: true,
                    wordWrap: 'on',
                  }}
                />
                )}
                </div>
              </div>
            )}
            {currentView === 'documentation' && (
              <div className="flex flex-col h-[500px] border-t border-gray-100">
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 shrink-0">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {docMode === 'preview' ? 'Preview' : 'Write & Preview'}
                  </span>
                  <div className="flex items-center gap-2">
                    {isRealStrategy && (
                      <>
                        <button
                          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                          onClick={() => setDocMode(docMode === 'preview' ? 'edit' : 'preview')}
                        >
                          <Pencil className="h-4 w-4" />
                          {docMode === 'preview' ? 'Edit' : 'Done'}
                        </button>
                        {docMode === 'edit' && (
                          <button
                            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
                            onClick={handleSave}
                            disabled={saving}
                          >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Save
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {docMode === 'preview' ? (
                  <div className="flex-1 overflow-y-auto p-4">
                    <div className="prose prose-sm max-w-none [&_h1]:text-base [&_h2]:text-sm [&_p]:text-sm [&_code]:text-xs [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {docs || (isRealStrategy ? extractDocstring(code) : '') || '*No content yet*'}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col sm:flex-row min-h-0">
                    <div className="flex-1 flex flex-col min-w-0 sm:border-r border-gray-200 min-h-[160px]">
                      <div className="px-3 py-1.5 bg-gray-50/80 border-b border-gray-200 text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                        Write
                      </div>
                      <textarea
                        value={docs}
                        onChange={(e) => setDocs(e.target.value)}
                        className="flex-1 w-full p-4 font-mono text-sm text-gray-800 resize-none focus:outline-none focus:ring-0"
                        placeholder="# Strategy documentation...&#10;&#10;Use Markdown to document your strategy."
                        spellCheck={false}
                      />
                    </div>
                    <div className="flex-1 flex flex-col min-w-0 overflow-hidden min-h-[160px] border-t sm:border-t-0 sm:border-l border-gray-200">
                      <div className="px-3 py-1.5 bg-gray-50/80 border-b border-gray-200 text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                        Preview
                      </div>
                      <div className="flex-1 overflow-y-auto p-4">
                        <div className="prose prose-sm max-w-none [&_h1]:text-base [&_h2]:text-sm [&_p]:text-sm [&_code]:text-xs [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {docs || '*No content yet*'}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {currentView === 'version-control' && (
              <div className="flex h-[500px] border-t border-gray-100">
                <div className="w-[280px] shrink-0 flex flex-col border-r border-gray-200 overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                    Commits
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                    {versionsLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                      </div>
                    ) : !isRealStrategy ? (
                      <p className="text-sm text-gray-500 p-3">Version control is available for saved strategies.</p>
                    ) : versions.length === 0 ? (
                      <p className="text-sm text-gray-500 p-3">No commits yet. Save and commit to create versions.</p>
                    ) : (
                      versions.map((commit) => (
                        <div
                          key={commit.id}
                          className={`rounded-lg border transition-colors ${
                            selectedCommitId === commit.id
                              ? 'border-emerald-300 bg-emerald-50/50'
                              : 'border-gray-200 hover:border-emerald-200 hover:bg-emerald-50/30'
                          }`}
                        >
                          <button
                            onClick={() => setSelectedCommitId(commit.id)}
                            className="w-full text-left flex items-start gap-3 p-3"
                          >
                            <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                              <GitBranch className="h-3.5 w-3.5 text-emerald-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 text-sm truncate">{commit.commit_message || 'No message'}</p>
                              <p className="text-[11px] text-gray-500 mt-0.5">
                                v{commit.version} · {commit.created_at ? new Date(commit.created_at).toLocaleDateString() : ''}
                              </p>
                            </div>
                          </button>
                          {selectedCommitId === commit.id && (
                            <div className="px-3 pb-2 pt-0 flex flex-wrap gap-1.5">
                              <button
                                className="inline-flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-amber-700 hover:bg-amber-50 rounded border border-amber-200/60 transition-colors disabled:opacity-50"
                                onClick={() => handleReset(commit.version)}
                                title="Reset working copy to this version (no new commit)"
                              >
                                <RotateCcw className="h-3 w-3" />
                                Reset
                              </button>
                              <button
                                className="inline-flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 rounded border border-emerald-200/60 transition-colors disabled:opacity-50"
                                onClick={() => handleRevert(commit.version)}
                                disabled={revertLoading}
                                title="Revert: create new version with this code (preserves history)"
                              >
                                {revertLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitMerge className="h-3 w-3" />}
                                Revert
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                  {isRealStrategy && (
                  <div className="p-2 border-t border-gray-200 space-y-2 bg-gray-50/50">
                    <div>
                      <input
                        type="text"
                        value={commitSummary}
                        onChange={(e) => setCommitSummary(e.target.value)}
                        placeholder="Summary (required)"
                        className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <textarea
                        value={commitDescription}
                        onChange={(e) => setCommitDescription(e.target.value)}
                        placeholder="Description"
                        rows={3}
                        className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                      />
                    </div>
                    <button
                      className="w-full py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      onClick={handleCommit}
                      disabled={!commitSummary.trim() || commitLoading}
                    >
                      {commitLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Commit to <span className="font-semibold">main</span>
                    </button>
                  </div>
                  )}
                </div>
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
                    <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                      Diff — {strategyDisplayName}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <div className="flex rounded-lg border border-gray-200 p-0.5 bg-white">
                        <button
                          onClick={() => setDiffMode('vs-parent')}
                          className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                            diffMode === 'vs-parent'
                              ? 'bg-gray-100 text-gray-900'
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          vs parent
                        </button>
                        <button
                          onClick={() => setDiffMode('vs-working')}
                          className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                            diffMode === 'vs-working'
                              ? 'bg-gray-100 text-gray-900'
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          vs working
                        </button>
                      </div>
                      {selectedCommit && (
                        <>
                          <button
                            className="inline-flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-amber-700 hover:bg-amber-50 rounded border border-amber-200/60 transition-colors"
                            onClick={() => handleReset(selectedCommit.version)}
                            title="Reset working copy to this version (no new commit)"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Reset
                          </button>
                          <button
                            className="inline-flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 rounded border border-emerald-200/60 transition-colors disabled:opacity-50"
                            onClick={() => handleRevert(selectedCommit.version)}
                            disabled={revertLoading}
                            title="Revert: create new version with this code (preserves history)"
                          >
                            {revertLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitMerge className="h-3 w-3" />}
                            Revert
                          </button>
                        </>
                      )}
                      <button
                        className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
                        onClick={() => {}}
                        title="Copy commit hash"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {selectedCommit && (
                    <div className="px-3 py-1 bg-gray-50/80 border-b border-gray-100 text-[11px] text-gray-500">
                      v{selectedCommit.version} — {selectedCommit.commit_message || 'No message'}
                    </div>
                  )}
                  <div className="flex-1 overflow-auto p-4">
                    {diffLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                      </div>
                    ) : (
                    <pre className="font-mono text-xs leading-relaxed">
                      {(diffContent || (selectedCommit ? `Version ${selectedCommit.version}` : 'Select a commit')).split('\n').map((line, i) => {
                        let bg = '';
                        let text = 'text-gray-800';
                        if (line.startsWith('---') || line.startsWith('+++')) {
                          text = 'text-blue-600';
                        } else if (line.startsWith('-')) {
                          bg = 'bg-red-50';
                          text = 'text-red-700';
                        } else if (line.startsWith('+')) {
                          bg = 'bg-emerald-50';
                          text = 'text-emerald-700';
                        } else if (line.startsWith('@@')) {
                          text = 'text-blue-600';
                        }
                        return (
                          <div
                            key={i}
                            className={`${bg} ${text} pl-2 -ml-2 py-0.5 border-l-2 ${
                              line.startsWith('-') ? 'border-red-300' : line.startsWith('+') ? 'border-emerald-400' : 'border-transparent'
                            }`}
                          >
                            {line || ' '}
                          </div>
                        );
                      })}
                    </pre>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
