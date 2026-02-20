import axios, { AxiosError, AxiosInstance } from 'axios';
import {
  User,
  Strategy,
  StrategyCreate,
  Backtest,
  BacktestCreate,
  Comment,
  Token,
  LoginCredentials,
  RegisterData,
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

    // Add access token to requests
    this.client.interceptors.request.use((config) => {
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

  async login(credentials: LoginCredentials): Promise<Token> {
    const formData = new URLSearchParams();
    formData.append('username', credentials.username);
    formData.append('password', credentials.password);
    
    const response = await this.client.post<Token>('/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return response.data;
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

  // Strategies
  async getStrategies(params?: { skip?: number; limit?: number; sort_by?: string }): Promise<Strategy[]> {
    const response = await this.client.get<Strategy[]>('/strategies', { params });
    return response.data;
  }

  async getMyStrategies(): Promise<Strategy[]> {
    const response = await this.client.get<Strategy[]>('/strategies/my');
    return response.data;
  }

  async getStrategy(id: number): Promise<Strategy> {
    const response = await this.client.get<Strategy>(`/strategies/${id}`);
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

  async createVersion(strategyId: number, message?: string): Promise<{version: number; message: string}> {
    const response = await this.client.post(`/strategies/${strategyId}/versions`, message != null ? { message } : {});
    return response.data;
  }

  async restoreVersion(strategyId: number, version: number): Promise<{message: string; code: string}> {
    const response = await this.client.post(`/strategies/${strategyId}/versions/${version}/restore`);
    return response.data;
  }

  async deleteVersion(strategyId: number, version: number): Promise<void> {
    await this.client.delete(`/strategies/${strategyId}/versions/${version}`);
  }

  async diffVersions(strategyId: number, v1: number, v2: number): Promise<{v1: number; v2: number; diff: string}> {
    const response = await this.client.get(`/strategies/${strategyId}/versions/${v1}/diff/${v2}`);
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
    strategy_id: number; symbol: string; start_date: string; end_date: string;
    initial_capital: number; commission: number; slippage: number;
    oos_ratio?: number; param_ranges?: Record<string, unknown>; n_trials?: number; interval?: string;
  }): Promise<{ task_id: string }> {
    const response = await this.client.post('/backtests/oos-validate', data);
    return response.data;
  }

  async getOptimizationResult(taskId: string): Promise<any> {
    const response = await this.client.get(`/backtests/optimize/${taskId}`);
    return response.data;
  }

  // Walk-Forward (strategy_id or code for templates)
  async runWalkForward(data: {
    strategy_id?: number; code?: string; symbol: string; start_date: string; end_date: string;
    initial_capital: number; commission: number; slippage: number;
    n_splits?: number; train_pct?: number; interval?: string;
  }): Promise<{ task_id: string }> {
    const response = await this.client.post('/backtests/walk-forward', data);
    return response.data;
  }

  async getWalkForwardResult(taskId: string): Promise<any> {
    const response = await this.client.get(`/backtests/walk-forward/${taskId}`);
    return response.data;
  }

  // Monte Carlo
  async runMonteCarlo(backtestId: number, data: { backtest_id: number; n_simulations?: number }): Promise<{ task_id: string }> {
    const response = await this.client.post(`/backtests/${backtestId}/monte-carlo`, data);
    return response.data;
  }

  async getMonteCarloResult(taskId: string): Promise<any> {
    const response = await this.client.get(`/backtests/monte-carlo/${taskId}`);
    return response.data;
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

  // Competitions
  async listCompetitions(status?: string): Promise<any[]> {
    const response = await this.client.get('/competitions', { params: status ? { status } : {} });
    return response.data;
  }

  async getCompetition(id: number): Promise<any> {
    const response = await this.client.get(`/competitions/${id}`);
    return response.data;
  }

  async createCompetition(data: any): Promise<any> {
    const response = await this.client.post('/competitions', data);
    return response.data;
  }

  async enterCompetition(competitionId: number, strategyId: number): Promise<any> {
    const response = await this.client.post(`/competitions/${competitionId}/enter`, { strategy_id: strategyId });
    return response.data;
  }

  async getLeaderboard(competitionId: number): Promise<any> {
    const response = await this.client.get(`/competitions/${competitionId}/leaderboard`);
    return response.data;
  }

  // Market Data
  async getMarketData(symbol: string, start: string, end: string, interval: string = '1d'): Promise<{
    symbol: string;
    data: { date: string; open: number; high: number; low: number; close: number; volume: number }[];
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
}

export const api = new ApiClient();
export default api;
