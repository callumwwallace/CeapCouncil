'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, BarChart3, Search } from 'lucide-react';
import api from '@/lib/api';

export type AssetType = 'stocks' | 'crypto' | 'indices' | 'forex' | 'commodities' | 'bonds';

export const ASSET_TYPES: { id: AssetType; label: string }[] = [
  { id: 'stocks', label: 'Stocks' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'indices', label: 'Indices & ETFs' },
  { id: 'forex', label: 'Forex' },
  { id: 'commodities', label: 'Commodities' },
  { id: 'bonds', label: 'Bonds' },
];

export const ASSETS_BY_TYPE: Record<AssetType, { value: string; label: string }[]> = {
  stocks: [
    { value: 'AAPL', label: 'Apple Inc.' },
    { value: 'MSFT', label: 'Microsoft' },
    { value: 'GOOGL', label: 'Alphabet' },
    { value: 'AMZN', label: 'Amazon' },
    { value: 'TSLA', label: 'Tesla' },
    { value: 'META', label: 'Meta Platforms' },
    { value: 'NVDA', label: 'NVIDIA' },
    { value: 'AMD', label: 'AMD' },
    { value: 'NFLX', label: 'Netflix' },
    { value: 'DIS', label: 'Walt Disney' },
    { value: 'BA', label: 'Boeing' },
    { value: 'JPM', label: 'JPMorgan Chase' },
    { value: 'GS', label: 'Goldman Sachs' },
    { value: 'V', label: 'Visa' },
    { value: 'MA', label: 'Mastercard' },
    { value: 'WMT', label: 'Walmart' },
    { value: 'COIN', label: 'Coinbase' },
    { value: 'PLTR', label: 'Palantir' },
  ],
  crypto: [
    { value: 'BTC-USD', label: 'Bitcoin' },
    { value: 'ETH-USD', label: 'Ethereum' },
    { value: 'SOL-USD', label: 'Solana' },
    { value: 'XRP-USD', label: 'Ripple' },
    { value: 'ADA-USD', label: 'Cardano' },
    { value: 'AVAX-USD', label: 'Avalanche' },
    { value: 'DOGE-USD', label: 'Dogecoin' },
    { value: 'MATIC-USD', label: 'Polygon' },
    { value: 'LINK-USD', label: 'Chainlink' },
    { value: 'UNI7083-USD', label: 'Uniswap' },
  ],
  indices: [
    { value: 'SPY', label: 'S&P 500 ETF' },
    { value: 'QQQ', label: 'Nasdaq 100 ETF' },
    { value: 'IWM', label: 'Russell 2000 ETF' },
    { value: 'GLD', label: 'Gold ETF' },
    { value: 'SLV', label: 'Silver ETF' },
    { value: 'TLT', label: '20+ Treasury Bond ETF' },
    { value: 'HYG', label: 'High Yield Bond ETF' },
    { value: 'DIA', label: 'Dow Jones ETF' },
  ],
  forex: [
    { value: 'EURUSD=X', label: 'EUR/USD' },
    { value: 'GBPUSD=X', label: 'GBP/USD' },
    { value: 'USDJPY=X', label: 'USD/JPY' },
    { value: 'AUDUSD=X', label: 'AUD/USD' },
    { value: 'USDCAD=X', label: 'USD/CAD' },
    { value: 'USDCHF=X', label: 'USD/CHF' },
    { value: 'NZDUSD=X', label: 'NZD/USD' },
  ],
  commodities: [
    { value: 'GC=F', label: 'Gold Futures' },
    { value: 'SI=F', label: 'Silver Futures' },
    { value: 'CL=F', label: 'Crude Oil (WTI)' },
    { value: 'BZ=F', label: 'Brent Crude' },
    { value: 'NG=F', label: 'Natural Gas' },
    { value: 'HG=F', label: 'Copper' },
    { value: 'ZC=F', label: 'Corn' },
    { value: 'ZW=F', label: 'Wheat' },
    { value: 'ZS=F', label: 'Soybeans' },
    { value: 'KC=F', label: 'Coffee' },
    { value: 'CC=F', label: 'Cocoa' },
    { value: 'CT=F', label: 'Cotton' },
    { value: 'PL=F', label: 'Platinum' },
    { value: 'PA=F', label: 'Palladium' },
  ],
  bonds: [
    { value: '^TNX', label: '10Y Treasury Yield' },
    { value: '^IRX', label: '13W T-Bill' },
    { value: '^FVX', label: '5Y Treasury Yield' },
    { value: 'TLT', label: '20+ Year Treasury ETF' },
    { value: 'IEF', label: '7-10 Year Treasury ETF' },
    { value: 'SHY', label: '1-3 Year Treasury ETF' },
    { value: 'HYG', label: 'High Yield Corp Bond ETF' },
    { value: 'LQD', label: 'Investment Grade Corp Bond ETF' },
    { value: 'BND', label: 'Total Bond Market ETF' },
    { value: 'AGG', label: 'Aggregate Bond ETF' },
  ],
};

function inferAssetType(symbol: string): AssetType {
  if (['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'ADA-USD', 'AVAX-USD', 'DOGE-USD', 'MATIC-USD', 'LINK-USD', 'UNI7083-USD'].includes(symbol)) {
    return 'crypto';
  }
  if (['SPY', 'QQQ', 'IWM', 'GLD', 'SLV', 'DIA'].includes(symbol)) {
    return 'indices';
  }
  if (['EURUSD=X', 'GBPUSD=X', 'USDJPY=X', 'AUDUSD=X', 'USDCAD=X', 'USDCHF=X', 'NZDUSD=X'].includes(symbol)) {
    return 'forex';
  }
  if (symbol.endsWith('=F') || ['GC=F', 'SI=F', 'CL=F', 'BZ=F', 'NG=F', 'HG=F', 'ZC=F', 'ZW=F', 'ZS=F', 'KC=F', 'CC=F', 'CT=F', 'PL=F', 'PA=F'].includes(symbol)) {
    return 'commodities';
  }
  if (['TLT', 'IEF', 'SHY', 'HYG', 'LQD', 'BND', 'AGG', '^TNX', '^IRX', '^FVX'].includes(symbol)) {
    return 'bonds';
  }
  return 'stocks';
}

interface AssetSelectorProps {
  value: string;
  onChange: (symbol: string) => void;
  className?: string;
  compact?: boolean;
  /** Header variant: compact trigger + dropdown for use in ChartHeader */
  variant?: 'default' | 'header';
}

export default function AssetSelector({ value, onChange, className = '', compact = false, variant = 'default' }: AssetSelectorProps) {
  const [assetType, setAssetType] = useState<AssetType>(() => inferAssetType(value));
  const [search, setSearch] = useState('');
  const [showAssetDropdown, setShowAssetDropdown] = useState(false);
  const [searchResults, setSearchResults] = useState<{ value: string; label: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const assets = ASSETS_BY_TYPE[assetType];
  const currentAsset = assets.find(a => a.value === value) || (value ? { value, label: value } : null);
  const displayValue = assetType === 'forex' && currentAsset?.label
    ? currentAsset.label
    : (currentAsset?.value || value);

  useEffect(() => {
    if (!search || search.length < 1) {
      setSearchResults([]);
      return;
    }
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

  const displayList = searchResults.length > 0
    ? searchResults
    : assets.filter(a => !search || a.value.toUpperCase().includes(search.toUpperCase()) || a.label.toLowerCase().includes(search.toLowerCase()));

  const headerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (variant !== 'header') return;
    const handleClickOutside = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setShowAssetDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [variant]);

  if (variant === 'header') {
    const currentAsset = assets.find(a => a.value === value) || (value ? { value, label: value } : null);
    const headerDisplay = assetType === 'forex' && currentAsset?.label
      ? currentAsset.label
      : (currentAsset?.label || currentAsset?.value || value || 'Select asset');
    return (
      <div ref={headerRef} className={`relative ${className}`}>
        <button
          type="button"
          onClick={() => setShowAssetDropdown(!showAssetDropdown)}
          className="flex items-center gap-2.5 min-w-0 w-[170px] h-8 pl-3 pr-3 rounded-lg bg-white hover:bg-gray-50 border border-gray-200 hover:border-emerald-500/50 transition-all duration-150 group"
        >
          <Search className="h-4 w-4 text-gray-500 group-hover:text-emerald-600 shrink-0 transition-colors" />
          <span className="flex-1 truncate text-left text-sm font-medium text-gray-900">{headerDisplay}</span>
          <ChevronDown className={`h-4 w-4 text-gray-500 shrink-0 transition-transform duration-150 ${showAssetDropdown ? 'rotate-180' : ''}`} />
        </button>
        {showAssetDropdown && (
          <div className="absolute top-full left-0 mt-2 w-80 p-3 bg-white border border-gray-200 rounded-xl shadow-2xl shadow-black/10 z-[100]">
            <div className="grid grid-cols-3 gap-1 p-1 bg-gray-50 rounded-lg mb-3">
              {ASSET_TYPES.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setAssetType(t.id); setSearch(''); const first = ASSETS_BY_TYPE[t.id][0]; if (first && !ASSETS_BY_TYPE[t.id].find(a => a.value === value)) onChange(first.value); }}
                  className={`py-1.5 px-2 text-[11px] font-medium rounded-md transition-all ${assetType === t.id ? 'bg-emerald-500/15 text-emerald-600' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="relative mb-2">
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); }}
                placeholder="Search symbols..."
                className="w-full px-3 py-2 pl-9 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50"
              />
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
              {displayList.length === 0 && !isSearching ? (
                <div className="px-3 py-6 text-center text-xs text-gray-500">No symbols found</div>
              ) : (
                displayList.slice(0, 20).map((a) => (
                  <button
                    key={a.value}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { onChange(a.value); setSearch(''); setShowAssetDropdown(false); }}
                    className={`w-full text-left px-3 py-2 text-sm flex justify-between items-center gap-2 hover:bg-gray-50 transition-colors ${value === a.value ? 'bg-emerald-500/10 text-emerald-600' : 'text-gray-900'}`}
                  >
                    <span className="font-medium truncate">{assetType === 'forex' ? a.label : a.value}</span>
                    {assetType !== 'forex' && a.label !== a.value && <span className="text-gray-500 text-xs truncate">{a.label}</span>}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Asset Type Tabs - 2x2 grid */}
      <div className="grid grid-cols-3 gap-0.5 p-0.5 bg-gray-800 rounded-lg mb-2">
        {ASSET_TYPES.map(t => (
          <button
            key={t.id}
            onClick={() => {
              setAssetType(t.id);
              setSearch('');
              setShowAssetDropdown(false);
              const first = ASSETS_BY_TYPE[t.id][0];
              if (first && !assets.find(a => a.value === value)) onChange(first.value);
            }}
            className={`min-h-6 flex items-center justify-center py-1 px-1.5 text-[10px] font-medium rounded transition-all duration-150 ${
              assetType === t.id
                ? 'bg-gray-700 text-emerald-400 shadow-sm'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700/50'
            }`}
            title={t.label}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Asset Symbol Selector */}
      <div className="relative">
        <input
          type="text"
          value={showAssetDropdown ? search : displayValue}
          onChange={(e) => {
            setSearch(e.target.value);
            setShowAssetDropdown(true);
          }}
          onFocus={() => setShowAssetDropdown(true)}
          onBlur={() => setTimeout(() => setShowAssetDropdown(false), 200)}
          placeholder="Search or select..."
          className="pg-input font-medium"
        />
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
        {showAssetDropdown && (
          <div className="pg-dropdown max-h-52 overflow-y-auto">
            {displayList.length === 0 && !isSearching ? (
              <div className="px-3 py-4 text-xs text-gray-500 text-center">No symbols found</div>
            ) : (
              displayList.slice(0, 20).map((a) => (
                <button
                  key={a.value}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(a.value);
                    setSearch('');
                    setShowAssetDropdown(false);
                  }}
                  className={`pg-dropdown-item ${value === a.value ? 'pg-dropdown-item-active' : 'text-gray-200'}`}
                >
                  <span className="font-medium">
                    {assetType === 'forex' ? a.label : a.value}
                  </span>
                  {assetType !== 'forex' && a.label !== a.value && (
                    <span className="text-gray-500 text-xs truncate ml-2">{a.label}</span>
                  )}
                  {assetType === 'forex' && <span className="text-gray-500 text-xs truncate ml-2">{a.value}</span>}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
