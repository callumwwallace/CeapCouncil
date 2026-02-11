'use client';

import { Calendar, DollarSign, TrendingUp } from 'lucide-react';

interface Config {
  symbol: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
}

interface ConfigPanelProps {
  config: Config;
  onChange: (config: Config) => void;
}

const POPULAR_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'SPY', 'QQQ', 'BTC-USD', 'ETH-USD'];

export default function ConfigPanel({ config, onChange }: ConfigPanelProps) {
  const updateConfig = (key: keyof Config, value: string | number) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <div className="bg-gray-800 px-4 py-4">
      <div className="flex flex-wrap items-end gap-4">
        {/* Symbol */}
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            <TrendingUp className="h-3 w-3 inline mr-1" />
            Symbol
          </label>
          <select
            value={config.symbol}
            onChange={(e) => updateConfig('symbol', e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:ring-emerald-500 focus:border-emerald-500"
          >
            {POPULAR_SYMBOLS.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol}
              </option>
            ))}
          </select>
        </div>

        {/* Start Date */}
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            <Calendar className="h-3 w-3 inline mr-1" />
            Start Date
          </label>
          <input
            type="date"
            value={config.startDate}
            onChange={(e) => updateConfig('startDate', e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        {/* End Date */}
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            <Calendar className="h-3 w-3 inline mr-1" />
            End Date
          </label>
          <input
            type="date"
            value={config.endDate}
            onChange={(e) => updateConfig('endDate', e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        {/* Initial Capital */}
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            <DollarSign className="h-3 w-3 inline mr-1" />
            Initial Capital
          </label>
          <input
            type="number"
            value={config.initialCapital}
            onChange={(e) => updateConfig('initialCapital', parseFloat(e.target.value) || 10000)}
            min={100}
            step={1000}
            className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
      </div>
    </div>
  );
}
