'use client';

import { useState, useEffect, useRef } from 'react';
import { FolderPlus, X, Loader2, Share2, Check, Copy, Search, Pencil, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import type { StrategyGroup } from '@/types';

interface LabGroupsGridProps {
  onSelectGroup: (groupName: string, isCustom: boolean, groupId?: number) => void;
  onGroupDeleted?: (groupId: number) => void;
  isAuthenticated: boolean;
}

export default function LabGroupsGrid({ onSelectGroup, onGroupDeleted, isAuthenticated }: LabGroupsGridProps) {
  const [myGroups, setMyGroups] = useState<StrategyGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [editModalGroupId, setEditModalGroupId] = useState<number | null>(null);
  const [editModalName, setEditModalName] = useState('');
  const [editModalDescription, setEditModalDescription] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [deleteConfirmGroupId, setDeleteConfirmGroupId] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [shareMenuGroupId, setShareMenuGroupId] = useState<number | null>(null);
  const [shareToggling, setShareToggling] = useState(false);
  const [copied, setCopied] = useState<'link' | 'embed' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const shareMenuRef = useRef<HTMLDivElement>(null);

  const filteredGroups = searchQuery.trim()
    ? myGroups.filter((g) => g.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : myGroups;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) {
        setShareMenuGroupId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const refetchGroups = async () => {
    if (!isAuthenticated) return;
    setGroupsLoading(true);
    try {
      const groups = await api.getStrategyGroups();
      setMyGroups(groups);
    } catch {
      setMyGroups([]);
    } finally {
      setGroupsLoading(false);
    }
  };

  useEffect(() => {
    refetchGroups();
  }, [isAuthenticated]);

  const handleCreateGroup = async () => {
    const name = newGroupName.trim() || 'New group';
    if (!name) return;
    setCreateLoading(true);
    try {
      await api.createStrategyGroup({
        name,
        description: newGroupDescription.trim() || null,
      });
      setNewGroupName('');
      setNewGroupDescription('');
      setShowCreateModal(false);
      await refetchGroups();
    } catch {
      setCreateLoading(false);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleOpenEditModal = (group: StrategyGroup) => {
    setShareMenuGroupId(null);
    setEditModalGroupId(group.id);
    setEditModalName(group.name);
    setEditModalDescription(group.description ?? '');
  };

  const handleSaveEdit = async () => {
    if (editModalGroupId === null || !editModalName.trim()) return;
    setEditLoading(true);
    try {
      const updated = await api.updateStrategyGroup(editModalGroupId, {
        name: editModalName.trim(),
        description: editModalDescription.trim() || null,
      });
      setMyGroups((prev) => prev.map((g) => (g.id === editModalGroupId ? { ...g, ...updated } : g)));
      setEditModalGroupId(null);
      setEditModalName('');
      setEditModalDescription('');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteGroup = async (groupId: number) => {
    setDeleteLoading(true);
    try {
      await api.deleteStrategyGroup(groupId);
      setMyGroups((prev) => prev.filter((g) => g.id !== groupId));
      setDeleteConfirmGroupId(null);
      onGroupDeleted?.(groupId);
    } catch {
      setDeleteLoading(false);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleToggleShare = async (group: StrategyGroup) => {
    if (group.is_shareable && !confirm('Stop sharing this group? Existing forum embeds will no longer work.')) {
      return;
    }
    setShareToggling(true);
    try {
      const updated = await api.updateStrategyGroup(group.id, { is_shareable: !group.is_shareable });
      setMyGroups((prev) => prev.map((g) => (g.id === group.id ? { ...g, is_shareable: updated.is_shareable, share_token: updated.share_token } : g)));
      if (updated.is_shareable) setShareMenuGroupId(group.id);
    } catch {
      // API will surface the error
    } finally {
      setShareToggling(false);
    }
  };

  const handleCopyLink = (group: StrategyGroup) => {
    const url = typeof window !== 'undefined' ? `${window.location.origin}/community?group=${group.share_token}` : '';
    navigator.clipboard.writeText(url);
    setCopied('link');
    setTimeout(() => setCopied(null), 2000);
  };

  const handleCopyEmbed = (group: StrategyGroup) => {
    navigator.clipboard.writeText(`[group:${group.share_token}|${group.name}]`);
    setCopied('embed');
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="w-full">
      {isAuthenticated && myGroups.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search groups..."
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
          />
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groupsLoading ? (
            <div className="col-span-full flex items-center justify-center py-12 text-gray-500">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : filteredGroups.length === 0 ? (
            isAuthenticated ? (
              <div className="col-span-full py-12 text-center text-gray-500 text-sm">
                {searchQuery.trim() ? `No groups match "${searchQuery}"` : 'No groups yet'}
              </div>
            ) : null
          ) : (
            <>
          {filteredGroups.map((group) => (
            <div
              key={group.id}
              className="group relative rounded-xl border border-gray-200 bg-white p-5
                hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-900/5
                hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  onClick={() => onSelectGroup(group.name, true, group.id)}
                  className="flex-1 min-w-0 text-left flex items-start gap-3"
                >
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center
                    text-emerald-600 group-hover:bg-emerald-100 transition-colors shrink-0">
                    <FolderPlus className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-900 group-hover:text-emerald-700 transition-colors">
                      {group.name}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                      {group.description || (group.is_default ? 'Default' : 'Custom group')}
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  {!group.is_default && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleOpenEditModal(group); }}
                        className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
                        title="Edit group"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirmGroupId(group.id); }}
                        className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                        title="Delete group"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  <div
                    ref={shareMenuGroupId === group.id ? shareMenuRef : undefined}
                    className="relative"
                  >
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setShareMenuGroupId(shareMenuGroupId === group.id ? null : group.id); }}
                      className={`p-1.5 rounded-md transition ${group.is_shareable ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                      disabled={shareToggling}
                      title={group.is_shareable ? 'Shared' : 'Share this group'}
                    >
                      <Share2 className="h-4 w-4" />
                    </button>
                    {shareMenuGroupId === group.id && (
                      <div className="absolute right-0 top-full mt-1 py-1 bg-white rounded-lg border border-gray-200 shadow-lg z-50 min-w-[180px]">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleToggleShare(group); }}
                          disabled={shareToggling}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between"
                        >
                          {group.is_shareable ? 'Stop sharing' : 'Share this group'}
                          {shareToggling && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        </button>
                        {group.is_shareable && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleCopyLink(group); }}
                              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                            >
                              {copied === 'link' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                              Copy link
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleCopyEmbed(group); }}
                              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                            >
                              {copied === 'embed' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                              Copy forum embed
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {isAuthenticated && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="group text-left rounded-xl border border-gray-200 bg-white p-5
              hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-900/5
              hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center
                text-emerald-600 group-hover:bg-emerald-100 transition-colors shrink-0">
                <FolderPlus className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 group-hover:text-emerald-700 transition-colors">
                  Create new group
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Organize your strategies into custom groups
                </p>
              </div>
            </div>
          </button>
          )}
          </>
          )}
      </div>

      {editModalGroupId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditModalGroupId(null)} aria-hidden />
          <div className="relative w-full max-w-sm bg-white rounded-xl border border-gray-200 shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Edit group</h3>
              <button onClick={() => setEditModalGroupId(null)} className="p-1 text-gray-500 hover:text-gray-900 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>
            <input
              type="text"
              value={editModalName}
              onChange={(e) => setEditModalName(e.target.value)}
              placeholder="Group name"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 mb-3"
            />
            <textarea
              value={editModalDescription}
              onChange={(e) => setEditModalDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 mb-4 resize-none"
            />
            <button
              onClick={handleSaveEdit}
              disabled={editLoading || !editModalName.trim()}
              className="w-full py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {editLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </button>
          </div>
        </div>
      )}

      {deleteConfirmGroupId !== null && (() => {
        const group = myGroups.find((g) => g.id === deleteConfirmGroupId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteConfirmGroupId(null)} aria-hidden />
            <div className="relative w-full max-w-sm bg-white rounded-xl border border-gray-200 shadow-xl p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Delete group</h3>
              <p className="text-sm text-gray-600 mb-4">
                Delete &quot;{group?.name ?? 'this group'}&quot;? Strategies inside will be moved to My Strategies.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeleteConfirmGroupId(null)}
                  className="flex-1 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteConfirmGroupId && handleDeleteGroup(deleteConfirmGroupId)}
                  disabled={deleteLoading}
                  className="flex-1 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCreateModal(false)} aria-hidden />
          <div className="relative w-full max-w-sm bg-white rounded-xl border border-gray-200 shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Create new group</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-gray-500 hover:text-gray-900 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Group name (e.g. My strategies)"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 mb-3"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
              autoFocus
            />
            <textarea
              value={newGroupDescription}
              onChange={(e) => setNewGroupDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 mb-4 resize-none"
            />
            <button
              onClick={handleCreateGroup}
              disabled={createLoading}
              className="w-full py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {createLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
