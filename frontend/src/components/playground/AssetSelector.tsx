'use client';

import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import api from '@/lib/api';

export type AssetType = 'stocks' | 'crypto' | 'indices';

export const ASSET_TYPES: { id: AssetType; label: string }[] = [
  { id: 'stocks', label: 'Stocks' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'indices', label: 'Indices & ETFs' },
];

const ASSETS_BY_TYPE: Record<AssetType, { value: string; label: string }[]> = {
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
};

function inferAssetType(symbol: string): AssetType {
  if (['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'ADA-USD', 'AVAX-USD', 'DOGE-USD', 'MATIC-USD', 'LINK-USD', 'UNI7083-USD'].includes(symbol)) {
    return 'crypto';
  }
  if (['SPY', 'QQQ', 'IWM', 'GLD', 'SLV', 'TLT', 'HYG', 'DIA'].includes(symbol)) {
    return 'indices';
  }
  return 'stocks';
}

interface AssetSelectorProps {
  value: string;
  onChange: (symbol: string) => void;
  className?: string;
  compact?: boolean;
}

export default function AssetSelector({ value, onChange, className = '', compact = false }: AssetSelectorProps) {
  const [assetType, setAssetType] = useState<AssetType>(() => inferAssetType(value));
  const [search, setSearch] = useState('');
  const [showAssetDropdown, setShowAssetDropdown] = useState(false);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const assets = ASSETS_BY_TYPE[assetType];
  const currentAsset = assets.find(a => a.value === value) || (value ? { value, label: value } : null);

  useEffect(() => {
    if (!search || search.length < 1) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.searchSymbols(search);
        setSearchResults(res.results || []);
      } catch {
        setSearchResults([]);
      }
      setIsSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const displayList = searchResults.length > 0
    ? searchResults.map(s => ({ value: s, label: s }))
    : assets.filter(a => !search || a.value.toUpperCase().includes(search.toUpperCase()) || a.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className={className}>
      {/* Asset Type Tabs */}
      <div className="flex gap-0.5 p-0.5 bg-gray-800 rounded-lg mb-2">
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
            className={`flex-1 px-2 py-1.5 text-[11px] font-medium rounded-md transition-all duration-150 ${
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
          value={showAssetDropdown ? search : (currentAsset?.value || value)}
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
                  <span className="font-medium">{a.value}</span>
                  {a.label !== a.value && <span className="text-gray-500 text-xs truncate ml-2">{a.label}</span>}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
