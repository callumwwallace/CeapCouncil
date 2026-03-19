'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FileCode,
  ChevronDown,
  Check,
  Loader2,
  Save,
  GitBranch,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import CodeEditor from '@/components/playground/CodeEditor';
import ErrorBoundary from '@/components/ErrorBoundary';
import api from '@/lib/api';
import { formatRelativeTime, formatCommitTime, extractApiError } from '@/app/playground/utils';

interface FloatingCodeEditorProps {
  visible: boolean;
  onClose: () => void;
  code: string;
  onCodeChange: (code: string) => void;
  strategyMode: 'templates' | 'custom';
  playgroundStrategyId: number | null;
  strategyParams: Record<string, number>;
  onSetStrategyParams: (params: Record<string, number>) => void;
  effectiveChartTheme: 'light' | 'dark';
  user: { username: string } | null;
  onError: (msg: string) => void;
  strategyTitle: string;
}

export default function FloatingCodeEditor({
  visible,
  onClose,
  code,
  onCodeChange,
  strategyMode,
  playgroundStrategyId,
  strategyParams,
  onSetStrategyParams,
  effectiveChartTheme,
  user,
  onError,
  strategyTitle,
}: FloatingCodeEditorProps) {
  const [editorTab, setEditorTab] = useState<'code' | 'version-control'>('code');
  const [editorMinimized, setEditorMinimized] = useState(false);
  const [editorPosition, setEditorPosition] = useState({ x: 20, y: 300 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const [versionList, setVersionList] = useState<Array<{id: number; version: number; commit_message: string | null; created_at: string | null; code_preview: string}>>([]);
  const [versionLoading, setVersionLoading] = useState(false);
  const [versionListHasMore, setVersionListHasMore] = useState(false);
  const [commitTitleInput, setCommitTitleInput] = useState('');
  const [commitDescriptionInput, setCommitDescriptionInput] = useState('');
  const [lastEditorSaveTime, setLastEditorSaveTime] = useState<number | null>(null);
  const [editorSaveStatus, setEditorSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Set initial position on mount
  useEffect(() => {
    setEditorPosition({ x: 20, y: window.innerHeight - 470 });
  }, []);

  // Clear "saved" feedback after a few seconds
  useEffect(() => {
    if (editorSaveStatus !== 'saved') return;
    const t = setTimeout(() => setEditorSaveStatus('idle'), 2500);
    return () => clearTimeout(t);
  }, [editorSaveStatus]);

  // Load version history when editor opens for a custom strategy
  useEffect(() => {
    if (visible && strategyMode === 'custom' && playgroundStrategyId) {
      setVersionLoading(true);
      api.listVersions(playgroundStrategyId, 0, 10)
        .then((versions) => {
          setVersionList(versions);
          setVersionListHasMore(versions.length >= 10);
        })
        .catch(() => { setVersionList([]); setVersionListHasMore(false); })
        .finally(() => setVersionLoading(false));
    }
  }, [visible, strategyMode, playgroundStrategyId]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - editorPosition.x,
      y: e.clientY - editorPosition.y,
    });
  }, [editorPosition]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setEditorPosition({
        x: Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - 300)),
        y: Math.max(0, Math.min(e.clientY - dragOffset.y, window.innerHeight - 50)),
      });
    };
    const handleMouseUp = () => { setIsDragging(false); };
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  if (!visible) return null;

  return (
        <div 
          className="fixed z-50 bg-[#1e1e1e] border border-gray-700 rounded-lg shadow-2xl flex flex-col"
          style={{
            left: editorPosition.x,
            top: editorPosition.y,
            width: editorMinimized ? '200px' : '700px',
            height: editorMinimized ? '36px' : '550px',
            transition: isDragging ? 'none' : 'width 0.2s, height 0.2s',
          }}
        >
          {/* Editor Header - Draggable */}
          <div 
            className={`h-10 bg-white ${editorMinimized ? 'rounded-lg' : 'rounded-t-lg'} px-3 flex items-center justify-between border-b border-gray-200 cursor-move select-none shrink-0`}
            onMouseDown={handleMouseDown}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <FileCode className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="text-sm text-gray-900 font-medium truncate">
                {strategyTitle}
              </span>
              {!editorMinimized && strategyMode === 'custom' && playgroundStrategyId && (
                <div className="flex items-center gap-0.5 bg-gray-100 rounded-md p-0.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditorTab('code'); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`px-2.5 py-1 text-[11px] rounded transition ${editorTab === 'code' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    Code
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditorTab('version-control'); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`px-2.5 py-1 text-[11px] rounded transition ${editorTab === 'version-control' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    Version control
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!editorMinimized && strategyMode === 'custom' && playgroundStrategyId && (
                <div className="flex items-center gap-2">
                  {lastEditorSaveTime != null && (
                    <span className="text-[10px] text-gray-500" title={`Last saved ${new Date(lastEditorSaveTime).toLocaleString()}`}>
                      Saved {formatRelativeTime(lastEditorSaveTime)}
                    </span>
                  )}
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!playgroundStrategyId) return;
                      setEditorSaveStatus('saving');
                      try {
                        await api.updateStrategy(playgroundStrategyId, { code, parameters: strategyParams });
                        const now = Date.now();
                        setLastEditorSaveTime(now);
                        setEditorSaveStatus('saved');
                      } catch {
                        setEditorSaveStatus('error');
                        setTimeout(() => setEditorSaveStatus('idle'), 2500);
                      }
                    }}
                    disabled={editorSaveStatus === 'saving'}
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      editorSaveStatus === 'saved'
                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                        : editorSaveStatus === 'saving'
                        ? 'bg-gray-100 text-gray-500 border border-gray-200 cursor-wait'
                        : editorSaveStatus === 'error'
                        ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                        : 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300'
                    }`}
                    title="Save strategy (without committing)"
                  >
                    {editorSaveStatus === 'saving' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : editorSaveStatus === 'saved' ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    {editorSaveStatus === 'saving' ? 'Saving…' : editorSaveStatus === 'saved' ? 'Saved' : editorSaveStatus === 'error' ? 'Failed' : 'Save'}
                  </button>
                </div>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setEditorMinimized(!editorMinimized); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="p-1 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition"
                title={editorMinimized ? 'Expand' : 'Minimize'}
              >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${editorMinimized ? 'rotate-180' : ''}`} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition"
                title="Close"
              >
                <span className="text-sm leading-none">×</span>
              </button>
            </div>
          </div>
          
          {/* Editor Content */}
          {!editorMinimized && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden rounded-b-lg">
              {editorTab === 'code' ? (
                <div className="flex-1 min-h-0" style={{ height: '480px' }}>
                  <ErrorBoundary label="Code Editor">
                    <CodeEditor value={code} onChange={onCodeChange} />
                  </ErrorBoundary>
                </div>
              ) : strategyMode === 'custom' && playgroundStrategyId ? (
                /* Version Control tab - GitHub-style, theme-aware (light/dark) */
                <div className={`flex flex-col flex-1 min-h-0 overflow-hidden ${
                  effectiveChartTheme === 'light' ? 'bg-gray-100 border-t border-gray-200' : 'bg-gray-800/50'
                }`}>
                  <div className={`px-3 py-2 border-b shrink-0 ${
                    effectiveChartTheme === 'light' ? 'border-gray-200 text-gray-600' : 'border-gray-700/80'
                  }`}>
                    <p className={`text-[11px] ${effectiveChartTheme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
                      <strong className={effectiveChartTheme === 'light' ? 'text-gray-800' : 'text-gray-300'}>Save</strong> persists your working copy. <strong className={effectiveChartTheme === 'light' ? 'text-gray-800' : 'text-gray-300'}>Commit</strong> creates a version in history (like git commit).
                    </p>
                  </div>
                  {/* Commit input bar - Title + optional Description */}
                  <div className={`p-3 border-b shrink-0 space-y-2 ${
                    effectiveChartTheme === 'light' ? 'border-gray-200' : 'border-gray-700/80'
                  }`}>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={commitTitleInput}
                        onChange={(e) => setCommitTitleInput(e.target.value)}
                        placeholder="Commit title (required)"
                        className={`flex-1 px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 ${
                          effectiveChartTheme === 'light'
                            ? 'bg-white border border-gray-300 text-gray-900 placeholder-gray-500'
                            : 'bg-gray-700/80 border border-gray-600 text-gray-200 placeholder-gray-500'
                        }`}
                        maxLength={72}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (!playgroundStrategyId || !commitTitleInput.trim()) return;
                            const msg = commitTitleInput.trim() + (commitDescriptionInput.trim() ? '\n\n' + commitDescriptionInput.trim() : '');
                            api.updateStrategy(playgroundStrategyId, { code, parameters: strategyParams })
                              .then(() => api.createVersion(playgroundStrategyId!, msg))
                              .then(() => {
                                setCommitTitleInput('');
                                setCommitDescriptionInput('');
                                return api.listVersions(playgroundStrategyId!, 0, 10);
                              })
                              .then((v) => { setVersionList(v); setVersionListHasMore(v.length >= 10); })
                              .catch((err: unknown) => { onError(extractApiError(err, 'Failed to commit')); });
                          }
                        }}
                      />
                      <button
                        onClick={async () => {
                          if (!playgroundStrategyId || !commitTitleInput.trim()) return;
                          try {
                            const msg = commitTitleInput.trim() + (commitDescriptionInput.trim() ? '\n\n' + commitDescriptionInput.trim() : '');
                            await api.updateStrategy(playgroundStrategyId, { code, parameters: strategyParams });
                            await api.createVersion(playgroundStrategyId, msg);
                            setCommitTitleInput('');
                            setCommitDescriptionInput('');
                            const versions = await api.listVersions(playgroundStrategyId, 0, 10);
                            setVersionList(versions);
                            setVersionListHasMore(versions.length >= 10);
                          } catch (err) {
                            onError(extractApiError(err, 'Failed to commit'));
                          }
                        }}
                        disabled={!commitTitleInput.trim()}
                        className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors flex items-center gap-2 shrink-0"
                        title="Commit changes"
                      >
                        <GitBranch className="h-4 w-4" />
                        Commit
                      </button>
                    </div>
                    <textarea
                      value={commitDescriptionInput}
                      onChange={(e) => setCommitDescriptionInput(e.target.value)}
                      placeholder="Description (optional)"
                      rows={2}
                      className={`w-full px-3 py-2 text-sm rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 ${
                        effectiveChartTheme === 'light'
                          ? 'bg-white border border-gray-300 text-gray-900 placeholder-gray-500'
                          : 'bg-gray-700/80 border border-gray-600 text-gray-200 placeholder-gray-500'
                      }`}
                      maxLength={500}
                    />
                  </div>
                  {/* Commit history - GitHub-style, theme-aware */}
                  <div className="flex-1 overflow-y-auto p-3">
                    <div className={`text-[10px] font-medium uppercase tracking-wider mb-2 ${
                      effectiveChartTheme === 'light' ? 'text-gray-500' : 'text-gray-500'
                    }`}>History</div>
                    {versionLoading ? (
                      <div className={`text-xs py-4 ${effectiveChartTheme === 'light' ? 'text-gray-500' : 'text-gray-500'}`}>Loading...</div>
                    ) : versionList.length === 0 ? (
                      <div className={`text-xs py-6 text-center ${effectiveChartTheme === 'light' ? 'text-gray-500' : 'text-gray-500'}`}>No commits yet. Add a message above and commit.</div>
                    ) : (
                      <>
                      <div className={`divide-y ${
                        effectiveChartTheme === 'light' ? 'divide-gray-200' : 'divide-gray-600/50'
                      }`}>
                        {versionList.map((v, i) => {
                          const isLatest = i === 0;
                          const fullMsg = (v.commit_message || '').trim() || null;
                          const title = fullMsg ? fullMsg.split('\n')[0] : null;
                          const isLight = effectiveChartTheme === 'light';
                          return (
                            <div
                              key={v.id}
                              className={`flex items-center gap-3 py-3 group transition-colors -mx-1 px-3 rounded-md ${
                                isLatest
                                  ? isLight ? 'bg-emerald-50 border border-emerald-200/60' : 'bg-gray-700/60'
                                  : isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-700/30'
                              }`}
                            >
                                  <div className="flex-1 min-w-0">
                                <p
                                  className={`text-sm font-medium truncate ${
                                    isLatest ? (isLight ? 'text-gray-900' : 'text-gray-100') : (isLight ? 'text-gray-800' : 'text-gray-200')
                                  }`}
                                  title={fullMsg || undefined}
                                >
                                  {title || <span className={isLight ? 'italic text-gray-500' : 'italic text-gray-500'}>No message</span>}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                                    isLight ? 'bg-emerald-600/80' : 'bg-gray-500/80'
                                  }`}>
                                    <span className="text-[10px] font-medium text-white">
                                      {(user?.username || '?')[0].toUpperCase()}
                                    </span>
                                  </div>
                                  <span className={`text-[11px] truncate ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>{user?.username || 'You'}</span>
                                  <span className={isLight ? 'text-gray-400' : 'text-gray-600'}>•</span>
                                  <span className={`text-[11px] ${isLight ? 'text-gray-500' : 'text-gray-500'}`}>{formatCommitTime(v.created_at)}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={async () => {
                                        if (!playgroundStrategyId) return;
                                        try {
                                          const data = await api.restoreVersion(playgroundStrategyId, v.version);
                                          onCodeChange(data.code);
                                      onSetStrategyParams((data.parameters as Record<string, number>) ?? {});
                                          setEditorTab('code');
                                      setLastEditorSaveTime(null);
                                        } catch (err) {
                                          onError(extractApiError(err, 'Failed to restore version'));
                                        }
                                      }}
                                  className={`p-2 rounded-full transition-colors ${
                                    isLatest
                                      ? isLight
                                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                        : 'bg-emerald-600/80 hover:bg-emerald-500/90 text-white'
                                      : isLight
                                        ? 'text-gray-500 hover:text-emerald-600 hover:bg-gray-200'
                                        : 'text-gray-400 hover:text-emerald-400 hover:bg-gray-600/60'
                                  }`}
                                  title="Revert to this version (working copy only, no new commit)"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={async () => {
                                        if (!playgroundStrategyId || !confirm(`Delete v${v.version}?`)) return;
                                        try {
                                          await api.deleteVersion(playgroundStrategyId, v.version);
                                          setVersionList(prev => prev.filter(x => x.id !== v.id));
                                        } catch (err) {
                                          onError(extractApiError(err, 'Failed to delete version'));
                                        }
                                      }}
                                  className={`p-2 rounded-full transition-colors ${
                                    isLatest
                                      ? isLight ? 'text-gray-600 hover:text-red-600 hover:bg-red-50' : 'text-gray-400 hover:text-red-300 hover:bg-red-500/20'
                                      : isLight ? 'text-gray-500 hover:text-red-600 hover:bg-gray-200' : 'text-gray-500 hover:text-red-400 hover:bg-gray-600/60'
                                  }`}
                                      title="Delete commit"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                          );
                        })}
                        </div>
                        {versionListHasMore && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!playgroundStrategyId) return;
                              setVersionLoading(true);
                              try {
                                const more = await api.listVersions(playgroundStrategyId, versionList.length, 10);
                                setVersionList(prev => [...prev, ...more]);
                                setVersionListHasMore(more.length >= 10);
                              } catch (err) {
                                console.error('Failed to load more versions:', err);
                              }
                              setVersionLoading(false);
                            }}
                            className={`w-full mt-2 py-2 text-[11px] rounded-lg border border-dashed transition-colors ${
                              effectiveChartTheme === 'light'
                                ? 'text-gray-500 hover:text-gray-700 border-gray-300 hover:border-gray-400'
                                : 'text-gray-500 hover:text-gray-300 border-gray-600 hover:border-gray-500'
                            }`}
                          >
                            Load more
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Select a custom strategy for version control</div>
              )}
            </div>
          )}
        </div>
  );
}
