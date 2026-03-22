/**
 * Tests for usePlaygroundShortcuts hook.
 *
 * Bugs/edge cases identified and addressed:
 * - Caps Lock: Ctrl+S with Caps Lock produces key='S'; fixed by using toLowerCase()
 * - Ctrl+Shift+S: Excluded via !e.shiftKey to reserve for potential "Save As"
 * - preventDefault: Always called for Ctrl+S to avoid browser save dialog
 * - Export without results: No-op, no preventDefault
 * - Listener cleanup: Verified on unmount
 */
import '@testing-library/jest-dom';
import { renderHook } from '@testing-library/react';
import { usePlaygroundShortcuts } from '@/app/playground/usePlaygroundShortcuts';

function fireKeyDown(init: Partial<KeyboardEventInit>) {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  window.dispatchEvent(event);
  return event;
}

describe('usePlaygroundShortcuts', () => {
  const mockOnRun = jest.fn();
  const mockOnSave = jest.fn();
  const mockOnExport = jest.fn();

  const defaultOptions = {
    isRunning: false,
    isAuthenticated: true,
    savedStrategyId: 1,
    isSaving: false,
    results: { total_return: 10 },
    onRun: mockOnRun,
    onSave: mockOnSave,
    onExport: mockOnExport,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Ctrl/Cmd+Enter (run backtest)', () => {
    it('calls onRun when Ctrl+Enter pressed and can run', () => {
      renderHook(() => usePlaygroundShortcuts(defaultOptions));
      fireKeyDown({ key: 'Enter', ctrlKey: true });
      expect(mockOnRun).toHaveBeenCalledTimes(1);
    });

    it('calls onRun when Cmd+Enter pressed on Mac', () => {
      renderHook(() => usePlaygroundShortcuts(defaultOptions));
      fireKeyDown({ key: 'Enter', metaKey: true });
      expect(mockOnRun).toHaveBeenCalledTimes(1);
    });

    it('calls onRun when not authenticated (handler shows sign-in prompt)', () => {
      renderHook(() =>
        usePlaygroundShortcuts({ ...defaultOptions, isAuthenticated: false })
      );
      fireKeyDown({ key: 'Enter', ctrlKey: true });
      expect(mockOnRun).toHaveBeenCalledTimes(1);
    });

    it('does not call onRun when already running', () => {
      renderHook(() =>
        usePlaygroundShortcuts({ ...defaultOptions, isRunning: true })
      );
      fireKeyDown({ key: 'Enter', ctrlKey: true });
      expect(mockOnRun).not.toHaveBeenCalled();
    });

    it('prevents default on Enter', () => {
      renderHook(() => usePlaygroundShortcuts(defaultOptions));
      const event = fireKeyDown({ key: 'Enter', ctrlKey: true });
      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe('Ctrl/Cmd+S (save)', () => {
    it('calls onSave when Ctrl+S pressed and can save', () => {
      renderHook(() => usePlaygroundShortcuts(defaultOptions));
      fireKeyDown({ key: 's', ctrlKey: true });
      expect(mockOnSave).toHaveBeenCalledTimes(1);
    });

    it('calls onSave when Cmd+S pressed on Mac', () => {
      renderHook(() => usePlaygroundShortcuts(defaultOptions));
      fireKeyDown({ key: 's', metaKey: true });
      expect(mockOnSave).toHaveBeenCalledTimes(1);
    });

    it('calls onSave with Caps Lock on (key is "S")', () => {
      renderHook(() => usePlaygroundShortcuts(defaultOptions));
      fireKeyDown({ key: 'S', ctrlKey: true });
      expect(mockOnSave).toHaveBeenCalledTimes(1);
    });

    it('does not call onSave when not authenticated', () => {
      renderHook(() =>
        usePlaygroundShortcuts({ ...defaultOptions, isAuthenticated: false })
      );
      fireKeyDown({ key: 's', ctrlKey: true });
      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('does not call onSave when no saved strategy', () => {
      renderHook(() =>
        usePlaygroundShortcuts({ ...defaultOptions, savedStrategyId: null })
      );
      fireKeyDown({ key: 's', ctrlKey: true });
      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('does not call onSave when already saving', () => {
      renderHook(() =>
        usePlaygroundShortcuts({ ...defaultOptions, isSaving: true })
      );
      fireKeyDown({ key: 's', ctrlKey: true });
      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('prevents default on Ctrl+S even when save not available', () => {
      renderHook(() =>
        usePlaygroundShortcuts({ ...defaultOptions, savedStrategyId: null })
      );
      const event = fireKeyDown({ key: 's', ctrlKey: true });
      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe('Ctrl/Cmd+Shift+E (export)', () => {
    it('calls onExport when Ctrl+Shift+E pressed and results exist', () => {
      renderHook(() => usePlaygroundShortcuts(defaultOptions));
      fireKeyDown({ key: 'E', ctrlKey: true, shiftKey: true });
      expect(mockOnExport).toHaveBeenCalledTimes(1);
    });

    it('calls onExport when Cmd+Shift+E pressed on Mac', () => {
      renderHook(() => usePlaygroundShortcuts(defaultOptions));
      fireKeyDown({ key: 'E', metaKey: true, shiftKey: true });
      expect(mockOnExport).toHaveBeenCalledTimes(1);
    });

    it('does not call onExport when no results', () => {
      renderHook(() =>
        usePlaygroundShortcuts({ ...defaultOptions, results: null })
      );
      fireKeyDown({ key: 'E', ctrlKey: true, shiftKey: true });
      expect(mockOnExport).not.toHaveBeenCalled();
    });

    it('does not call onExport without Shift (Ctrl+E)', () => {
      renderHook(() => usePlaygroundShortcuts(defaultOptions));
      fireKeyDown({ key: 'E', ctrlKey: true });
      expect(mockOnExport).not.toHaveBeenCalled();
    });

    it('prevents default on Ctrl+Shift+E when results exist', () => {
      renderHook(() => usePlaygroundShortcuts(defaultOptions));
      const event = fireKeyDown({ key: 'E', ctrlKey: true, shiftKey: true });
      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('ignores Alt+Enter', () => {
      renderHook(() => usePlaygroundShortcuts(defaultOptions));
      fireKeyDown({ key: 'Enter', altKey: true });
      expect(mockOnRun).not.toHaveBeenCalled();
    });

    it('ignores Enter without modifier', () => {
      renderHook(() => usePlaygroundShortcuts(defaultOptions));
      fireKeyDown({ key: 'Enter' });
      expect(mockOnRun).not.toHaveBeenCalled();
    });

    it('ignores Ctrl+Shift+S (reserved for potential Save As)', () => {
      renderHook(() => usePlaygroundShortcuts(defaultOptions));
      fireKeyDown({ key: 'S', ctrlKey: true, shiftKey: true });
      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('cleans up listener on unmount', () => {
      const addSpy = jest.spyOn(window, 'addEventListener');
      const removeSpy = jest.spyOn(window, 'removeEventListener');
      const { unmount } = renderHook(() => usePlaygroundShortcuts(defaultOptions));
      expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      unmount();
      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      addSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it('handles results as empty object (truthy)', () => {
      renderHook(() =>
        usePlaygroundShortcuts({ ...defaultOptions, results: {} })
      );
      fireKeyDown({ key: 'E', ctrlKey: true, shiftKey: true });
      expect(mockOnExport).toHaveBeenCalledTimes(1);
    });
  });
});
