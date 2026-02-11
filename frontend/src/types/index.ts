// User types
export interface User {
  id: number;
  email: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
}

// Strategy types
export interface Strategy {
  id: number;
  title: string;
  description: string | null;
  code: string;
  parameters: Record<string, unknown>;
  is_public: boolean;
  author_id: number;
  vote_count: number;
  view_count: number;
  fork_count: number;
  forked_from_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface StrategyCreate {
  title: string;
  description?: string;
  code: string;
  parameters?: Record<string, unknown>;
  is_public?: boolean;
}

// Backtest types
export type BacktestStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface BacktestTrade {
  entry_date: string;
  exit_date: string;
  entry_price: number;
  exit_price: number;
  size: number;
  pnl: number;
  pnl_pct: number;
  commission: number;
  type: 'LONG' | 'SHORT';
}

export interface EquityCurvePoint {
  date: string;
  equity: number;
}

export interface DrawdownPoint {
  date: string;
  drawdown_pct: number;
}

export interface Backtest {
  id: number;
  strategy_id: number;
  user_id: number;
  symbol: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
  parameters: Record<string, unknown>;
  status: BacktestStatus;
  error_message: string | null;
  results: BacktestResults | null;
  total_return: number | null;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
  win_rate: number | null;
  total_trades: number | null;
  sortino_ratio: number | null;
  profit_factor: number | null;
  avg_trade_duration: number | null;
  max_consecutive_losses: number | null;
  calmar_ratio: number | null;
  exposure_pct: number | null;
  results_file_url: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface BacktestResults {
  final_value: number;
  initial_capital: number;
  total_return_pct: number;
  sharpe_ratio: number | null;
  max_drawdown_pct: number;
  total_trades: number;
  win_rate: number;
  trades: BacktestTrade[];
  equity_curve: EquityCurvePoint[];
  drawdown_series: DrawdownPoint[];
  benchmark_return: number | null;
  sortino_ratio: number | null;
  profit_factor: number | null;
  avg_trade_duration: number | null;
  max_consecutive_losses: number | null;
  calmar_ratio: number | null;
  exposure_pct: number | null;
}

export interface BacktestCreate {
  strategy_id: number;
  symbol: string;
  symbols?: string[] | null;
  start_date: string;
  end_date: string;
  initial_capital?: number;
  parameters?: Record<string, unknown>;
  slippage?: number;
  commission?: number;
  sizing_method?: string;
  sizing_value?: number | null;
  stop_loss_pct?: number | null;
  take_profit_pct?: number | null;
  benchmark_symbol?: string | null;
  interval?: string;
}

// Social types
export interface Vote {
  id: number;
  user_id: number;
  strategy_id: number;
  value: number;
  created_at: string;
}

export interface Comment {
  id: number;
  user_id: number;
  strategy_id: number;
  content: string;
  parent_id: number | null;
  created_at: string;
  updated_at: string;
}

// Auth types
export interface Token {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface LoginCredentials {
  username: string; // email
  password: string;
}

export interface RegisterData {
  email: string;
  username: string;
  password: string;
  full_name?: string;
}
