'use client';

import { useState, useCallback, useEffect } from 'react';
import { FlaskConical } from 'lucide-react';
import Link from 'next/link';
import SignInPrompt from '@/components/auth/SignInPrompt';
import LabGroupsGrid from '@/components/lab/LabGroupsGrid';
import LabStrategiesList from '@/components/lab/LabStrategiesList';
import LabBookModal, { type BookModalView } from '@/components/lab/LabBookModal';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import type { Strategy } from '@/types';
import { DEFAULT_CODE } from '@/app/playground/strategyTemplates';

export default function LabPage() {
  const { isAuthenticated } = useAuthStore();
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [strategiesLoading, setStrategiesLoading] = useState(false);
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [bookModalView, setBookModalView] = useState<BookModalView>('code');
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [selectedTemplateName, setSelectedTemplateName] = useState<string | null>(null);

  useEffect(() => {
    if (selectedGroupId !== null) {
      setStrategiesLoading(true);
      api
        .getMyStrategies({ group_id: selectedGroupId })
        .then(setStrategies)
        .catch(() => setStrategies([]))
        .finally(() => setStrategiesLoading(false));
    } else {
      setStrategies([]);
    }
  }, [selectedGroupId]);

  const handleSelectGroup = useCallback((groupName: string, _custom: boolean, groupId?: number) => {
    setSelectedGroup(groupName);
    setSelectedGroupId(groupId ?? null);
  }, []);

  const handleOpenStrategy = useCallback((item: Strategy) => {
    setSelectedStrategy(item);
    setSelectedTemplateName(null);
    setBookModalView('code');
    setBookModalOpen(true);
  }, []);

  const handleCreateStrategy = useCallback(
    async (name: string) => {
      if (!selectedGroupId || !isAuthenticated) return;
      const title = name.endsWith('.py') ? name.slice(0, -3) : name;
      try {
        const created = await api.createStrategy({
          title,
          code: DEFAULT_CODE,
          parameters: {},
          group_id: selectedGroupId,
        });
        setStrategies((prev) => [created, ...prev]);
      } catch {
        // API handles it
      }
    },
    [selectedGroupId, isAuthenticated]
  );

  const handleStrategySaved = useCallback(() => {
    if (selectedStrategy && selectedGroupId) {
      api.getMyStrategies({ group_id: selectedGroupId }).then(setStrategies).catch(() => {});
    }
  }, [selectedStrategy, selectedGroupId]);

  const handleRenameStrategy = useCallback(
    async (id: number, newTitle: string) => {
      await api.updateStrategy(id, { title: newTitle });
      setStrategies((prev) => prev.map((s) => (s.id === id ? { ...s, title: newTitle } : s)));
    },
    []
  );

  const handleToggleForumEmbed = useCallback(async (id: number, isPublic: boolean) => {
    await api.updateStrategy(id, { is_public: isPublic });
    setStrategies((prev) => prev.map((s) => (s.id === id ? { ...s, is_public: isPublic } : s)));
  }, []);

  const handleDeleteStrategy = useCallback(async (id: number) => {
    await api.deleteStrategy(id);
    setStrategies((prev) => prev.filter((s) => s.id !== id));
    if (selectedStrategy?.id === id) setBookModalOpen(false);
  }, [selectedStrategy?.id]);

  const handleBack = useCallback(() => {
    setSelectedGroup(null);
    setSelectedGroupId(null);
  }, []);
  const handleCloseModal = useCallback(() => setBookModalOpen(false), []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 w-full flex-1 flex flex-col">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <FlaskConical className="h-8 w-8 text-emerald-600" />
            Lab
          </h1>
          <p className="mt-2 text-gray-600">
            Manage, group, and organize your strategies. Create custom groups to keep them organized.
          </p>
          {!isAuthenticated && (
            <div className="mt-4">
              <SignInPrompt
                title="Sign in to use the Lab"
                subtitle="Create groups, save strategies, and share them in the community."
              />
            </div>
          )}
        </div>
        <div className="flex-1">
          {selectedGroup === null ? (
            <LabGroupsGrid
              onSelectGroup={handleSelectGroup}
              onGroupDeleted={(id) => { if (id === selectedGroupId) { setSelectedGroup(null); setSelectedGroupId(null); } }}
              isAuthenticated={isAuthenticated}
            />
          ) : (
            <LabStrategiesList
              groupName={selectedGroup ?? ''}
              strategies={strategies}
              strategiesLoading={strategiesLoading}
              isCustomGroup={true}
              onBack={handleBack}
              onOpenStrategy={handleOpenStrategy}
              onCreateStrategy={isAuthenticated ? handleCreateStrategy : undefined}
              onRenameStrategy={handleRenameStrategy}
              onDeleteStrategy={handleDeleteStrategy}
              onToggleForumEmbed={handleToggleForumEmbed}
            />
          )}
        </div>
      </div>
      <LabBookModal
        isOpen={bookModalOpen}
        onClose={handleCloseModal}
        groupName={selectedGroup ?? ''}
        strategy={selectedStrategy}
        templateName={selectedTemplateName}
        initialView={bookModalView}
        onSaved={handleStrategySaved}
      />
    </div>
  );
}
