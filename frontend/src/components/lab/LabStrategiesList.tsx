'use client';

import { useState } from 'react';
import { ArrowLeft, FileCode, Plus, Loader2, Search, Pencil, Trash2, Share2 } from 'lucide-react';
import type { Strategy } from '@/types';

interface LabStrategiesListProps {
  groupName: string;
  strategies: Strategy[];
  strategiesLoading?: boolean;
  isCustomGroup: boolean;
  onBack: () => void;
  onOpenStrategy: (item: Strategy) => void;
  onCreateStrategy?: (name: string) => void;
  onRenameStrategy?: (id: number, newTitle: string) => Promise<void>;
  onDeleteStrategy?: (id: number) => Promise<void>;
  onToggleForumEmbed?: (id: number, isPublic: boolean) => Promise<void>;
}

export default function LabStrategiesList({
  groupName,
  strategies,
  strategiesLoading = false,
  isCustomGroup,
  onBack,
  onOpenStrategy,
  onCreateStrategy,
  onRenameStrategy,
  onDeleteStrategy,
  onToggleForumEmbed,
}: LabStrategiesListProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newStrategyName, setNewStrategyName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingStrategyId, setEditingStrategyId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [embedTogglingId, setEmbedTogglingId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const filteredStrategies = searchQuery.trim()
    ? strategies.filter((s) => s.title.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : strategies;

  const handleCreate = () => {
    const name = newStrategyName.trim();
    if (!name || !onCreateStrategy) return;
    onCreateStrategy(name);
    setNewStrategyName('');
    setShowCreateModal(false);
  };

  const handleStartRename = (item: Strategy) => {
    setEditingStrategyId(item.id);
    setEditingTitle(item.title);
  };

  const handleSaveRename = async () => {
    if (editingStrategyId === null || !onRenameStrategy || !editingTitle.trim()) {
      setEditingStrategyId(null);
      return;
    }
    setActionLoading(true);
    try {
      await onRenameStrategy(editingStrategyId, editingTitle.trim());
      setEditingStrategyId(null);
      setEditingTitle('');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleForumEmbed = async (item: Strategy) => {
    if (!onToggleForumEmbed) return;
    setEmbedTogglingId(item.id);
    try {
      await onToggleForumEmbed(item.id, !item.is_public);
    } finally {
      setEmbedTogglingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirmId === null || !onDeleteStrategy) return;
    setActionLoading(true);
    try {
      await onDeleteStrategy(deleteConfirmId);
      setDeleteConfirmId(null);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-4 mb-6">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-emerald-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to groups
        </button>
        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full">
          {groupName}
        </span>
      </div>
      {strategies.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search strategies..."
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
          />
        </div>
      )}
      <div className="space-y-3">
        {strategiesLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : filteredStrategies.length === 0 && searchQuery.trim() ? (
          <div className="py-12 text-center text-gray-500 text-sm">
            No strategies match &quot;{searchQuery}&quot;
          </div>
        ) : filteredStrategies.length === 0 ? null : (
          filteredStrategies.map((item) => {
            const isEditing = editingStrategyId === item.id;
            return (
              <div
                key={item.id}
                className="group w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 bg-white
                  hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-900/5
                  hover:-translate-y-0.5 transition-all duration-200"
              >
                <button
                  onClick={() => !isEditing && onOpenStrategy(item)}
                  className="flex-1 min-w-0 flex items-center gap-4 text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center
                    text-emerald-600 group-hover:bg-emerald-100 transition-colors shrink-0">
                    <FileCode className="h-5 w-5" />
                  </div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={handleSaveRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename();
                        if (e.key === 'Escape') { setEditingStrategyId(null); setEditingTitle(''); }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 px-2 py-1 text-sm font-mono border border-emerald-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                      autoFocus
                    />
                  ) : (
                    <span className="flex-1 font-mono text-sm font-medium text-gray-900 min-w-0 truncate">
                      {item.title}
                    </span>
                  )}
                </button>
                {isCustomGroup && onRenameStrategy && onDeleteStrategy && !isEditing && (
                  <div className="flex items-center gap-1 shrink-0">
                    {onToggleForumEmbed && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleToggleForumEmbed(item); }}
                        disabled={embedTogglingId === item.id}
                        className={`p-1.5 rounded-md transition disabled:opacity-50 ${item.is_public ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                        title={item.is_public ? 'Forum embed enabled' : 'Enable forum embed'}
                      >
                        {embedTogglingId === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Share2 className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleStartRename(item); }}
                      className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
                      title="Rename"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(item.id); }}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
        {isCustomGroup && onCreateStrategy && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="group w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 bg-white text-left
              hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-900/5
              hover:-translate-y-0.5 transition-all duration-200 border-dashed"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center
              text-emerald-600 group-hover:bg-emerald-100 transition-colors shrink-0">
              <Plus className="h-5 w-5" />
            </div>
            <span className="flex-1 font-medium text-sm text-gray-500 group-hover:text-emerald-600 transition-colors">
              Create new strategy
            </span>
          </button>
        )}
      </div>

      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Create strategy</h3>
            <p className="text-sm text-gray-500 mb-4">
              Name your strategy (e.g. my_strategy). The <code className="text-xs bg-gray-100 px-1 rounded">.py</code> extension is added automatically.
            </p>
            <input
              type="text"
              value={newStrategyName}
              onChange={(e) => setNewStrategyName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') setShowCreateModal(false);
              }}
              placeholder="my_strategy"
              className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newStrategyName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg
                  hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmId !== null && (() => {
        const strategy = strategies.find((s) => s.id === deleteConfirmId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeleteConfirmId(null)}>
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete strategy</h3>
              <p className="text-sm text-gray-600 mb-4">
                Delete &quot;{strategy?.title ?? 'this strategy'}&quot;? This cannot be undone.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={actionLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 flex items-center gap-2"
                >
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
