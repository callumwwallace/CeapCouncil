'use client';

import { useState, useRef, useEffect } from 'react';
import { Settings, Maximize2, Camera, Play, Loader2, RotateCcw, Save, Sun, Moon, Monitor } from 'lucide-react';
import ConfigSelect, { ConfigSelectOption } from './ConfigSelect';
import MultiAssetSelector from './MultiAssetSelector';
import { useThemeStore, type Theme } from '@/stores/themeStore';

export type Interval = '1d' | '1h' | '15m' | '5m' | '1m';

export interface ChartHeaderProps {
  symbol: string;
  additionalSymbols: string[];
  interval: Interval;
  symbolOptions?: ConfigSelectOption[];
  onSymbolChange: (symbol: string) => void;
  onAdditionalSymbolsChange: (symbols: string[]) => void;
  onIntervalChange: (interval: Interval) => void;
  onRun: () => void;
  onCancel?: () => void;
  isRunning: boolean;
  canRun: boolean;
  runDisabledReason?: string;
  onReset?: () => void;
  onSave?: () => void;
  isSaving?: boolean;
  saveMessage?: string | null;
  isAuthenticated?: boolean;
  onFullscreen?: () => void;
  onScreenshot?: () => void;
}

/** TradingView-style header: asset search, interval, chart controls, run */
const THEME_OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

export default function ChartHeader({
  symbol,
  additionalSymbols,
  interval,
  onSymbolChange,
  onAdditionalSymbolsChange,
  onIntervalChange,
  onRun,
  onCancel,
  isRunning,
  canRun,
  runDisabledReason,
  onReset,
  onSave,
  isSaving,
  saveMessage,
  isAuthenticated,
  onFullscreen,
  onScreenshot,
}: ChartHeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setSettingsOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  return (
    <div className="h-11 flex items-center justify-between px-4 border-b border-gray-200 bg-white gap-4">
      {/* Left: Asset + Interval - TradingView style */}
      <div className="flex items-center gap-3 flex-1 min-w-0 overflow-visible">
        <MultiAssetSelector
          primarySymbol={symbol}
          additionalSymbols={additionalSymbols}
          onPrimaryChange={onSymbolChange}
          onAdditionalSymbolsChange={onAdditionalSymbolsChange}
        />
        <div className="h-4 w-px bg-gray-200" aria-hidden />
        <ConfigSelect
          value={interval}
          onChange={(v) => onIntervalChange(v as Interval)}
          light
          options={[
            { value: '1d', label: '1D' },
            { value: '1h', label: '1H' },
            { value: '15m', label: '15m' },
            { value: '5m', label: '5m' },
            { value: '1m', label: '1m' },
          ]}
          small
        />
      </div>

      {/* Right: Run + Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {isRunning ? (
          <button
            onClick={onCancel}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-amber-600 hover:bg-amber-50 border border-amber-300 text-sm font-medium"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Cancel
          </button>
        ) : (
          <button
            onClick={onRun}
            disabled={!canRun}
            title={runDisabledReason}
            className="flex items-center gap-2 px-4 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium"
          >
            <Play className="h-4 w-4" />
            Run
          </button>
        )}
        <div className="h-4 w-px bg-gray-200" aria-hidden />
        {onReset && (
          <button onClick={onReset} className="p-2 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition" title="Reset">
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
        {isAuthenticated && onSave && (
          <div className="relative">
            <button onClick={onSave} disabled={isSaving} className="p-2 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition disabled:opacity-50" title="Save">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </button>
            {saveMessage && (
              <div className="absolute top-full right-0 mt-1 px-2 py-1 bg-gray-800 text-xs text-gray-100 rounded whitespace-nowrap z-10">
                {saveMessage}
              </div>
            )}
          </div>
        )}
        <div className="relative" ref={settingsRef}>
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className={`p-2 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition ${settingsOpen ? 'bg-gray-100 text-gray-900' : ''}`}
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          {settingsOpen && (
            <div className="absolute right-0 top-full mt-1 py-1.5 min-w-[140px] bg-white border border-gray-200 rounded-lg shadow-xl z-50">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Theme</div>
              {THEME_OPTIONS.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  onClick={() => {
                    setTheme(value);
                    setSettingsOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition ${theme === value ? 'text-emerald-600 bg-gray-100' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={onFullscreen}
          className="p-2 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition"
          title="Full screen"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        <button
          onClick={onScreenshot}
          className="p-2 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition"
          title="Screenshot"
        >
          <Camera className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
