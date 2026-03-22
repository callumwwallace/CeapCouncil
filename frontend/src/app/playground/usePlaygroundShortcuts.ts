import { useEffect } from 'react';

export interface UsePlaygroundShortcutsOptions {
  isRunning: boolean;
  isAuthenticated: boolean;
  savedStrategyId: number | null;
  isSaving: boolean;
  results: unknown;
  onRun: () => void;
  onSave: () => void;
  onExport: () => void;
}

// Ctrl+Enter to run, Ctrl+S to save, Ctrl+Shift+E to export
export function usePlaygroundShortcuts({
  isRunning,
  isAuthenticated,
  savedStrategyId,
  isSaving,
  results,
  onRun,
  onSave,
  onExport,
}: UsePlaygroundShortcutsOptions): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        if (!isRunning) {
          onRun();
        }
        return;
      }
      // toLowerCase so Caps Lock doesn't break it
      if (e.key.toLowerCase() === 's' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        if (isAuthenticated && savedStrategyId && !isSaving) {
          onSave();
        }
        return;
      }
      if (e.key === 'E' && e.shiftKey && results) {
        e.preventDefault();
        onExport();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isRunning,
    isAuthenticated,
    savedStrategyId,
    isSaving,
    results,
    onRun,
    onSave,
    onExport,
  ]);
}
