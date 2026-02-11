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

    // Attach access token to every request
    this.client.interceptors.request.use((config) => {
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return config;
    });

    // Intercept 401 responses and attempt a silent token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        // Only attempt refresh once per request, and skip for auth endpoints
        if (
          error.response?.status === 401 &&
          !originalRequest._retry &&
          this.refreshToken &&
          !originalRequest.url?.includes('/auth/')
        ) {
          originalRequest._retry = true;

          try {
            // Deduplicate: reuse an in-flight refresh if one exists
            if (!this.refreshPromise) {
              this.refreshPromise = this._doRefresh();
            }
            const tokens = await this.refreshPromise;
            this.refreshPromise = null;

            // Update stored tokens
            this.accessToken = tokens.access_token;
            this.refreshToken = tokens.refresh_token;
            this.onTokenRefreshed?.(tokens);

            // Retry the original request with the new token
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

  /** Register callbacks so the auth store stays in sync */
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

  /** Internal: call the backend refresh endpoint */
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

  async deleteBacktest(id: number): Promise<void> {
    await this.client.delete(`/backtests/${id}`);
  }

  // Optimization
  async runOptimization(data: {
    strategy_id: number; symbol: string; start_date: string; end_date: string;
    initial_capital: number; commission: number; slippage: number;
    param_grid: Record<string, number[]>; interval?: string;
  }): Promise<{ task_id: string }> {
    const response = await this.client.post('/backtests/optimize', data);
    return response.data;
  }

  async getOptimizationResult(taskId: string): Promise<any> {
    const response = await this.client.get(`/backtests/optimize/${taskId}`);
    return response.data;
  }

  // Walk-Forward
  async runWalkForward(data: {
    strategy_id: number; symbol: string; start_date: string; end_date: string;
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
