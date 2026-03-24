'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X, ChevronDown, Check } from 'lucide-react';
import api from '@/lib/api';
import { ASSET_TYPES, ASSETS_BY_TYPE } from './AssetSelector';
import type { AssetType } from './AssetSelector';

interface MultiAssetSelectorProps {
  primarySymbol: string;
  additionalSymbols: string[];
  onPrimaryChange: (symbol: string) => void;
  onAdditionalSymbolsChange: (symbols: string[]) => void;
}

export default function MultiAssetSelector({
  primarySymbol,
  additionalSymbols,
  onPrimaryChange,
  onAdditionalSymbolsChange,
}: MultiAssetSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AssetType>('stocks');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<{ value: string; label: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const allSelected = primarySymbol ? [primarySymbol, ...additionalSymbols] : additionalSymbols;

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Symbol search API
  useEffect(() => {
    if (!search || search.length < 1) { setSearchResults([]); return; }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.searchSymbols(search);
        setSearchResults((res.results || []).map(r => ({ value: r.symbol, label: r.name || r.symbol })));
      } catch {
        setSearchResults([]);
      }
      setIsSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const toggle = (ticker: string) => {
    if (ticker === primarySymbol) {
      // Removing primary: promote first additional, or reset to AAPL
      if (additionalSymbols.length > 0) {
        onPrimaryChange(additionalSymbols[0]);
        onAdditionalSymbolsChange(additionalSymbols.slice(1));
      } else {
        onPrimaryChange('AAPL');
      }
    } else if (additionalSymbols.includes(ticker)) {
      onAdditionalSymbolsChange(additionalSymbols.filter(s => s !== ticker));
    } else {
      // Add: first symbol becomes primary, rest become additional
      if (!primarySymbol) {
        onPrimaryChange(ticker);
      } else {
        onAdditionalSymbolsChange([...additionalSymbols, ticker]);
      }
    }
  };

  const removeTag = (ticker: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toggle(ticker);
  };

  const assets = ASSETS_BY_TYPE[activeTab];
  const displayList = search
    ? (searchResults.length > 0
        ? searchResults
        : assets.filter(a =>
            a.value.toLowerCase().includes(search.toLowerCase()) ||
            a.label.toLowerCase().includes(search.toLowerCase())))
    : assets;

  return (
    <div ref={wrapperRef} className="relative">
      {/* Trigger */}
      <div
        className={`flex items-center gap-1.5 h-8 min-w-[160px] px-2 bg-white border rounded-lg cursor-text transition-colors duration-150 overflow-hidden ${
          isOpen
            ? 'border-emerald-500'
            : 'border-gray-200 hover:border-gray-300'
        }`}
        onClick={() => { setIsOpen(true); setTimeout(() => inputRef.current?.focus(), 10); }}
      >
        <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        <div className="flex gap-1 flex-1 min-w-0 items-center overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {allSelected.map((ticker, idx) => (
            <span
              key={ticker}
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-semibold font-mono shrink-0 ${
                idx === 0
                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                  : 'bg-gray-100 text-gray-700 border border-gray-200'
              }`}
            >
              {ticker}
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => removeTag(ticker, e)}
                className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors ml-0.5 shrink-0"
              >
                <X className="h-2 w-2" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            className="min-w-[2px] w-4 flex-1 border-none outline-none text-xs text-gray-900 bg-transparent caret-emerald-500 placeholder-gray-300"
            placeholder={allSelected.length === 0 ? 'Search assets…' : ''}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setIsOpen(true)}
            onClick={e => e.stopPropagation()}
          />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {allSelected.length > 1 && (
            <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
              {allSelected.length}
            </span>
          )}
          <div className={`w-5 h-5 flex items-center justify-center rounded border transition-all duration-200 ${isOpen ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}>
            <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${isOpen ? 'rotate-180 text-emerald-600' : 'text-gray-400'}`} />
          </div>
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full mt-1.5 left-0 z-[100] w-[340px] bg-white border border-gray-200 rounded-xl shadow-2xl shadow-black/10">
          {/* Tabs */}
          <div className="flex gap-0 px-3 pt-2 border-b border-gray-200 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {ASSET_TYPES.map(t => (
              <button
                key={t.id}
                onMouseDown={e => e.preventDefault()}
                onClick={() => { setActiveTab(t.id); setSearch(''); }}
                className={`px-2.5 py-1.5 -mb-px text-[11px] font-semibold transition-colors whitespace-nowrap rounded-t-md border ${
                  activeTab === t.id
                    ? 'text-emerald-600 bg-white border-gray-200 border-b-white'
                    : 'text-gray-500 border-transparent hover:text-gray-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Asset list */}
          <div className="max-h-[280px] overflow-y-auto overflow-x-hidden" style={{ scrollbarWidth: 'thin' }}>
            <div className="py-1">
              <div className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                {search
                  ? 'Results'
                  : activeTab === 'stocks'
                    ? 'Popular'
                    : ASSET_TYPES.find(t => t.id === activeTab)?.label}
              </div>
              {displayList.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-400">
                  {isSearching ? 'Searching…' : `No results${search ? ` for "${search}"` : ''}`}
                </div>
              ) : (
                displayList.slice(0, 20).map(a => {
                  const isSelected = allSelected.includes(a.value);
                  const isPrimary = a.value === primarySymbol;
                  return (
                    <div
                      key={a.value}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => toggle(a.value)}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer border-l-[3px] transition-colors ${
                        isSelected
                          ? 'bg-emerald-50/70 border-l-emerald-500'
                          : 'border-l-transparent hover:bg-gray-50'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border-[1.5px] flex items-center justify-center shrink-0 transition-all ${
                        isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 bg-white'
                      }`}>
                        {isSelected && <Check className="h-2.5 w-2.5 text-white" strokeWidth={2.5} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-[13px] font-semibold font-mono tracking-wide ${isSelected ? 'text-emerald-700' : 'text-gray-900'}`}>
                          {a.value}
                        </div>
                        {a.label !== a.value && (
                          <div className="text-[11px] text-gray-500 truncate">{a.label}</div>
                        )}
                      </div>
                      {isPrimary && (
                        <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-600 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded shrink-0">
                          Primary
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-gray-50/80">
            <span className="text-[11px] text-gray-500">
              <b className="text-gray-900 font-semibold">{allSelected.length}</b> asset{allSelected.length !== 1 ? 's' : ''} selected
            </span>
            <div className="flex gap-2">
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onPrimaryChange('AAPL'); onAdditionalSymbolsChange([]); }}
                className="text-[11px] text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition font-medium"
              >
                Clear all
              </button>
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={() => { setIsOpen(false); setSearch(''); }}
                className="text-[11px] text-white bg-emerald-500 hover:bg-emerald-600 px-3 py-1.5 rounded-lg transition font-medium shadow-sm"
              >
                Apply →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
