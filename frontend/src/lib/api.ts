import axios, { AxiosError, AxiosInstance } from 'axios';
import {
  User,
  Strategy,
  StrategyCreate,
  StrategyGroup,
  Backtest,
  BacktestCreate,
  Comment,
  Token,
  LoginCredentials,
  RegisterData,
  CompetitionSummary,
  CompetitionDetail,
  CompetitionCreate,
  LeaderboardResponse,
  Achievement,
  Badge,
  CompetitionHistoryEntry,
  BlogPostSummary,
  BlogPostDetail,
  BlogComment,
  ForumTopicResponse,
  ForumThreadSummary,
  ForumThreadDetail,
  ForumPostResponse,
  ForumActivityItem,
  ForumSearchResult,
  NotificationResponse,
  GroupedNotifications,
  FollowStats,
  FollowUser,
  FeedItem,
  SkillEndorsement,
  OptimizeResults,
  WalkForwardResults,
  OosResults,
  MonteCarloResults,
  CpcvResults,
  FactorResults,
} from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

class ApiClient {
  private client: AxiosInstance;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshPromise: Promise<Token> | null = null;
  private onTokenRefreshed: ((tokens: Token) => void) | null = null;
  private onRefreshFailed: (() => void) | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use((config) => {
      // Remove the baseURL override block completely
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return config;
    });

    // On 401, try token refresh and retry
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        // Attempt refresh once; skip auth endpoints
        if (
          error.response?.status === 401 &&
          !originalRequest._retry &&
          this.refreshToken &&
          !originalRequest.url?.includes('/auth/')
        ) {
          originalRequest._retry = true;

          try {
            // Reuse in-flight refresh if one exists
            if (!this.refreshPromise) {
              this.refreshPromise = this._doRefresh();
            }
            const tokens = await this.refreshPromise;
            this.refreshPromise = null;

            // Store new tokens
            this.accessToken = tokens.access_token;
            this.refreshToken = tokens.refresh_token;
            this.onTokenRefreshed?.(tokens);

            // Retry with new token
            originalRequest.headers.Authorization = `Bearer ${tokens.access_token}`;
            return this.client(originalRequest);
          } catch {
            this.refreshPromise = null;
            this.onRefreshFailed?.();
            return Promise.reject(error);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  /** Register auth callbacks */
  onAuthChange(
    onRefreshed: (tokens: Token) => void,
    onFailed: () => void,
  ) {
    this.onTokenRefreshed = onRefreshed;
    this.onRefreshFailed = onFailed;
  }

  setToken(token: string | null) {
    this.accessToken = token;
  }

  setRefreshToken(token: string | null) {
    this.refreshToken = token;
  }

  /** Call backend /auth/refresh */
  private async _doRefresh(): Promise<Token> {
    const response = await this.client.post<Token>('/auth/refresh', {
      refresh_token: this.refreshToken,
    });
    return response.data;
  }

  // Auth
  async register(data: RegisterData): Promise<User> {
    const response = await this.client.post<User>('/auth/register', data);
    return response.data;
  }

  async login(
    credentials: LoginCredentials
  ): Promise<Token | { requires_2fa: true; pending_token: string }> {
    const formData = new URLSearchParams();
    formData.append('username', credentials.username);
    formData.append('password', credentials.password);

    const response = await this.client.post<Token | { requires_2fa: true; pending_token: string }>(
      '/auth/login',
      formData,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );
    return response.data;
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    const response = await this.client.post<{ message: string }>('/auth/verify-email', { token });
    return response.data;
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const response = await this.client.post<{ message: string }>('/auth/resend-verification', { email });
    return response.data;
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const response = await this.client.post<{ message: string }>('/auth/forgot-password', { email });
    return response.data;
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const response = await this.client.post<{ message: string }>('/auth/reset-password', {
      token,
      new_password: newPassword,
    });
    return response.data;
  }

  async totpVerify(pendingToken: string, code: string): Promise<Token> {
    const response = await this.client.post<Token>('/auth/totp/verify', {
      pending_token: pendingToken,
      code,
    });
    return response.data;
  }

  async totpStatus(): Promise<{ totp_enabled: boolean }> {
    const response = await this.client.get<{ totp_enabled: boolean }>('/auth/totp/status');
    return response.data;
  }

  async totpSetup(): Promise<{ qr_uri: string; secret: string }> {
    const response = await this.client.post<{ qr_uri: string; secret: string }>('/auth/totp/setup');
    return response.data;
  }

  async totpConfirm(code: string): Promise<{ recovery_codes: string[]; message: string }> {
    const response = await this.client.post<{ recovery_codes: string[]; message: string }>('/auth/totp/confirm', {
      code,
    });
    return response.data;
  }

  async totpDisable(password: string, code: string): Promise<{ message: string }> {
    const response = await this.client.post<{ message: string }>('/auth/totp/disable', {
      password,
      code,
    });
    return response.data;
  }

  async logout(refreshToken: string | null): Promise<void> {
    try {
      await this.client.post('/auth/logout', {
        refresh_token: refreshToken,
      });
    } catch {
      // best-effort
    }
  }

  // Users
  async getCurrentUser(): Promise<User> {
    const response = await this.client.get<User>('/users/me');
    return response.data;
  }

  async getUserByUsername(username: string): Promise<User> {
    const response = await this.client.get<User>(`/users/${username}`);
    return response.data;
  }

  async updateCurrentUser(data: { full_name?: string; bio?: string; avatar_url?: string }): Promise<User> {
    const response = await this.client.patch<User>('/users/me', data);
    return response.data;
  }

  async uploadAvatar(file: File): Promise<User> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.client.post<User>('/users/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async changeEmail(newEmail: string, currentPassword: string): Promise<User> {
    const response = await this.client.patch<User>('/users/me/email', {
      new_email: newEmail,
      current_password: currentPassword,
    });
    return response.data;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    const response = await this.client.patch<{ message: string }>('/users/me/password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return response.data;
  }

  async deleteAccount(): Promise<void> {
    await this.client.delete('/users/me');
  }

  async updateNotificationPreferences(data: { notify_on_mention?: boolean; email_on_mention?: boolean; email_marketing?: boolean }): Promise<User> {
    const response = await this.client.patch<User>('/users/me/notification-preferences', data);
    return response.data;
  }

  async getUserStrategyCount(username: string): Promise<{ count: number }> {
    const response = await this.client.get<{ count: number }>(`/users/${username}/strategy-count`);
    return response.data;
  }

  async getUserRep(username: string): Promise<{ score: number; your_vote: number | null }> {
    const response = await this.client.get<{ score: number; your_vote: number | null }>(`/users/${username}/rep`);
    return response.data;
  }

  async giveRep(username: string, value: 1 | -1): Promise<{ score: number; your_vote: number }> {
    const response = await this.client.post<{ score: number; your_vote: number }>(`/users/${username}/rep`, { value });
    return response.data;
  }

  // Strategy groups
  async getStrategyGroups(): Promise<StrategyGroup[]> {
    const response = await this.client.get<StrategyGroup[]>('/strategy-groups');
    return response.data;
  }

  async createStrategyGroup(data: { name: string; description?: string | null }): Promise<StrategyGroup> {
    const response = await this.client.post<StrategyGroup>('/strategy-groups', data);
    return response.data;
  }

  async updateStrategyGroup(id: number, data: { name?: string; description?: string | null; is_shareable?: boolean }): Promise<StrategyGroup> {
    const response = await this.client.patch<StrategyGroup>(`/strategy-groups/${id}`, data);
    return response.data;
  }

  async getGroupByToken(shareToken: string): Promise<import('@/types').GroupEmbedResponse> {
    const response = await this.client.get<import('@/types').GroupEmbedResponse>(`/strategy-groups/embed/${shareToken}`);
    return response.data;
  }

  async forkGroup(shareToken: string): Promise<import('@/types').ForkGroupResponse> {
    const response = await this.client.post<import('@/types').ForkGroupResponse>(`/strategy-groups/embed/${shareToken}/fork`);
    return response.data;
  }

  async deleteStrategyGroup(id: number): Promise<void> {
    await this.client.delete(`/strategy-groups/${id}`);
  }

  // Strategies
  async getStrategies(params?: { skip?: number; limit?: number; sort_by?: string }): Promise<Strategy[]> {
    const response = await this.client.get<Strategy[]>('/strategies', { params });
    return response.data;
  }

  async getMyStrategies(params?: { group_id?: number }): Promise<Strategy[]> {
    const response = await this.client.get<Strategy[]>('/strategies/my', { params });
    return response.data;
  }

  async getStrategy(id: number): Promise<Strategy> {
    const response = await this.client.get<Strategy>(`/strategies/${id}`);
    return response.data;
  }

  async getStrategyByToken(shareToken: string): Promise<Strategy> {
    const response = await this.client.get<Strategy>(`/strategies/embed/${shareToken}`);
    return response.data;
  }

  async createStrategy(data: StrategyCreate): Promise<Strategy> {
    const response = await this.client.post<Strategy>('/strategies', data);
    return response.data;
  }

  async updateStrategy(id: number, data: Partial<StrategyCreate>): Promise<Strategy> {
    const response = await this.client.patch<Strategy>(`/strategies/${id}`, data);
    return response.data;
  }

  async deleteStrategy(id: number): Promise<void> {
    await this.client.delete(`/strategies/${id}`);
  }

  async validateStrategy(code: string): Promise<{
    valid: boolean;
    errors: { line: number | null; message: string; severity: string }[];
    warnings: { line: number | null; message: string; severity: string }[];
  }> {
    const response = await this.client.post('/strategies/validate', { code });
    return response.data;
  }

  async forkStrategy(id: number): Promise<Strategy> {
    const response = await this.client.post<Strategy>(`/strategies/${id}/fork`);
    return response.data;
  }

  // Backtests
  async getBacktests(): Promise<Backtest[]> {
    const response = await this.client.get<Backtest[]>('/backtests');
    return response.data;
  }

  async getBacktest(id: number): Promise<Backtest> {
    const response = await this.client.get<Backtest>(`/backtests/${id}`);
    return response.data;
  }

  async createBacktest(data: BacktestCreate): Promise<Backtest> {
    const response = await this.client.post<Backtest>('/backtests', data);
    return response.data;
  }

  async createBacktestWithCode(data: Omit<BacktestCreate, 'strategy_id'> & { code: string }): Promise<Backtest> {
    const response = await this.client.post<Backtest>('/backtests/with-code', data);
    return response.data;
  }

  async getBacktestEmbed(shareToken: string): Promise<import('@/types').BacktestEmbed> {
    const response = await this.client.get<import('@/types').BacktestEmbed>(`/backtests/embed/${shareToken}`);
    return response.data;
  }

  async deleteBacktest(id: number): Promise<void> {
    await this.client.delete(`/backtests/${id}`);
  }

  // Optimization (strategy_id or code for templates)
  async runOptimization(data: {
    strategy_id?: number; code?: string; symbol: string; start_date: string; end_date: string;
    initial_capital: number; commission: number; slippage: number;
    param_grid: Record<string, number[]>; constraints?: Record<string, number>; interval?: string;
  }): Promise<{ task_id: string }> {
    const response = await this.client.post('/backtests/optimize', data);
    return response.data;
  }

  async runBayesianOptimization(data: {
    strategy_id?: number; code?: string; symbol: string; start_date: string; end_date: string;
    initial_capital: number; commission: number; slippage: number;
    param_ranges: Record<string, {low: number; high: number; step?: number; type?: string}>;
    n_trials?: number; objective_metric?: string; constraints?: Record<string, number>; interval?: string;
  }): Promise<{ task_id: string }> {
    const response = await this.client.post('/backtests/optimize/bayesian', data);
    return response.data;
  }

  async runGeneticOptimization(data: {
    strategy_id?: number; code?: string; symbol: string; start_date: string; end_date: string;
    initial_capital: number; commission: number; slippage: number;
    param_ranges: Record<string, {low: number; high: number; step?: number; type?: string}>;
    population_size?: number; n_generations?: number; objective_metric?: string;
    constraints?: Record<string, number>; interval?: string;
  }): Promise<{ task_id: string }> {
    const response = await this.client.post('/backtests/optimize/genetic', data);
    return response.data;
  }

  async runMultiObjectiveOptimization(data: {
    strategy_id?: number; code?: string; symbol: string; start_date: string; end_date: string;
    initial_capital: number; commission: number; slippage: number;
    param_ranges: Record<string, {low: number; high: number; step?: number; type?: string}>;
    n_trials?: number; objective_metrics?: string[]; directions?: string[];
    constraints?: Record<string, number>; interval?: string;
  }): Promise<{ task_id: string }> {
    const response = await this.client.post('/backtests/optimize/multiobjective', data);
    return response.data;
  }

  async runHeatmap(data: {
    strategy_id?: number; code?: string; symbol: string; start_date: string; end_date: string;
    initial_capital: number; commission: number; slippage: number;
    param_x: string; param_y: string;
    x_range: {low: number; high: number; steps: number};
    y_range: {low: number; high: number; steps: number};
    metric?: string; constraints?: Record<string, number>; interval?: string;
  }): Promise<{ task_id: string }> {
    const response = await this.client.post('/backtests/optimize/heatmap', data);
    return response.data;
  }

  // Strategy version control
  async listVersions(strategyId: number, skip = 0, limit = 20): Promise<Array<{id: number; version: number; commit_message: string | null; created_at: string | null; code_preview: string}>> {
    const response = await this.client.get(`/strategies/${strategyId}/versions`, { params: { skip, limit } });
    return response.data;
  }

  async getVersion(strategyId: number, version: number): Promise<{version: number; code: string; parameters: Record<string, unknown>; created_at: string | null}> {
    const response = await this.client.get(`/strategies/${strategyId}/versions/${version}`);
    return response.data;
  }

  async createVersion(strategyId: number, message: string): Promise<{version: number; message: string}> {
    const response = await this.client.post(`/strategies/${strategyId}/versions`, { message });
    return response.data;
  }

  async restoreVersion(strategyId: number, version: number): Promise<Strategy> {
    const response = await this.client.post<Strategy>(`/strategies/${strategyId}/versions/${version}/restore`);
    return response.data;
  }

  /** Revert (Git-style): restore to version and create new commit. History preserved. */
  async revertToVersion(strategyId: number, version: number): Promise<Strategy> {
    const response = await this.client.post<Strategy>(`/strategies/${strategyId}/versions/${version}/revert`);
    return response.data;
  }

  async deleteVersion(strategyId: number, version: number): Promise<void> {
    await this.client.delete(`/strategies/${strategyId}/versions/${version}`);
  }

  async diffVersions(strategyId: number, v1: number, v2: number): Promise<{v1: number; v2: number; diff: string}> {
    const response = await this.client.get(`/strategies/${strategyId}/versions/${v1}/diff/${v2}`);
    return response.data;
  }

  async diffVersionWorking(strategyId: number, version: number): Promise<{v1: number; v2: string; diff: string}> {
    const response = await this.client.get(`/strategies/${strategyId}/versions/${version}/diff-working`);
    return response.data;
  }

  // Batch runner
  async runBatch(data: {
    strategies: Array<{name: string; code: string; params: Record<string, unknown>}>;
    symbol: string; start_date: string; end_date: string;
    initial_capital: number; commission: number; slippage: number; interval?: string;
  }): Promise<{ task_id: string }> {
    const response = await this.client.post('/backtests/batch', data);
    return response.data;
  }

  // Out-of-sample validation
  async runOosValidation(data: {
    strategy_id?: number; code?: string; symbol: string; start_date: string; end_date: string;
    initial_capital: number; commission: number; slippage: number;
    oos_ratio?: number; n_folds?: number; param_ranges?: Record<string, unknown>; n_trials?: number; interval?: string;
  }): Promise<{ task_id: string }> {
    const response = await this.client.post('/backtests/oos-validate', data);
    return response.data;
  }

  async getOosResult(taskId: string): Promise<OosResults & { status: string }> {
    const response = await this.client.get(`/backtests/oos-validate/${taskId}`);
    return response.data;
  }

  async getOptimizationResult(taskId: string): Promise<OptimizeResults & { status: string }> {
    const response = await this.client.get(`/backtests/optimize/${taskId}`);
    return response.data;
  }

  // Walk-Forward (strategy_id or code for templates)
  async runWalkForward(data: {
    strategy_id?: number; code?: string; symbol: string; start_date: string; end_date: string;
    initial_capital: number; commission: number; slippage: number;
    n_splits?: number; train_pct?: number; purge_bars?: number; window_mode?: 'rolling' | 'anchored';
    interval?: string;
  }): Promise<{ task_id: string }> {
    const response = await this.client.post('/backtests/walk-forward', data);
    return response.data;
  }

  async getWalkForwardResult(taskId: string): Promise<WalkForwardResults & { status: string }> {
    const response = await this.client.get(`/backtests/walk-forward/${taskId}`);
    return response.data;
  }

  // Monte Carlo
  async runMonteCarlo(backtestId: number, data: { backtest_id: number; n_simulations?: number }): Promise<{ task_id: string }> {
    const response = await this.client.post(`/backtests/${backtestId}/monte-carlo`, data);
    return response.data;
  }

  async getMonteCarloResult(taskId: string): Promise<MonteCarloResults & { status: string }> {
    const response = await this.client.get(`/backtests/monte-carlo/${taskId}`);
    return response.data;
  }

  // CPCV (Combinatorial Purged Cross-Validation)
  async runCpcv(data: {
    strategy_id?: number; code?: string; symbol: string; start_date: string; end_date: string;
    initial_capital: number; commission: number; slippage: number;
    n_groups?: number; n_test_groups?: number; purge_bars?: number; embargo_bars?: number;
    param_ranges?: Record<string, unknown>; n_trials?: number; interval?: string;
  }): Promise<{ task_id: string }> {
    const response = await this.client.post('/backtests/cpcv', data);
    return response.data;
  }

  async getCpcvResult(taskId: string): Promise<CpcvResults & { status: string }> {
    const response = await this.client.get(`/backtests/cpcv/${taskId}`);
    return response.data;
  }

  // Factor Attribution
  async runFactorAttribution(backtestId: number): Promise<{ task_id: string }> {
    const response = await this.client.post(`/backtests/${backtestId}/factor-attribution`);
    return response.data;
  }

  async getFactorAttributionResult(taskId: string): Promise<FactorResults & { status: string }> {
    const response = await this.client.get(`/backtests/factor-attribution/${taskId}`);
    return response.data;
  }

  // Competitions / Leaderboard
  async listCompetitions(status?: string): Promise<CompetitionSummary[]> {
    const response = await this.client.get<CompetitionSummary[]>('/competitions', { params: status ? { status } : {} });
    return response.data;
  }

  async getUpcomingPreview(): Promise<import('@/types').UpcomingPreviewItem[]> {
    const response = await this.client.get<import('@/types').UpcomingPreviewItem[]>('/competitions/upcoming-preview');
    return response.data;
  }

  async getCompetition(id: number): Promise<CompetitionDetail> {
    const response = await this.client.get<CompetitionDetail>(`/competitions/${id}`);
    return response.data;
  }

  async getLeaderboard(competitionId: number): Promise<LeaderboardResponse> {
    const response = await this.client.get<LeaderboardResponse>(`/competitions/${competitionId}/leaderboard`);
    return response.data;
  }

  async getCompetitionEquityCurves(competitionId: number): Promise<import('@/types').EquityCurvesResponse> {
    const response = await this.client.get(`/competitions/${competitionId}/equity-curves`);
    return response.data;
  }

  async enterCompetition(competitionId: number, strategyId: number): Promise<{ id: number; status: string; message?: string }> {
    const response = await this.client.post(`/competitions/${competitionId}/enter`, { strategy_id: strategyId });
    return response.data;
  }

  async createCompetition(data: CompetitionCreate): Promise<{ id: number; title: string; status: string }> {
    const response = await this.client.post('/competitions', data);
    return response.data;
  }

  async updateCompetitionStatus(competitionId: number, status: string): Promise<{ status: string }> {
    const response = await this.client.patch(`/competitions/${competitionId}/status`, { status });
    return response.data;
  }

  async getMyBadges(): Promise<Badge[]> {
    const response = await this.client.get<Badge[]>('/users/me/badges');
    return response.data;
  }

  async getUserBadges(username: string): Promise<Badge[]> {
    const response = await this.client.get<Badge[]>(`/users/${username}/badges`);
    return response.data;
  }

  async getUserAchievements(username: string): Promise<Achievement[]> {
    const response = await this.client.get<Achievement[]>(`/users/${encodeURIComponent(username)}/achievements`);
    return response.data;
  }

  async getUserForumStats(username: string): Promise<{ thread_count: number; post_count: number }> {
    const response = await this.client.get<{ thread_count: number; post_count: number }>(
      `/users/${username}/forum-stats`
    );
    return response.data;
  }

  async getUserForumActivity(username: string, limit?: number): Promise<ForumActivityItem[]> {
    const response = await this.client.get<ForumActivityItem[]>(`/users/${username}/forum-activity`, {
      params: { limit: limit ?? 10 },
    });
    return response.data;
  }

  async getUserCompetitionHistory(username: string): Promise<CompetitionHistoryEntry[]> {
    const response = await this.client.get<CompetitionHistoryEntry[]>(`/users/${username}/competition-history`);
    return response.data;
  }

  // Forum
  async searchForumThreads(params: {
    q?: string;
    sections?: string[];
    date_from?: string;
    date_to?: string;
    posted_by?: string;
    skip?: number;
    limit?: number;
  }): Promise<ForumSearchResult[]> {
    const searchParams: Record<string, string | number | undefined> = {};
    if (params.q) searchParams.q = params.q;
    if (params.sections?.length) searchParams.sections = params.sections.join(',');
    if (params.date_from) searchParams.date_from = params.date_from;
    if (params.date_to) searchParams.date_to = params.date_to;
    if (params.posted_by) searchParams.posted_by = params.posted_by;
    if (params.skip != null) searchParams.skip = params.skip;
    if (params.limit != null) searchParams.limit = params.limit;
    const response = await this.client.get<ForumSearchResult[]>('/forum/search', { params: searchParams });
    return response.data;
  }

  async listForumTopics(): Promise<ForumTopicResponse[]> {
    const response = await this.client.get<ForumTopicResponse[]>('/forum/topics');
    return response.data;
  }

  async listForumThreads(
    slug: string,
    params?: { sort_by?: 'updated_at' | 'created_at' | 'vote_score'; skip?: number; limit?: number }
  ): Promise<ForumThreadSummary[]> {
    const response = await this.client.get<ForumThreadSummary[]>(
      '/forum/topics/' + encodeURIComponent(slug) + '/threads',
      {
        params: {
          sort_by: params?.sort_by ?? 'updated_at',
          skip: params?.skip ?? 0,
          limit: params?.limit ?? 50,
        },
      }
    );
    return response.data;
  }

  async createForumThread(slug: string, title: string, body: string): Promise<ForumThreadSummary> {
    const response = await this.client.post<ForumThreadSummary>('/forum/topics/' + encodeURIComponent(slug) + '/threads', {
      title,
      body,
    });
    return response.data;
  }

  async createProposalThread(
    slug: string,
    data: {
      title: string;
      body: string;
      symbol?: string;
      symbols?: string[];
      backtest_start: string;
      backtest_end: string;
      initial_capital?: number;
      ranking_metric?: string;
      ranking_metrics?: string[] | null;
    }
  ): Promise<ForumThreadSummary> {
    const response = await this.client.post<ForumThreadSummary>(
      '/forum/topics/' + encodeURIComponent(slug) + '/proposals',
      data
    );
    return response.data;
  }

  async voteForumThread(threadId: number, value: 1 | -1 | 0): Promise<{ vote_score: number; your_vote: number | null }> {
    const response = await this.client.post<{ vote_score: number; your_vote: number | null }>(
      `/forum/threads/${threadId}/vote`,
      { value }
    );
    return response.data;
  }

  async getForumThread(threadId: number): Promise<ForumThreadDetail> {
    const response = await this.client.get<ForumThreadDetail>(`/forum/threads/${threadId}`);
    return response.data;
  }

  async createForumPost(threadId: number, content: string): Promise<ForumPostResponse> {
    const response = await this.client.post<ForumPostResponse>(`/forum/threads/${threadId}/posts`, { content });
    return response.data;
  }

  async updateForumPost(postId: number, content: string): Promise<ForumPostResponse> {
    const response = await this.client.patch<ForumPostResponse>(`/forum/posts/${postId}`, { content });
    return response.data;
  }

  async deleteForumPost(postId: number): Promise<void> {
    await this.client.delete(`/forum/posts/${postId}`);
  }

  async voteForumPost(postId: number, value: 1 | -1 | 0): Promise<{ vote_score: number; your_vote: number | null }> {
    const response = await this.client.post<{ vote_score: number; your_vote: number | null }>(
      `/forum/posts/${postId}/vote`,
      { value }
    );
    return response.data;
  }

  async togglePinThread(threadId: number): Promise<{ is_pinned: boolean }> {
    const response = await this.client.post<{ is_pinned: boolean }>(`/forum/threads/${threadId}/pin`);
    return response.data;
  }

  async getMyBacktests(): Promise<Backtest[]> {
    const response = await this.client.get<Backtest[]>('/backtests/me');
    return response.data;
  }

  // Notifications
  async getNotifications(params?: {
    unread_only?: boolean;
    category?: string;
    group_by?: 'category';
    skip?: number;
    limit?: number;
  }): Promise<NotificationResponse[] | GroupedNotifications> {
    const response = await this.client.get<NotificationResponse[] | GroupedNotifications>('/notifications', {
      params: params ?? {},
    });
    return response.data;
  }

  async getUnreadNotificationCount(): Promise<number> {
    const response = await this.client.get<{ count: number }>('/notifications/unread-count');
    return response.data.count;
  }

  async markNotificationRead(id: number): Promise<void> {
    await this.client.post(`/notifications/${id}/read`);
  }

  async markAllNotificationsRead(): Promise<void> {
    await this.client.post('/notifications/read-all');
  }

  async clearAllNotifications(): Promise<void> {
    await this.client.delete('/notifications/clear');
  }

  // Blog
  async listBlogPosts(limit?: number, offset?: number): Promise<BlogPostSummary[]> {
    const response = await this.client.get<BlogPostSummary[]>('/blog/', {
      params: { limit: limit ?? 20, offset: offset ?? 0 },
    });
    return response.data;
  }

  async getBlogPost(slug: string): Promise<BlogPostDetail> {
    const response = await this.client.get<BlogPostDetail>(`/blog/${slug}`);
    return response.data;
  }

  async listBlogComments(slug: string): Promise<BlogComment[]> {
    const response = await this.client.get<BlogComment[]>(`/blog/${encodeURIComponent(slug)}/comments`);
    return response.data;
  }

  async createBlogComment(slug: string, content: string, parentId?: number): Promise<BlogComment> {
    const response = await this.client.post<BlogComment>(
      `/blog/${encodeURIComponent(slug)}/comments`,
      { content, parent_id: parentId ?? null }
    );
    return response.data;
  }

  async deleteBlogComment(commentId: number): Promise<void> {
    await this.client.delete(`/blog/comments/${commentId}`);
  }

  async createBlogPost(data: { title: string; slug: string; excerpt?: string; content: string; published?: boolean }): Promise<BlogPostDetail> {
    const response = await this.client.post<BlogPostDetail>('/blog/', data);
    return response.data;
  }

  async updateBlogPost(slug: string, data: { title?: string; slug?: string; excerpt?: string; content?: string; published?: boolean }): Promise<BlogPostDetail> {
    const response = await this.client.patch<BlogPostDetail>(`/blog/${slug}`, data);
    return response.data;
  }

  async deleteBlogPost(slug: string): Promise<void> {
    await this.client.delete(`/blog/${slug}`);
  }

  // Social
  async vote(strategyId: number, value: number): Promise<void> {
    await this.client.post('/social/votes', { strategy_id: strategyId, value });
  }

  async getComments(strategyId: number): Promise<Comment[]> {
    const response = await this.client.get<Comment[]>(`/social/strategies/${strategyId}/comments`);
    return response.data;
  }

  async createComment(strategyId: number, content: string, parentId?: number): Promise<Comment> {
    const response = await this.client.post<Comment>('/social/comments', {
      strategy_id: strategyId,
      content,
      parent_id: parentId,
    });
    return response.data;
  }

  async deleteComment(id: number): Promise<void> {
    await this.client.delete(`/social/comments/${id}`);
  }

  // Tear sheet
  async getTearsheet(backtestId: number): Promise<string> {
    const response = await this.client.get(`/backtests/${backtestId}/tearsheet`, {
      responseType: 'text',
    });
    return response.data;
  }

  async getMonthlyReturns(backtestId: number): Promise<Array<{year: number; month: number; return_pct: number}>> {
    const response = await this.client.get(`/backtests/${backtestId}/monthly-returns`);
    return response.data;
  }

  async getTradeDistribution(backtestId: number): Promise<Array<{bin_center: number; count: number}>> {
    const response = await this.client.get(`/backtests/${backtestId}/trade-distribution`);
    return response.data;
  }

  // Market Data
  async getMarketData(symbol: string, start: string, end: string, interval: string = '1d'): Promise<{
    symbol: string;
    data: { date: string; open: number; high: number; low: number; close: number; volume: number }[];
    effective_interval?: string;
  }> {
    const response = await this.client.get('/market-data/ohlcv', {
      params: { symbol, start, end, interval },
    });
    return response.data;
  }

  async searchSymbols(query: string): Promise<{ results: string[] }> {
    const response = await this.client.get('/market-data/search', {
      params: { q: query },
    });
    return response.data;
  }

  // Follows
  async followUser(username: string): Promise<FollowStats> {
    const response = await this.client.post<FollowStats>(`/users/${username}/follow`);
    return response.data;
  }

  async unfollowUser(username: string): Promise<FollowStats> {
    const response = await this.client.delete<FollowStats>(`/users/${username}/follow`);
    return response.data;
  }

  async getFollowStats(username: string): Promise<FollowStats> {
    const response = await this.client.get<FollowStats>(`/users/${username}/follow-stats`);
    return response.data;
  }

  async getFollowers(username: string, skip?: number, limit?: number): Promise<FollowUser[]> {
    const response = await this.client.get<FollowUser[]>(`/users/${username}/followers`, {
      params: { skip: skip ?? 0, limit: limit ?? 50 },
    });
    return response.data;
  }

  async getFollowing(username: string, skip?: number, limit?: number): Promise<FollowUser[]> {
    const response = await this.client.get<FollowUser[]>(`/users/${username}/following`, {
      params: { skip: skip ?? 0, limit: limit ?? 50 },
    });
    return response.data;
  }

  async getFeed(skip?: number, limit?: number): Promise<FeedItem[]> {
    const response = await this.client.get<FeedItem[]>('/users/me/feed', {
      params: { skip: skip ?? 0, limit: limit ?? 20 },
    });
    return response.data;
  }

  // Skill Endorsements
  async getUserEndorsements(username: string): Promise<SkillEndorsement[]> {
    const response = await this.client.get<SkillEndorsement[]>(`/users/${username}/endorsements`);
    return response.data;
  }

  async endorseSkill(username: string, skill: string): Promise<{ skill: string; count: number; endorsed_by_you: boolean }> {
    const response = await this.client.post(`/users/${username}/endorsements`, { skill });
    return response.data;
  }

  async removeEndorsement(username: string, skill: string): Promise<{ skill: string; count: number; endorsed_by_you: boolean }> {
    const response = await this.client.delete(`/users/${username}/endorsements/${skill}`);
    return response.data;
  }
}

export const api = new ApiClient();
export default api;
