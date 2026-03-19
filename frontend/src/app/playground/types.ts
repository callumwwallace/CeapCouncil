import type { BacktestTrade, EquityCurvePoint, DrawdownPoint } from '@/types';

export type BrokerPreset = 'custom' | 'robinhood' | 'ibkr' | 'alpaca' | 'etrade' | 'fidelity';

export interface BacktestConfig {
  symbol: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  slippage: number; // percentage (e.g. 0.1 = 0.1%)
  commission: number; // percentage (e.g. 0.1 = 0.1%)
  brokerPreset?: BrokerPreset;
  sizingMethod: 'full' | 'percent_equity' | 'fixed_shares' | 'fixed_dollar';
  sizingValue: number | null;
  stopLossPct: number | null;
  takeProfitPct: number | null;
  benchmarkSymbol: string | null;
  interval: '1d' | '1h' | '15m' | '5m' | '1m';
  // Advanced engine settings
  spreadModel: 'auto' | 'none' | 'volatility' | 'fixed_bps';
  slippageModel: 'percentage' | 'volume_aware' | 'auto' | 'none';
  marginEnabled: boolean;
  allowShortsWithoutMargin: boolean;
  leverage: number;
  maxDrawdownPct: number;
  maxPositionPct: number;
  warmupBars: number;
  pdtEnabled: boolean;
}

export interface BacktestResult {
  total_return: number;
  sharpe_ratio: number;
  max_drawdown: number;
  win_rate: number;
  total_trades: number;
  final_value: number;
  initial_capital: number;
  // Trade-level data from backend
  trades: BacktestTrade[];
  equity_curve: EquityCurvePoint[];
  drawdown_series: DrawdownPoint[];
  // Extended metrics
  sortino_ratio?: number;
  profit_factor?: number;
  avg_trade_duration?: number;
  max_consecutive_losses?: number;
  calmar_ratio?: number;
  exposure_pct?: number;
  benchmark_return?: number;
  orders?: Array<{
    order_id: string; symbol: string; side: string; order_type: string;
    quantity: number; filled_quantity: number; avg_fill_price: number;
    commission: number; status: string; created_at: string | null; filled_at: string | null;
  }>;
  expectancy?: number;
  volatility_annual?: number;
  information_ratio?: number;
  beta?: number;
  alpha?: number;
  total_commission?: number;
  total_slippage?: number;
  total_spread_cost?: number;
  cost_as_pct_of_pnl?: number;
  total_funding_paid?: number;
  total_funding_received?: number;
  net_funding?: number;
  rolling_sharpe?: Array<{date: string; value: number}>;
  rolling_sortino?: Array<{date: string; value: number}>;
  var_95?: number;
  cvar_95?: number;
  var_99?: number;
  cvar_99?: number;
  deflated_sharpe_ratio?: number;
  robustness_score?: number;
  risk_violations?: Array<{timestamp: string; rule: string; description: string; action: string}>;
  custom_charts?: Record<string, Array<{date: string; series: string; value: number}>>;
  alerts?: Array<{timestamp: string; level: string; message: string; data?: unknown}>;
}

export const SYMBOLS = [
  { value: 'AAPL', label: 'Apple Inc.' },
  { value: 'MSFT', label: 'Microsoft' },
  { value: 'GOOGL', label: 'Alphabet' },
  { value: 'AMZN', label: 'Amazon' },
  { value: 'TSLA', label: 'Tesla' },
  { value: 'META', label: 'Meta Platforms' },
  { value: 'NVDA', label: 'NVIDIA' },
  { value: 'AMD', label: 'AMD' },
  { value: 'NFLX', label: 'Netflix' },
  { value: 'SPY', label: 'S&P 500 ETF' },
  { value: 'QQQ', label: 'Nasdaq ETF' },
  { value: 'DIS', label: 'Walt Disney' },
  { value: 'BA', label: 'Boeing' },
  { value: 'JPM', label: 'JPMorgan Chase' },
  { value: 'GS', label: 'Goldman Sachs' },
  { value: 'GLD', label: 'Gold ETF' },
  { value: 'SLV', label: 'Silver ETF' },
  { value: 'TLT', label: 'Treasury Bond ETF' },
  { value: 'BTC-USD', label: 'Bitcoin' },
  { value: 'ETH-USD', label: 'Ethereum' },
  // Forex (yfinance format: CURRENCYPAIR=X)
  { value: 'EURUSD=X', label: 'EUR/USD' },
  { value: 'GBPUSD=X', label: 'GBP/USD' },
  { value: 'USDJPY=X', label: 'USD/JPY' },
  { value: 'AUDUSD=X', label: 'AUD/USD' },
  { value: 'USDCAD=X', label: 'USD/CAD' },
  { value: 'USDCHF=X', label: 'USD/CHF' },
  { value: 'NZDUSD=X', label: 'NZD/USD' },
];

export const BROKER_PRESETS: Record<BrokerPreset, { commission: number; slippage: number; label: string }> = {
  custom: { commission: 0.1, slippage: 0.1, label: 'Custom' },
  robinhood: { commission: 0, slippage: 0.05, label: 'Robinhood (0% commission)' },
  ibkr: { commission: 0.02, slippage: 0.08, label: 'IBKR (low commission)' },
  alpaca: { commission: 0, slippage: 0.05, label: 'Alpaca (0% commission)' },
  etrade: { commission: 0.1, slippage: 0.1, label: 'E*TRADE' },
  fidelity: { commission: 0, slippage: 0.08, label: 'Fidelity (0% commission)' },
};
