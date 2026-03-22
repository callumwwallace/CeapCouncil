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
  is_superuser?: boolean;
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

// Strategy group types
export interface StrategyGroup {
  id: number;
  name: string;
  description: string | null;
  user_id: number;
  is_default: boolean;
  share_token: string;
  is_shareable: boolean;
  created_at: string;
  updated_at: string;
}

export interface GroupEmbedResponse {
  id: number;
  name: string;
  share_token: string;
  author_username: string;
  strategy_count: number;
  strategies: Array<{ id: number; title: string; share_token: string; is_public: boolean }>;
}

export interface ForkGroupResponse {
  group: StrategyGroup;
  strategies: Strategy[];
  forked_count: number;
}

// Strategy types
export interface Strategy {
  id: number;
  share_token: string;
  title: string;
  description: string | null;
  code: string;
  parameters: Record<string, unknown>;
  is_public: boolean;
  author_id: number;
  group_id: number | null;
  group_name: string | null;
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
  group_id?: number | null;
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
  share_token: string;
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
  total_funding_paid?: number | null;
  total_funding_received?: number | null;
  net_funding?: number | null;
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

export interface BacktestEmbed {
  id: number;
  user_id: number;
  symbol: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
  parameters: Record<string, unknown>;
  status: BacktestStatus;
  total_return: number | null;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
  win_rate: number | null;
  total_trades: number | null;
  sortino_ratio: number | null;
  profit_factor: number | null;
  calmar_ratio: number | null;
  created_at: string;
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
  symbols?: string[] | null;
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

export interface UpcomingPreviewItem {
  thread_id: number | null;
  title: string;
  description: string | null;
  symbol: string;
  symbols?: string[] | null;
  ranking_metric: string;
  ranking_metrics?: string[] | null;
  start_date: string;
  end_date: string;
  backtest_start: string;
  backtest_end: string;
  initial_capital: number;
  vote_score: number;
  author_username: string | null;
  is_placeholder?: boolean;
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
  rank: number | null;
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

export interface Achievement {
  key: string;
  title: string;
  description: string;
  icon: string;
  category: 'strategy' | 'backtest' | 'competition' | 'community';
  earned: boolean;
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

export interface EquityCurveEntry {
  username: string;
  rank: number | null;
  total_return: number | null;
  equity_curve: { date: string; equity: number }[];
}

export interface EquityCurvesResponse {
  competition_id: number;
  curves: EquityCurveEntry[];
}

// Proposal & Voting types
export interface CompetitionProposal {
  id: number;
  title: string;
  description: string | null;
  symbol: string;
  backtest_start: string;
  backtest_end: string;
  initial_capital: number;
  ranking_metric: string;
  ranking_metrics?: string[] | null;
  vote_count: number;
  user_voted: boolean;
  created_by_username: string | null;
  created_at: string;
}

export interface ProposalsResponse {
  week_year: number;
  week_number: number;
  votes_remaining: number;
  proposals: CompetitionProposal[];
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
  vote_score?: number;
  your_vote?: number | null;
  is_pinned?: boolean;
  proposal_data?: {
    symbol: string;
    symbols?: string[];
    backtest_start: string;
    backtest_end: string;
    initial_capital: number;
    ranking_metric: string;
    ranking_metrics?: string[] | null;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface ForumThreadDetail {
  id: number;
  topic_id: number;
  author_id: number;
  author_username: string;
  author_avatar_url?: string | null;
  title: string;
  post_count: number;
  vote_score?: number;
  your_vote?: number | null;
  is_pinned?: boolean;
  proposal_data?: ForumThreadSummary['proposal_data'];
  created_at: string;
  updated_at: string;
  posts: ForumPostResponse[];
}

export interface ForumPostResponse {
  id: number;
  thread_id: number;
  author_id: number;
  author_username: string;
  author_avatar_url?: string | null;
  content: string;
  vote_score: number;
  your_vote: number | null;
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
  category?: string;
  message: string;
  link: string;
  actor_username: string;
  read_at: string | null;
  created_at: string;
  extra_data?: Record<string, unknown>;
}

export type NotificationCategory = 'competition' | 'forum' | 'strategy' | 'system';

export type GroupedNotifications = Record<NotificationCategory, NotificationResponse[]>;

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
  comment_count?: number;
}

export interface BlogPostDetail extends BlogPostSummary {
  content: string;
  updated_at: string;
}

export interface BlogComment {
  id: number;
  blog_post_id: number;
  author_id: number;
  author_username: string;
  author_avatar_url: string | null;
  content: string;
  parent_id: number | null;
  created_at: string | null;
  updated_at: string | null;
}

// Follow types
export interface FollowStats {
  follower_count: number;
  following_count: number;
  is_following: boolean;
}

export interface FollowUser {
  id: number;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface FeedItem {
  type: 'strategy' | 'competition_entry' | 'thread' | 'post';
  id: number;
  title: string;
  description: string | null;
  username: string;
  user_id: number;
  created_at: string | null;
  link: string;
  extra: Record<string, unknown>;
}

// Endorsement types
export interface SkillEndorsement {
  skill: string;
  label: string;
  count: number;
  endorsed_by_you: boolean;
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

// Analytics result types

export interface OptimizeResults {
  status?: string;
  error?: string;
  results?: Array<{
    params: Record<string, number>;
    sharpe_ratio?: number;
    total_return?: number;
    max_drawdown?: number;
    [key: string]: unknown;
  }>;
  heatmap?: Array<{ x: number; y: number; value: number }>;
}

export interface WalkForwardResults {
  status?: string;
  error?: string;
  avg_oos_return?: number;
  windows?: Array<{ train_start: string; train_end: string; oos_start: string; oos_end: string; oos_return: number; oos_sharpe: number }>;
  splits?: Array<{ train_start: string; train_end: string; oos_start: string; oos_end: string; oos_return: number; oos_sharpe: number }>;
}

export interface OosResults {
  status?: string;
  error?: string;
  is_result?: { total_return: number; sharpe_ratio?: number } | null;
  is_period?: string;
  is_sharpe?: number | null;
  oos_result?: { total_return: number; sharpe_ratio?: number } | null;
  oos_period?: string;
  oos_sharpe?: number | null;
  n_folds?: number;
  oos_sharpe_mean?: number | null;
  oos_sharpe_std?: number | null;
  oos_return_mean?: number | null;
  oos_return_std?: number | null;
  multiple_testing_note?: string | null;
  overfit_score?: number | null;
  best_params?: Record<string, number> | null;
}

export interface MonteCarloResults {
  status?: string;
  error?: string;
  percentiles?: Record<string, number>;
}

export interface CpcvResults {
  status?: string;
  error?: string;
  valid_paths?: number;
  total_paths?: number;
  oos_sharpe_mean?: number | null;
  oos_sharpe_std?: number | null;
  oos_sharpe_median?: number | null;
  oos_return_mean?: number | null;
  train_sharpe_mean?: number | null;
  prob_oos_loss?: number | null;
  overfit_score?: number | null;
  paths?: Array<{ path_id: number; oos_sharpe: number; oos_return: number }>;
}

export interface FactorResults {
  status?: string;
  error?: string;
  alpha_significant?: boolean;
  alpha_annual_pct?: number | null;
  alpha_t_stat?: number | null;
  alpha_p_value?: number | null;
  r_squared?: number | null;
  strategy_annual_return_pct?: number | null;
  n_observations?: number | null;
  factors?: Array<{
    name: string;
    coefficient: number;
    t_stat: number;
    p_value: number;
    exposure_pct: number;
  }>;
}
