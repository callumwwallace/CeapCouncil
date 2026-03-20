'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, Keyboard, Clock, ChevronDown, ZoomIn, ZoomOut } from 'lucide-react';

interface StatusBarProps {
  isRunning: boolean;
  results: {
    total_return: number;
    sharpe_ratio: number;
    max_drawdown: number;
    total_trades: number;
  } | null;
  lastRunTime?: string;
  onExportReport?: () => void;
  onExportJSON?: () => void;
  uiScale?: number;
  onUiScaleChange?: (scale: number) => void;
}

export default function StatusBar({ isRunning, results, lastRunTime, onExportReport, onExportJSON, uiScale = 1, onUiScaleChange }: StatusBarProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number } | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const updateDropdownPosition = () => {
    const btn = exportRef.current?.querySelector('button');
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const dropdownHeight = 80;
      const dropdownWidth = 120;
      const top = Math.max(8, rect.top - dropdownHeight - 8);
      const left = Math.max(8, Math.min(rect.right - dropdownWidth, window.innerWidth - dropdownWidth - 8));
      setDropdownRect({ top, left });
    }
  };

  const handleExportToggle = () => {
    if (!exportOpen) updateDropdownPosition();
    setExportOpen(!exportOpen);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        exportRef.current && !exportRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) setExportOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  return (
    <div className="h-8 bg-white border-t border-gray-200 px-4 flex items-center justify-between text-xs">
      {/* Left: Status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-yellow-500 animate-pulse' : results ? 'bg-emerald-500' : 'bg-gray-400'}`} />
          <span className="text-gray-600">
            {isRunning ? 'Running...' : results ? 'Complete' : 'Ready'}
          </span>
        </div>
        
        {lastRunTime && !isRunning && (
          <div className="flex items-center gap-1 text-gray-500">
            <Clock className="h-3 w-3" />
            <span>{lastRunTime}</span>
          </div>
        )}
      </div>

      {/* Right: Export, Shortcuts, UI Scale */}
      <div className="flex items-center gap-3">
        {results && (onExportReport || onExportJSON) && (
          <div ref={exportRef}>
            <button
              onClick={handleExportToggle}
              className="flex items-center gap-1 text-gray-500 hover:text-gray-900 transition"
              title="Export Results"
            >
              <Download className="h-3 w-3" />
              <span>Export</span>
              <ChevronDown className={`h-3 w-3 transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
            </button>
            {exportOpen && dropdownRect && typeof document !== 'undefined' && createPortal(
              <div
                ref={dropdownRef}
                className="fixed py-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[9999] min-w-[120px]"
                style={{ top: dropdownRect.top, left: dropdownRect.left }}
              >
                {onExportReport && (
                  <button
                    onClick={() => { onExportReport(); setExportOpen(false); }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition"
                  >
                    Report (HTML)
                  </button>
                )}
                {onExportJSON && (
                  <button
                    onClick={() => { onExportJSON(); setExportOpen(false); }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition"
                  >
                    JSON
                  </button>
                )}
              </div>,
              document.body
            )}
          </div>
        )}
        <div className="flex items-center gap-1 text-gray-500" title="Keyboard shortcuts">
          <Keyboard className="h-3 w-3" />
          <span>Ctrl+↵ Run · Ctrl+S Save · Ctrl+⇧E Export</span>
        </div>
        {onUiScaleChange && (
          <div className="flex items-center gap-0.5 border-l border-gray-200 pl-3" title="UI scale (panels only, chart unaffected)">
            <button
              type="button"
              onClick={() => onUiScaleChange(Math.max(0.75, uiScale - 0.1))}
              className="p-0.5 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              aria-label="Decrease UI size"
            >
              <ZoomOut className="h-3 w-3" />
            </button>
            <span className="text-[10px] text-gray-500 tabular-nums w-6 text-center">{Math.round(uiScale * 100)}%</span>
            <button
              type="button"
              onClick={() => onUiScaleChange(Math.min(1.25, uiScale + 0.1))}
              className="p-0.5 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              aria-label="Increase UI size"
            >
              <ZoomIn className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
