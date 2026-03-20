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

/**
 * Registers keyboard shortcuts for the Playground:
 * - Ctrl/Cmd+Enter: run backtest
 * - Ctrl/Cmd+S: save strategy
 * - Ctrl/Cmd+Shift+E: export results
 */
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
        if (!isRunning && isAuthenticated) {
          onRun();
        }
        return;
      }
      // Use toLowerCase for Caps Lock compatibility; exclude Shift (Ctrl+Shift+S)
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
