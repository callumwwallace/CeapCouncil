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
  notify_on_mention?: boolean;
  email_on_mention?: boolean;
  email_marketing?: boolean;
  created_at: string;
}

export interface NotificationPreferences {
  notify_on_mention: boolean;
  email_on_mention: boolean;
  email_marketing: boolean;
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
  slippage_cost?: number;
  spread_cost?: number;
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
  strategy_id: number | null;
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
  orders?: Array<{
    order_id: string;
    symbol: string;
    side: string;
    order_type: string;
    quantity: number;
    filled_quantity: number;
    avg_fill_price: number;
    commission: number;
    status: string;
    created_at: string | null;
    filled_at: string | null;
  }>;
  expectancy?: number | null;
  volatility_annual?: number | null;
  information_ratio?: number | null;
  beta?: number | null;
  alpha?: number | null;
  total_commission?: number | null;
  total_slippage?: number | null;
  total_spread_cost?: number | null;
  cost_as_pct_of_pnl?: number | null;
  rolling_sharpe?: Array<{date: string; value: number}> | null;
  rolling_sortino?: Array<{date: string; value: number}> | null;
  rolling_beta?: Array<{date: string; value: number}> | null;
  var_95?: number | null;
  cvar_95?: number | null;
  var_99?: number | null;
  cvar_99?: number | null;
  deflated_sharpe_ratio?: number | null;
  robustness_score?: number | null;
  risk_violations?: Array<{timestamp: string; rule: string; description: string; action: string}>;
  custom_charts?: Record<string, Array<{date: string; series: string; value: number}>>;
  alerts?: Array<{timestamp: string; level: string; message: string; data?: any}>;
}

export interface BacktestCreate {
  strategy_id?: number;  // Omit when passing inline code
  code?: string;  // Inline strategy code when no saved strategy
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

// Competition types
export interface CompetitionSummary {
  id: number;
  title: string;
  description: string | null;
  symbol: string;
  status: string;
  ranking_metric: string;
  ranking_metrics?: string[] | null;
  start_date: string;
  end_date: string;
  backtest_start: string;
  backtest_end: string;
  initial_capital: number;
  max_entries: number | null;
  entry_count: number;
  created_at: string;
}

export interface CompetitionDetail extends CompetitionSummary {
  rules: Record<string, unknown> | null;
}

export interface CompetitionCreate {
  title: string;
  description?: string;
  symbol: string;
  backtest_start: string;
  backtest_end: string;
  initial_capital?: number;
  ranking_metric?: string;
  ranking_metrics?: string[] | null;
  start_date: string;
  end_date: string;
  max_entries?: number;
  rules?: Record<string, unknown>;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: number;
  username: string;
  strategy_id: number;
  strategy_title: string;
  score: number | null;
  total_return: number | null;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
  win_rate: number | null;
  sortino_ratio: number | null;
  total_trades: number | null;
  evaluated_at: string | null;
  submitted_at: string | null;
}

export interface LeaderboardResponse {
  competition_id: number;
  title: string;
  ranking_metric: string;
  ranking_metrics?: string[] | null;
  leaderboard: LeaderboardEntry[];
}

export interface Badge {
  id: number;
  competition_title: string;
  badge_tier: string;
  rank: number | null;
  earned_at: string | null;
}

export interface CompetitionHistoryEntry {
  id: number;
  competition_id: number;
  competition_title: string;
  competition_status: string;
  strategy_id: number;
  strategy_title: string;
  rank: number | null;
  score: number | null;
  total_return: number | null;
  sharpe_ratio: number | null;
  submitted_at: string | null;
  evaluated_at: string | null;
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

// Forum types
export interface ForumTopicResponse {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  section: string;
  sort_order: number;
  thread_count: number;
  post_count: number;
  latest_thread: {
    id: number;
    title: string;
    author_username: string;
    updated_at: string | null;
    post_count: number;
  } | null;
}

export interface ForumThreadSummary {
  id: number;
  topic_id: number;
  author_id: number;
  author_username: string;
  title: string;
  post_count: number;
  created_at: string;
  updated_at: string;
}

export interface ForumThreadDetail {
  id: number;
  topic_id: number;
  author_id: number;
  author_username: string;
  title: string;
  post_count: number;
  created_at: string;
  updated_at: string;
  posts: ForumPostResponse[];
}

export interface ForumPostResponse {
  id: number;
  thread_id: number;
  author_id: number;
  author_username: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface ForumSearchResult {
  id: number;
  topic_id: number;
  topic_slug: string;
  topic_name: string;
  section: string;
  author_id: number;
  author_username: string;
  title: string;
  post_count: number;
  created_at: string;
  updated_at: string;
}

export interface NotificationResponse {
  id: number;
  type: string;
  message: string;
  link: string;
  actor_username: string;
  read_at: string | null;
  created_at: string;
}

export interface ForumActivityItem {
  type: 'thread' | 'post';
  id: number;
  topic_slug?: string;
  thread_id?: number;
  thread_title?: string;
  title?: string;
  content_preview?: string;
  created_at: string | null;
}

// Blog types
export interface BlogPostSummary {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  author: { id: number; username: string };
  published_at: string | null;
  created_at: string;
}

export interface BlogPostDetail extends BlogPostSummary {
  content: string;
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
